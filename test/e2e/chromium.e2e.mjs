// End-to-end test: loads extension/ unpacked into Playwright's bundled Chromium
// and drives it against the local fixtures.
//
//   node test/e2e/chromium.e2e.mjs            headless
//   CD_HEADED=1 node test/e2e/chromium.e2e.mjs   with a window
//   CD_ONLY=onetrust,plain node ...           subset of fixtures
//
// Asserts, for every fixture: rejected where a reject path exists, never accepted;
// plus the Sec-GPC header on every request kind, navigator.globalPrivacyControl,
// zero console output from pages and the extension's worker, no request leaving
// the two local test origins, nothing written to extension storage, and no
// script activity once a run is over.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { startServer } from './server.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
// CD_EXT_DIR points the test at another copy of the extension (used to check
// that a deliberately broken copy makes these assertions fail).
const EXT = process.env.CD_EXT_DIR ? path.resolve(process.env.CD_EXT_DIR) : path.join(ROOT, 'extension');
const HEADED = process.env.CD_HEADED === '1';
const ONLY = process.env.CD_ONLY ? process.env.CD_ONLY.split(',') : null;

// ---- tiny assertion collector ------------------------------------------
const results = [];
function check(name, ok, info = '') {
  results.push({ name, ok: Boolean(ok), info });
  process.stdout.write(`${ok ? 'ok    ' : 'NOT OK'} ${name}${!ok && info ? `\n         ${info}` : ''}\n`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- fixtures ------------------------------------------------------------
// expect: 'rejected'  -> a "rejected" event must arrive
//         'untouched' -> neither accepted nor rejected (nor subscribed) within `settle` ms
const FIXTURES = [
  { name: 'onetrust', expect: 'rejected', extra: checkOneTrust },
  { name: 'onetrust-settings', expect: 'rejected', extra: checkOneTrustSettings },
  { name: 'cookiebot', expect: 'rejected' },
  { name: 'sourcepoint', expect: 'rejected', extra: checkSourcepointTop },
  { name: 'sourcepoint-manager', expect: 'rejected' },
  { name: 'usercentrics', expect: 'rejected' },
  { name: 'consentmanager', expect: 'rejected', extra: checkConsentmanagerApi },
  { name: 'didomi', expect: 'rejected' },
  { name: 'borlabs', expect: 'rejected' },
  { name: 'complianz', expect: 'rejected' },
  { name: 'generic-de', expect: 'rejected' },
  { name: 'generic-de-notwendige', expect: 'rejected' },
  { name: 'sourcepoint-wall', expect: 'untouched', settle: 9000, extra: checkSourcepointTop },
  { name: 'accept-only', expect: 'untouched', settle: 16000 },
  { name: 'accept-rule', expect: 'untouched', settle: 9000 },
  { name: 'blocked-onetrust', expect: 'untouched', settle: 16000, idle: true, status: { runs: 1, running: false } },
  { name: 'blocked-usercentrics', expect: 'untouched', settle: 16000, idle: true, status: { runs: 1, running: false, acted: false, done: false } },
  { name: 'plain', expect: 'untouched', settle: 16000, idle: true, extra: checkGpcProperty },
  // A page that never stops changing: the single run must still come to an end.
  { name: 'busy', expect: 'untouched', settle: 16000, status: { runs: 1, running: false, acted: false, done: false } },
].filter((f) => !ONLY || ONLY.includes(f.name));
if (FIXTURES.length === 0) {
  process.stdout.write(`CD_ONLY=${process.env.CD_ONLY} selects no fixture\n`);
  process.exit(1);
}

async function checkOneTrust(page, server, name) {
  const ev = server.eventsFor(name);
  check(`${name}: reject click came after the SDK was ready (not lost)`, ev.indexOf('sdk-ready') !== -1 && ev.indexOf('sdk-ready') < ev.indexOf('rejected'), ev.join(','));
  check(`${name}: page state shows only the necessary group`, (await page.evaluate(() => window.OnetrustActiveGroups)) === ',C0001,');
}
async function checkOneTrustSettings(page, server, name) {
  const ev = server.eventsFor(name);
  const saved = server.events.find((e) => e.fixture === name && e.event === 'rejected');
  check(`${name}: went through settings, then saved`, ev.indexOf('settings') !== -1 && ev.indexOf('settings') < ev.indexOf('rejected'), ev.join(','));
  check(`${name}: every optional toggle was off when saving`, saved && Array.isArray(saved.detail?.stillOn) && saved.detail.stillOn.length === 0, JSON.stringify(saved?.detail));
}
async function checkConsentmanagerApi(_page, server, name) {
  // {api:true} is only reported when __cmp('setConsent', 0) ran in the page's own
  // world, i.e. the eval round trip through the background works.
  const e = server.events.find((x) => x.fixture === name && x.event === 'rejected');
  check(`${name}: rejected through the page-world API (MAIN-world eval works)`, e && e.detail?.api === true, JSON.stringify(e?.detail));
}
async function checkSourcepointTop(page, _server, name) {
  // The top frame cannot reach into the cross-origin message; it hides the
  // container and removes the scroll lock.
  const ok = await page
    .waitForFunction(() => {
      const c = document.querySelector("div[id^='sp_message_container_']");
      return !document.documentElement.classList.contains('sp-message-open') && c && getComputedStyle(c).visibility === 'hidden';
    }, null, { timeout: 8000 })
    .then(() => true, () => false);
  check(`${name}: top frame hid the message container and removed the scroll lock`, ok);
}
async function checkGpcProperty(page, _server, name) {
  check(`${name}: navigator.globalPrivacyControl === true (top frame)`, (await page.evaluate(() => navigator.globalPrivacyControl)) === true);
  const child = page.frames().find((f) => f.url().endsWith('/fixtures/frame-child.html'));
  check(`${name}: navigator.globalPrivacyControl === true (cross-origin child frame)`, child && (await child.evaluate(() => navigator.globalPrivacyControl)) === true);
  check(`${name}: the page's own inline script saw true at parse time`, child && (await child.evaluate(() => document.getElementById('gpc').textContent)) === 'true');
  // Frames: a normal-sized child frame gets its own engine run, a 1x1 pixel frame does not.
  const pixel = page.frames().find((f) => f.url().includes('frame-child.html?pixel=1'));
  const childStatus = child ? await contentScriptStatus(context, child).catch((e) => ({ error: e.message })) : null;
  const pixelStatus = pixel ? await contentScriptStatus(context, pixel).catch((e) => ({ error: e.message })) : null;
  check(`${name}: the engine ran once in the 300x200 child frame`, childStatus && childStatus.runs === 1, JSON.stringify(childStatus));
  check(`${name}: the engine did not start in the 1x1 pixel frame`, pixelStatus && pixelStatus.runs === 0 && pixelStatus.running === false, JSON.stringify(pixelStatus));
  const desc = await page.evaluate(() => {
    const d = Object.getOwnPropertyDescriptor(Navigator.prototype, 'globalPrivacyControl');
    return d ? { get: typeof d.get, set: typeof d.set, own: Object.hasOwn(navigator, 'globalPrivacyControl') } : null;
  });
  check(`${name}: property is a getter on Navigator.prototype`, desc && desc.get === 'function' && desc.own === false, JSON.stringify(desc));
}

// CD.status as the extension's own content script sees it, read through the
// DevTools protocol from the extension's isolated world. Takes a page (its top
// frame) or a cross-origin child frame.
async function contentScriptStatus(context, pageOrFrame) {
  const cdp = await context.newCDPSession(pageOrFrame);
  const contexts = [];
  cdp.on('Runtime.executionContextCreated', (e) => contexts.push(e.context));
  await cdp.send('Runtime.enable');
  await sleep(200);
  const { frameTree } = await cdp.send('Page.getFrameTree');
  const mine = contexts.find((c) => c.name === 'Cookie Decliner' && c.auxData?.type === 'isolated' && c.auxData?.frameId === frameTree.frame.id);
  let status = null;
  if (mine) {
    const r = await cdp.send('Runtime.evaluate', { contextId: mine.id, expression: 'JSON.stringify(CD.status)', returnByValue: true });
    status = r.result?.value ? JSON.parse(r.result.value) : null;
  }
  await cdp.detach().catch(() => {});
  return status;
}

// Script time spent in the page's renderer over `ms`, in milliseconds.
async function scriptTimeOver(context, page, ms) {
  const cdp = await context.newCDPSession(page);
  await cdp.send('Performance.enable');
  const read = async () => {
    const { metrics } = await cdp.send('Performance.getMetrics');
    return Object.fromEntries(metrics.map((m) => [m.name, m.value]));
  };
  const a = await read();
  await sleep(ms);
  const b = await read();
  await cdp.detach().catch(() => {});
  return { script: (b.ScriptDuration - a.ScriptDuration) * 1000, task: (b.TaskDuration - a.TaskDuration) * 1000 };
}

// ---- run -----------------------------------------------------------------
const server = await startServer();
// Chrome compiles rules/gpc.json into <extension>/_metadata/. Remove it again
// afterwards unless it was already there, so the source folder stays as it was.
const metadataDir = path.join(EXT, '_metadata');
const hadMetadata = fs.existsSync(metadataDir);
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cd-e2e-'));
const consoleMessages = []; // anything any page or worker printed
const pageErrors = [];
const workerOutput = []; // console calls, exceptions and log entries of the extension's worker
let workerAttachments = 0;
const foreignRequests = []; // requests to anything but the two test origins / the extension itself
// Sourcepoint serves its messages from privacy-mgmt.com; the test browser
// resolves that name to the local fixture server.
const spFrameOrigin = `http://cdn.privacy-mgmt.com:${new URL(server.frameOrigin).port}`;
const localHosts = new Set([new URL(server.origin).host, new URL(server.frameOrigin).host, new URL(spFrameOrigin).host]);
let context;
let exitCode = 1;

try {
  context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chromium',
    headless: !HEADED,
    args: [
      `--disable-extensions-except=${EXT}`,
      `--load-extension=${EXT}`,
      // Nothing outside this machine is reachable from the test browser.
      '--host-resolver-rules=MAP cdn.privacy-mgmt.com 127.0.0.1, MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1',
    ],
  });

  // Everything the extension's service worker emits, straight from the DevTools
  // protocol: console calls, uncaught exceptions, and browser-generated log
  // entries such as "Error in event handler" (Playwright's worker console event
  // does not carry the last two). Attaches to every incarnation of the worker.
  const cdp = await context.browser().newBrowserCDPSession();
  let cdpId = 0;
  cdp.on('Target.receivedMessageFromTarget', (e) => {
    const m = JSON.parse(e.message);
    if (m.method === 'Log.entryAdded') workerOutput.push(`log ${m.params.entry.level}: ${m.params.entry.text}`);
    else if (m.method === 'Runtime.exceptionThrown') workerOutput.push(`exception: ${m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text}`);
    else if (m.method === 'Runtime.consoleAPICalled') workerOutput.push(`console.${m.params.type}: ${m.params.args.map((a) => a.value ?? a.description).join(' ')}`);
  });
  cdp.on('Target.targetCreated', async (e) => {
    if (e.targetInfo.type !== 'service_worker' || !e.targetInfo.url.startsWith('chrome-extension://')) return;
    try {
      const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: e.targetInfo.targetId, flatten: false });
      // Both domains replay what was emitted before the attach.
      for (const method of ['Runtime.enable', 'Log.enable']) {
        await cdp.send('Target.sendMessageToTarget', { sessionId, message: JSON.stringify({ id: ++cdpId, method }) });
      }
      workerAttachments++;
    } catch {
      // The worker was already gone again.
    }
  });
  await cdp.send('Target.setDiscoverTargets', { discover: true });

  const onConsole = (where) => (msg) => consoleMessages.push(`[${where}] ${msg.type()}: ${msg.text()}`);
  context.on('console', onConsole('page'));
  context.on('weberror', (e) => pageErrors.push(String(e.error()?.stack || e.error())));
  context.on('request', (req) => {
    const u = new URL(req.url());
    if (['chrome-extension:', 'chrome:', 'data:', 'blob:', 'about:'].includes(u.protocol)) return;
    if (!localHosts.has(u.host)) foreignRequests.push(req.url());
  });
  const workers = new Set();
  const attachWorker = (w) => {
    workers.add(w);
    w.on('console', onConsole('worker'));
  };
  context.on('serviceworker', attachWorker);
  context.serviceWorkers().forEach(attachWorker);

  // The extension's worker starts on install. Its URL gives the extension id.
  let sw = context.serviceWorkers().find((w) => w.url().startsWith('chrome-extension://'));
  if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 15000 }).catch(() => null);
  check('extension loaded: background service worker is running (dual-key module background accepted)', Boolean(sw), 'no chrome-extension:// service worker appeared');
  if (!sw) throw new Error('extension did not load');
  const extensionId = new URL(sw.url()).host;
  check('background worker script is background.js', sw.url() === `chrome-extension://${extensionId}/background.js`, sw.url());

  const blank = context.pages()[0] || (await context.newPage());

  // What the browser itself says about the installed extension. (Its lists of
  // install warnings and manifest errors are not checked: in this Chromium they
  // stay empty even for a manifest with a made-up key, so they prove nothing.)
  const extPage = await context.newPage();
  await extPage.goto('chrome://extensions/');
  const record = await extPage.evaluate(
    (id) => new Promise((resolve) => chrome.developerPrivate.getExtensionInfo(id, (i) => resolve({ state: i.state, location: i.location, hostAccess: i.permissions?.runtimeHostPermissions?.hostAccess }))),
    extensionId,
  );
  check('browser: extension is enabled with host access on all sites', record.state === 'ENABLED' && record.hostAccess === 'ON_ALL_SITES', JSON.stringify(record));
  await extPage.close();

  // All fixtures in parallel, one tab each.
  await Promise.all(
    FIXTURES.map(async (fx) => {
      const page = await context.newPage();
      page.on('pageerror', (e) => pageErrors.push(`${fx.name}: ${e.stack || e}`));
      const started = Date.now();
      await page.goto(`${server.origin}/fixtures/${fx.name}.html?frame=${encodeURIComponent(server.frameOrigin)}`, { waitUntil: 'domcontentloaded' });
      const decided = () => server.eventsFor(fx.name).some((e) => e === 'rejected' || e === 'accepted' || e === 'subscribed');
      if (fx.expect === 'rejected') {
        await server.waitFor(() => server.eventsFor(fx.name).includes('rejected'), 30000);
        const ev = server.eventsFor(fx.name);
        check(`${fx.name}: rejected`, ev.includes('rejected'), `events: ${ev.join(',') || '(none)'}`);
        fx.tookMs = Date.now() - started;
        await sleep(2500); // anything the engine does afterwards is still recorded
      } else {
        await server.waitFor(decided, fx.settle);
        const ev = server.eventsFor(fx.name);
        check(`${fx.name}: left untouched (no accept, no reject, no subscribe)`, !decided(), `events: ${ev.join(',')}`);
      }
      if (fx.extra) await fx.extra(page, server, fx.name);
      if (fx.status) {
        const status = await contentScriptStatus(context, page);
        const ok = status && Object.entries(fx.status).every(([k, v]) => status[k] === v);
        check(`${fx.name}: the run has ended (${JSON.stringify(fx.status)})`, ok, `status: ${JSON.stringify(status)}`);
      }
      if (fx.idle) {
        const spent = await scriptTimeOver(context, page, 4000);
        fx.idleMs = spent;
        check(`${fx.name}: no script activity once the run is over (<20 ms in 4 s)`, spent.script < 20, `script ${spent.script.toFixed(1)} ms, task ${spent.task.toFixed(1)} ms`);
      }
      check(`${fx.name}: never accepted`, !server.eventsFor(fx.name).includes('accepted') && !server.eventsFor(fx.name).includes('subscribed'), server.eventsFor(fx.name).join(','));
      await page.close();
    }),
  );

  // ---- Sec-GPC on every kind of request --------------------------------
  if (FIXTURES.some((f) => f.name === 'plain')) {
    const byDest = {};
    for (const r of server.requests) (byDest[r.dest || '(none)'] ||= []).push(r);
    for (const dest of ['document', 'iframe', 'script', 'style', 'image', 'empty']) {
      const list = byDest[dest] || [];
      check(`Sec-GPC: 1 on every "${dest}" request (${list.length} seen)`, list.length > 0 && list.every((r) => r.gpc === '1'), JSON.stringify(list.filter((r) => r.gpc !== '1').slice(0, 3)));
    }
    const posts = server.requests.filter((r) => r.method === 'POST');
    check(`Sec-GPC: 1 on every POST (${posts.length} seen)`, posts.length > 0 && posts.every((r) => r.gpc === '1'));
    const frameHost = new URL(server.frameOrigin).host;
    const cross = server.requests.filter((r) => r.host === frameHost);
    check(`Sec-GPC: 1 on every request to the second origin (${cross.length} seen)`, cross.length > 0 && cross.every((r) => r.gpc === '1'));
  }
  const missing = server.requests.filter((r) => r.gpc !== '1');
  check(`Sec-GPC: 1 on all ${server.requests.length} requests the server received`, missing.length === 0, JSON.stringify(missing.slice(0, 5)));

  // ---- zero-log checks ---------------------------------------------------
  check('no fixture ever reported "accepted" or "subscribed"', !server.events.some((e) => e.event === 'accepted' || e.event === 'subscribed'), JSON.stringify(server.events.filter((e) => e.event === 'accepted' || e.event === 'subscribed')));
  check('fixture server saw only known fixture routes', server.unknown.length === 0, server.unknown.join(' | '));
  check('no request left the two local test origins', foreignRequests.length === 0, foreignRequests.slice(0, 5).join(' | '));
  check('zero uncaught errors in any page or content script', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
  check('zero console messages from pages, content scripts and the worker', consoleMessages.length === 0, consoleMessages.slice(0, 5).join(' | '));
  check(`zero console calls, exceptions or error-log entries in the extension worker (attached ${workerAttachments}x)`, workerAttachments > 0 && workerOutput.length === 0, workerOutput.slice(0, 4).join(' | '));

  // Positive control for the console check above: the listeners must be able to see
  // output from the worker and from a content-script-visible page at all.
  const live = [...workers].filter((w) => w.url().startsWith('chrome-extension://')).pop();
  const before = consoleMessages.length;
  await blank.goto(`${server.origin}/fixtures/frame-child.html`);
  await blank.evaluate(() => console.log('cd-probe-page'));
  let workerProbe = 'no live worker';
  try {
    const current = context.serviceWorkers().find((w) => w.url().startsWith('chrome-extension://')) || live;
    await current.evaluate(() => console.log('cd-probe-worker'));
    workerProbe = 'sent';
  } catch (e) {
    workerProbe = `evaluate failed: ${e.message}`;
  }
  await sleep(500);
  const probes = consoleMessages.slice(before);
  check('control: page console output is observable by this test', probes.some((m) => m.includes('cd-probe-page')), probes.join(' | '));
  check('control: worker console output is observable by this test', probes.some((m) => m.includes('cd-probe-worker')) && workerOutput.some((m) => m.includes('cd-probe-worker')), `${workerProbe}; got: ${probes.join(' | ')} / ${workerOutput.join(' | ')}`);

  // ---- pay-or-accept wall: hidden, never accepted, wiped when its tab closes ----
  const worker = () => context.serviceWorkers().find((w) => w.url().startsWith('chrome-extension://'));
  const inWorker = async (fn) => {
    for (let i = 0; i < 3; i++) {
      try {
        const w = worker() || (await context.waitForEvent('serviceworker', { timeout: 3000 }));
        return await w.evaluate(fn);
      } catch (e) {
        await sleep(300);
      }
    }
    return { error: 'worker not reachable' };
  };
  if (!ONLY) {
    const frameQ = `?frame=${encodeURIComponent(spFrameOrigin)}`;
    // The wipe waits for the LAST tab of a site, so no other tab of the first origin may be open.
    for (const p of context.pages()) if (p.url().startsWith(server.origin)) await p.close();
    await sleep(1500);

    // The same wall markup in a frame of an unrelated site (an ad, an embed)
    // must not mark the embedding site.
    const adPage = await context.newPage();
    await adPage.goto(`${server.origin}/fixtures/sourcepoint-wall.html?frame=${encodeURIComponent(server.frameOrigin)}&fixture=wipe-ad`, { waitUntil: 'domcontentloaded' });
    await sleep(3000);
    const session0 = await inWorker(() => chrome.storage.session.get(null));
    check('wall: a third-party frame cannot mark the embedding site', !session0.error && Object.keys(session0.w || {}).length === 0, JSON.stringify(session0));
    await adPage.close();
    await sleep(500);
    const wallPage = await context.newPage();
    await wallPage.goto(`${server.origin}/fixtures/sourcepoint-wall.html${frameQ}&fixture=wipe-wall`, { waitUntil: 'domcontentloaded' });
    await wallPage.evaluate(() => { document.cookie = 'cdwall=1; max-age=3600; path=/'; localStorage.setItem('cdwall', '1'); });
    const otherPage = await context.newPage();
    await otherPage.goto(`${server.frameOrigin}/fixtures/plain.html`, { waitUntil: 'domcontentloaded' });
    await otherPage.evaluate(() => { document.cookie = 'cdother=1; max-age=3600; path=/'; localStorage.setItem('cdother', '1'); });
    const hidden = await wallPage
      .waitForFunction(() => {
        const c = document.querySelector("div[id^='sp_message_container_']");
        const cs = c && getComputedStyle(c);
        return cs && (cs.display === 'none' || cs.visibility === 'hidden') && getComputedStyle(document.body).overflow !== 'hidden';
      }, null, { timeout: 8000 })
      .then(() => true, () => false);
    check('wall: container hidden and page scrollable', hidden);
    await sleep(1500);
    const session1 = await inWorker(() => chrome.storage.session.get(null));
    check('wall: the tab is remembered in the session area only, as site "localhost"', (() => { const v = Object.values(session1.w || {}); return v.length === 1 && v[0].s === 'localhost' && v[0].wall === true && v[0].c === '0' && JSON.stringify(v[0].o) === JSON.stringify([new URL(server.origin).origin]) && Object.keys(v[0]).length === 4; })(), JSON.stringify(session1));
    const names = async (origin) => (await context.cookies(origin)).map((c) => c.name);
    check('wall: cookies still present while the tab is open', (await names(server.origin)).includes('cdwall') && (await names(server.frameOrigin)).includes('cdother'));
    await wallPage.close();
    await sleep(2000);
    check('wall: site cookies gone after its last tab closed', !(await names(server.origin)).includes('cdwall'), (await names(server.origin)).join(','));
    check('wall: another site\'s cookies survive', (await names(server.frameOrigin)).includes('cdother'));
    check('wall: another site\'s localStorage survives', (await otherPage.evaluate(() => localStorage.getItem('cdother'))) === '1');
    const again = await context.newPage();
    await again.goto(`${server.origin}/fixtures/plain.html`, { waitUntil: 'domcontentloaded' });
    check('wall: site localStorage gone after its last tab closed', (await again.evaluate(() => localStorage.getItem('cdwall'))) === null);
    const session2 = await inWorker(() => chrome.storage.session.get(null));
    check('wall: nothing remembered once the site was wiped', !session2.error && Object.keys(session2.w || {}).length === 0, JSON.stringify(session2));
    check('wall: never accepted or subscribed', !server.eventsFor('wipe-wall').includes('accepted') && !server.eventsFor('wipe-wall').includes('subscribed'), server.eventsFor('wipe-wall').join(','));
    await again.close();
    await otherPage.close();
  }

  // Storage and cookie APIs exist for the wipe; request interception does not.
  const apis = await inWorker(() => ({ webRequest: typeof chrome.webRequest, history: typeof chrome.history, webNavigation: typeof chrome.webNavigation }));
  check('worker has no webRequest / history / webNavigation API', apis.webRequest === 'undefined' && apis.history === 'undefined' && apis.webNavigation === 'undefined', JSON.stringify(apis));
  const stored = await inWorker(async () => ({ local: await chrome.storage.local.get(null) }));
  check('local storage area is empty (settings untouched, no site data)', stored.local && Object.keys(stored.local).length === 0, JSON.stringify(stored));

  await context.close();
  context = null;

  // ---- nothing written to disk by the extension ------------------------
  const prof = path.join(userDataDir, 'Default');
  const exists = (p) => fs.existsSync(path.join(prof, p));
  // The settings database may exist (it is opened to read the two switches). It
  // must not contain any site name or URL.
  const settingsDir = path.join(prof, 'Local Extension Settings', extensionId);
  const leaked = fs.existsSync(settingsDir)
    ? fs.readdirSync(settingsDir).filter((n) => {
        const buf = fs.readFileSync(path.join(settingsDir, n));
        return ['localhost', '127.0.0.1', 'http', 'fixtures', 'wall'].some((t) => buf.includes(t));
      })
    : [];
  check('profile: settings database holds no site name or URL', leaked.length === 0, leaked.join(','));
  const sessionOnDisk = ['Session Extension Settings', 'Extension State'].filter((d) => {
    const dir = path.join(prof, d, d === 'Extension State' ? '' : extensionId);
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return false;
    return fs.readdirSync(dir).some((n) => { try { const buf = fs.readFileSync(path.join(dir, n)); return buf.includes('cdwall') || buf.includes('"wall":true'); } catch { return false; } });
  });
  check('profile: the remembered tab list was never written to disk', sessionOnDisk.length === 0, sessionOnDisk.join(','));
  check('profile: no "Sync Extension Settings/<id>"', !exists(path.join('Sync Extension Settings', extensionId)));
  check('profile: no "Managed Extension Settings/<id>"', !exists(path.join('Managed Extension Settings', extensionId)));
  const idb = fs.existsSync(path.join(prof, 'IndexedDB')) ? fs.readdirSync(path.join(prof, 'IndexedDB')).filter((n) => n.includes(extensionId)) : [];
  check('profile: no extension IndexedDB', idb.length === 0, idb.join(','));
  const ls = fs.existsSync(path.join(prof, 'Local Storage', 'leveldb'))
    ? fs.readdirSync(path.join(prof, 'Local Storage', 'leveldb')).some((n) => {
        try {
          return fs.readFileSync(path.join(prof, 'Local Storage', 'leveldb', n)).includes(`chrome-extension://${extensionId}`);
        } catch {
          return false;
        }
      })
    : false;
  check('profile: no extension localStorage entries', !ls);

  const timings = FIXTURES.filter((f) => f.tookMs).map((f) => `${f.name} ${(f.tookMs / 1000).toFixed(1)}s`).join(', ');
  process.stdout.write(`\ntime to reject: ${timings}\n`);
  const failed = results.filter((r) => !r.ok);
  process.stdout.write(`\n${results.length - failed.length} passed, ${failed.length} failed (Chromium ${HEADED ? 'headed' : 'headless'})\n`);
  exitCode = failed.length === 0 ? 0 : 1;
} catch (e) {
  process.stdout.write(`\nABORTED: ${e.stack || e}\n`);
  exitCode = 1;
} finally {
  if (context) await context.close().catch(() => {});
  await server.close();
  fs.rmSync(userDataDir, { recursive: true, force: true });
  if (!hadMetadata) fs.rmSync(metadataDir, { recursive: true, force: true });
}
process.exit(exitCode);
