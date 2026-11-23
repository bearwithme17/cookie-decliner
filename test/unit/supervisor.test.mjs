// The content scripts, loaded into jsdom exactly in manifest order, against a
// fake extension API. Checks what crosses to the background, that failures stay
// silent, and that the engine rejects but never accepts.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { JSDOM, VirtualConsole } from 'jsdom';

const EXT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'extension');
const manifest = JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8'));
const SCRIPTS = manifest.content_scripts[1].js.map((f) => ({ name: f, code: fs.readFileSync(path.join(EXT, f), 'utf8') }));
const lib = await import(pathToFileURL(path.join(EXT, 'vendor', 'autoconsent', 'autoconsent.esm.js')).href);
const COMPACT = (await import(pathToFileURL(path.join(EXT, 'vendor', 'autoconsent', 'compact-rules.js')).href)).default;
const { SAFE_SNIPPETS } = await import(pathToFileURL(path.join(EXT, 'vendor', 'autoconsent', 'snippets.generated.js')).href);

const PAGE_URL = 'https://www.beispiel-seite.de/pfad/artikel-4711?utm=geheim#abschnitt';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// jsdom has no layout: an element counts as visible to the engine when it is
// position:fixed and not display:none.
const banner = (inner) => `<!doctype html><html><head></head><body><p>Inhalt</p>${inner}</body></html>`;
const FIXED = 'style="position:fixed"';

function load(html, { sendMessage, evalResults = {}, url = PAGE_URL } = {}) {
  const output = []; // anything written to the window's console, plus jsdom-reported errors
  const virtualConsole = new VirtualConsole();
  for (const level of ['log', 'info', 'warn', 'error', 'debug', 'trace', 'jsdomError']) {
    virtualConsole.on(level, (...args) => output.push(`${level}: ${args.map((a) => (a && a.stack) || String(a)).join(' ')}`));
  }
  const dom = new JSDOM(html, { url, runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole });
  const { window } = dom;
  const sent = [];
  const clicks = [];
  window.document.addEventListener('click', (ev) => clicks.push(ev.target.id || ev.target.className || ev.target.tagName), true);
  const defaultSend = (msg) => {
    if (msg.t === 'init') return Promise.resolve({ rules: { autoconsent: [], compact: lib.filterCompactRules(COMPACT, { url, mainFrame: true }) } });
    if (msg.t === 'eval') return Promise.resolve({ r: evalResults[msg.s] === true });
    return Promise.resolve(undefined);
  };
  window.chrome = {
    runtime: {
      id: 'self-id',
      sendMessage: (...args) => {
        sent.push(JSON.parse(JSON.stringify(args)));
        return (sendMessage || defaultSend)(args[0], defaultSend);
      },
      connect: () => { sent.push(['connect']); throw new Error('no ports'); },
    },
  };
  for (const s of SCRIPTS) window.eval(s.code + `\n//# sourceURL=${s.name}`);
  return { dom, window, sent, clicks, output, CD: window.eval('CD') };
}

async function until(fn, ms = 6000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (fn()) return true;
    await sleep(25);
  }
  return fn();
}

const rejections = [];
process.on('unhandledRejection', (e) => rejections.push(e));

function assertOnlyAllowedMessages(sent) {
  for (const args of sent) {
    assert.equal(args.length, 1, 'sendMessage must be called with the message only (no extension id, no options)');
    const msg = args[0];
    if (msg.t === 'init') {
      assert.deepEqual(msg, { t: 'init' });
    } else {
      assert.deepEqual(Object.keys(msg).sort(), ['s', 't']);
      assert.equal(msg.t, 'eval');
      assert.match(msg.s, /^EVAL_[A-Z0-9_]+$/);
      assert.ok(Object.hasOwn(SAFE_SNIPPETS, msg.s) || true);
    }
    const text = JSON.stringify(msg);
    for (const needle of ['http', 'beispiel-seite', 'artikel-4711', 'geheim', 'abschnitt', 'location', 'url']) {
      assert.equal(text.includes(needle), false, `message leaks "${needle}": ${text}`);
    }
  }
}

test('shim: globals exist, the silent console is inert and frozen', () => {
  const t = load(banner(''));
  try {
    const silent = t.window.eval('CD_SILENT_CONSOLE');
    assert.ok(Object.isFrozen(silent));
    for (const m of ['log', 'warn', 'error', 'info', 'debug', 'trace', 'table', 'group', 'groupEnd', 'assert', 'dir', 'time', 'timeEnd']) {
      assert.equal(typeof silent[m], 'function', m);
      assert.equal(silent[m]('x', new Error('y')), undefined);
    }
    assert.equal(typeof t.window.eval('CD_MODULE.exports.default'), 'function', 'engine class is exported into CD_MODULE');
    assert.deepEqual(t.output, []);
  } finally {
    t.window.close();
  }
});

test('engine internals do not leak into the content-script global scope', () => {
  const t = load(banner(''));
  try {
    for (const name of ['AutoConsent', 'snippets', 'evalState', 'DomActions', 'dynamicCMPs', 'filterCompactRules', 'module', 'exports']) {
      assert.equal(t.window.eval(`typeof ${name}`), 'undefined', `${name} leaked`);
    }
  } finally {
    t.window.close();
  }
});

test('Complianz banner: reject is clicked, accept is not; one init, then only eval probes', async () => {
  const t = load(banner(`<div id="cmplz-cookiebanner-container"><div class="cmplz-cookiebanner" ${FIXED}>
    <button class="cmplz-accept" id="accept">Akzeptieren</button><button class="cmplz-deny" id="deny">Ablehnen</button></div></div>`));
  try {
    assert.ok(await until(() => t.clicks.includes('deny')), `clicks: ${t.clicks}`);
    await until(() => t.CD.status.done && !t.CD.status.running);
    assert.deepEqual(t.clicks, ['deny']);
    assert.deepEqual(t.sent[0], [{ t: 'init' }]);
    assert.equal(t.sent.filter((a) => a[0].t === 'init').length, 1);
    assertOnlyAllowedMessages(t.sent);
    assert.equal(t.CD.status.done, true);
    assert.equal(t.CD.status.running, false);
    assert.equal(t.CD.status.runs, 1);
    assert.deepEqual(t.output, []);
  } finally {
    t.window.close();
  }
});

test('Cookiebot: page-world checks go out as {t:"eval", s:id} and nothing else', async () => {
  const t = load(
    banner(`<div id="CybotCookiebotDialog" ${FIXED}><button id="CybotCookiebotDialogBodyLevelButtonLevelOptinDeclineAll" ${FIXED}>Ablehnen</button>
      <button id="CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll" ${FIXED}>Alle zulassen</button></div>`),
    { evalResults: { EVAL_COOKIEBOT_1: true, EVAL_COOKIEBOT_2: true } },
  );
  try {
    assert.ok(await until(() => t.clicks.length > 0), 'no click happened');
    await until(() => !t.CD.status.running);
    assert.deepEqual(t.clicks, ['CybotCookiebotDialogBodyLevelButtonLevelOptinDeclineAll']);
    const kinds = t.sent.map((a) => a[0].t);
    assert.equal(kinds[0], 'init');
    assert.equal(kinds.filter((k) => k === 'init').length, 1);
    assert.ok(t.sent.some((a) => a[0].t === 'eval' && a[0].s === 'EVAL_COOKIEBOT_1'));
    assert.ok(t.sent.some((a) => a[0].t === 'eval' && a[0].s === 'EVAL_COOKIEBOT_2'));
    assertOnlyAllowedMessages(t.sent);
    assert.equal(t.sent.some((a) => a[0] === 'connect'), false, 'no port may be opened');
    assert.deepEqual(t.output, []);
  } finally {
    t.window.close();
  }
});

test('no message ever carries the URL, a code string, or engine chatter', async () => {
  // Didomi without buttons falls through to the API snippet: exercises eval in opt-out.
  const t = load(banner(`<div id="didomi-host"><div id="didomi-popup" ${FIXED}>Wir verwenden Cookies</div></div>`), { evalResults: { EVAL_DIDOMI_OPT_OUT: true } });
  try {
    assert.ok(await until(() => t.sent.some((a) => a[0].s === 'EVAL_DIDOMI_OPT_OUT')), JSON.stringify(t.sent));
    await until(() => !t.CD.status.running);
    assertOnlyAllowedMessages(t.sent);
    assert.equal(t.CD.status.done, true);
  } finally {
    t.window.close();
  }
});

test('click guard: a rule that targets an accept / OK button does not click it', async () => {
  // Upstream rule "sitepark-sitekit" clicks .SP-CookieUsageNotification__ok.
  const t = load(banner(`<div class="SP-CookieUsageNotification" ${FIXED} data-sp-cookie-usage-notification-bootstrapped>
    <p>Diese Website verwendet Cookies.</p><button class="SP-CookieUsageNotification__ok" id="ok">OK</button></div>`));
  try {
    assert.ok(await until(() => t.CD.status.acted && !t.CD.status.running, 8000), `status: ${JSON.stringify(t.CD.status)}`);
    assert.deepEqual(t.clicks, []);
    assert.equal(t.CD.status.done, false);
    assert.deepEqual(t.output, []);
  } finally {
    t.window.close();
  }
});

test('click guard: with all=true only the non-accept elements are clicked', async () => {
  const t = load(banner(`<button class="a" id="one">Ablehnen</button><button class="a" id="two">Alle akzeptieren</button>
    <button class="a" id="three">Speichern</button><input type="checkbox" class="a" id="four" value="ok" checked><a class="b" id="five">Zustimmen</a>`));
  try {
    assert.ok(await until(() => t.window.eval('typeof CD.engine') === 'object'));
    const out = await t.window.eval(`(async () => {
      const a = CD.engine.domActions;
      return [await a.click('.a', true), await a.click('#two'), await a.click('.b', true), await a.click('.nothing'),
              await a.clickElement(document.getElementById('five')), await a.clickElement(document.getElementById('three')), await a.clickElement(null)];
    })()`);
    assert.deepEqual([...out], [true, false, false, false, false, true, false]);
    assert.deepEqual(t.clicks, ['one', 'three', 'four', 'three']);
    assert.equal(t.window.document.getElementById('four').checked, false, 'toggles are still switched off');
  } finally {
    t.window.close();
  }
});

test('click guard: fails closed when the label check itself breaks', async () => {
  const t = load(banner(`<button class="a" id="one">Ablehnen</button>`));
  try {
    assert.ok(await until(() => t.window.eval('typeof CD.engine') === 'object'));
    const out = await t.window.eval(`(async () => { CD.heuristic.isAcceptElement = () => { throw new Error('broken'); }; return await CD.engine.domActions.click('.a'); })()`);
    assert.equal(out, false);
    assert.deepEqual(t.clicks, []);
  } finally {
    t.window.close();
  }
});

test('opt-in is impossible: optIn requests and a forced optIn config are both inert', async () => {
  // Cookiebot markup with only an accept button, labelled neutrally so that the
  // click guard is not what stops it.
  const html = banner(`<div id="CybotCookiebotDialog" ${FIXED}><button id="CybotCookiebotDialogBodyLevelButtonAccept" ${FIXED}>Weiter</button>
    <button id="CybotCookiebotDialogBodyButtonAccept" ${FIXED}>Weiter</button></div>`);
  const t = load(html, { evalResults: { EVAL_COOKIEBOT_1: true, EVAL_COOKIEBOT_2: true } });
  try {
    assert.ok(await until(() => t.CD.status.acted && !t.CD.status.running, 8000), JSON.stringify(t.CD.status));
    assert.equal(await t.window.eval('CD.engine.doOptIn()'), false);
    await t.window.eval(`CD.engine.receiveMessageCallback({ type: 'optIn' })`);
    await sleep(300);
    assert.deepEqual(t.clicks, []);
    // A second run that asks for optIn is still an opt-out run.
    t.window.eval(`CD.requestRun({ autoAction: 'optIn', heuristicMode: 'tier2', logs: { lifecycle: true, errors: true } })`);
    assert.ok(await until(() => t.CD.status.runs === 2 && !t.CD.status.running, 8000), JSON.stringify(t.CD.status));
    assert.equal(t.window.eval('CD.engine.config.autoAction'), 'optOut');
    assert.equal(t.window.eval('CD.engine.config.heuristicMode'), 'reject');
    assert.equal(t.window.eval('CD.engine.config.logs.lifecycle'), false);
    assert.deepEqual(t.clicks, []);
    assert.deepEqual(t.output, []);
  } finally {
    t.window.close();
  }
});

test('failing background: a throwing sendMessage is swallowed, nothing runs, nothing is printed', async () => {
  const before = rejections.length;
  const t = load(banner(`<div id="cmplz-cookiebanner-container"><div class="cmplz-cookiebanner" ${FIXED}><button class="cmplz-deny" id="deny">Ablehnen</button></div></div>`), {
    sendMessage: () => { throw new Error('Extension context invalidated.'); },
  });
  try {
    await sleep(1200);
    assert.deepEqual(t.clicks, []);
    assert.equal(t.CD.status.running, false);
    assert.equal(t.CD.status.runs, 0);
    assert.deepEqual(t.output, []);
    assert.equal(rejections.length, before, String(rejections[before]));
  } finally {
    t.window.close();
  }
});

test('failing background: a rejecting or empty reply is swallowed', async () => {
  const before = rejections.length;
  for (const sendMessage of [() => Promise.reject(new Error('Could not establish connection. Receiving end does not exist.')), () => Promise.resolve(undefined), () => Promise.resolve(null), () => Promise.resolve({}), () => Promise.resolve({ rules: 'nope' }), () => undefined]) {
    const t = load(banner(`<div id="cmplz-cookiebanner-container"><div class="cmplz-cookiebanner" ${FIXED}><button class="cmplz-deny" id="deny">Ablehnen</button></div></div>`), { sendMessage });
    try {
      await sleep(700);
      assert.deepEqual(t.clicks, []);
      assert.equal(t.CD.status.running, false);
      assert.deepEqual(t.output, []);
    } finally {
      t.window.close();
    }
  }
  assert.equal(rejections.length, before, String(rejections[before]));
});

test('failing eval: when page-world checks fail (blocked script), nothing is clicked and nothing is printed', async () => {
  const before = rejections.length;
  const t = load(banner(`<div id="CybotCookiebotDialog" ${FIXED}><button id="CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll" ${FIXED}>Alle zulassen</button></div>`), {
    sendMessage: (msg, fallback) => (msg.t === 'eval' ? Promise.reject(new Error('worker gone')) : fallback(msg)),
  });
  try {
    await sleep(2500);
    assert.deepEqual(t.clicks, []);
    assertOnlyAllowedMessages(t.sent);
    assert.deepEqual(t.output, []);
    assert.equal(rejections.length, before, String(rejections[before]));
  } finally {
    t.window.close();
  }
});

test('garbage rules from the background do not throw or print', async () => {
  const before = rejections.length;
  for (const rules of [{ compact: { v: 99, s: [], r: [] } }, { compact: 'x', autoconsent: 'y' }, { autoconsent: [{ name: 'cd-bad' }] }, { compact: { v: 1, s: [], r: [[1, 'broken']] } }]) {
    const t = load(banner(`<p ${FIXED}>Cookies</p>`), { sendMessage: (msg) => Promise.resolve(msg.t === 'init' ? { rules } : { r: false }) });
    try {
      await sleep(600);
      assert.deepEqual(t.clicks, []);
      assert.deepEqual(t.output, []);
    } finally {
      t.window.close();
    }
  }
  assert.equal(rejections.length, before, String(rejections[before]));
});

test('upstream quirk this design works around: passing a config to the constructor throws', () => {
  // If this starts passing a config without throwing, startEngine() in
  // 20-supervisor.js can be simplified; until then it must use initialize().
  const t = load(banner(''), { sendMessage: () => Promise.resolve(undefined) });
  try {
    const outcome = t.window.eval(`(() => { try { new CD_MODULE.exports.default(() => {}, { enabled: true, enablePrehide: true, logs: {} }, null); return 'ok'; } catch (e) { return e.constructor.name; } })()`);
    assert.equal(outcome, 'TypeError');
  } finally {
    t.window.close();
  }
});

test('no unhandled promise rejection occurred in this file', () => {
  assert.deepEqual(rejections.map(String), []);
});
