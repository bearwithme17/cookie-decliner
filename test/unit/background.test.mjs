// background.js against a fake extension API.
import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const EXT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'extension');
const { SAFE_SNIPPETS } = await import(pathToFileURL(path.join(EXT, 'vendor', 'autoconsent', 'snippets.generated.js')).href);

const calls = { executeScript: [], other: [], tabsSend: [], sessionSet: [] };
const tabListeners = { removed: [], updated: [] };
let executeImpl = async () => [{ result: true }];
const listeners = [];
const trap = (name) => new Proxy({}, { get: (_t, prop) => { calls.other.push(`${name}.${String(prop)}`); return undefined; } });
globalThis.chrome = {
  runtime: { id: 'self-id', onMessage: { addListener: (fn) => listeners.push(fn) } },
  scripting: { executeScript: (arg) => { calls.executeScript.push(arg); return executeImpl(arg); } },
  // Anything else the background might reach for is recorded.
  storage: {
    session: { get: async () => ({}), set: async (v) => { calls.sessionSet.push(JSON.parse(JSON.stringify(v))); } },
    local: { get: async (defaults) => ({ ...defaults }) },
  },
  tabs: {
    onRemoved: { addListener: (fn) => tabListeners.removed.push(fn) },
    onUpdated: { addListener: (fn) => tabListeners.updated.push(fn) },
    query: async () => [],
    get: async () => ({ url: 'https://www.example.de/' }),
    sendMessage: (...args) => { calls.tabsSend.push(args); return Promise.resolve(); },
  },
  cookies: trap('cookies'), webRequest: trap('webRequest'),
  browsingData: trap('browsingData'), alarms: trap('alarms'), action: trap('action'),
};
await import(pathToFileURL(path.join(EXT, 'background.js')).href);

const sender = (over = {}) => ({ id: 'self-id', tab: { id: 7 }, frameId: 0, url: 'https://www.example.de/artikel?x=1', origin: 'https://www.example.de', documentId: 'DOC1', ...over });

// Deliver a message; resolve with {returned, response, responded}.
function deliver(message, from) {
  return new Promise((resolve) => {
    const out = { returned: undefined, response: undefined, responded: false };
    let sync = true;
    out.returned = listeners[0](message, from, (r) => {
      out.responded = true;
      out.response = r;
      if (!sync) resolve(out);
    });
    sync = false;
    // A listener that neither answered nor asked to keep the channel open is done.
    if (out.responded || out.returned !== true) resolve(out);
  });
}
// Listing the cookie stores (to learn which one a tab uses) reads no cookie.
const touched = () => calls.other.filter((c) => c !== 'cookies.getAllCookieStores');
const reset = () => { calls.executeScript.length = 0; calls.other.length = 0; calls.tabsSend.length = 0; calls.sessionSet.length = 0; executeImpl = async () => [{ result: true }]; };

test('exactly one listener is registered at import time', () => {
  assert.equal(listeners.length, 1);
});

test('init (main frame): replies synchronously with compact rules for that frame', async () => {
  reset();
  const r = await deliver({ t: 'init' }, sender());
  assert.equal(r.responded, true);
  assert.equal(r.returned, false, 'channel must not be kept open for a synchronous reply');
  assert.deepEqual(Object.keys(r.response), ['rules']);
  assert.deepEqual(Object.keys(r.response.rules).sort(), ['autoconsent', 'compact']);
  assert.deepEqual(r.response.rules.autoconsent, []);
  const c = r.response.rules.compact;
  assert.equal(c.v, 1);
  assert.ok(Array.isArray(c.s) && Array.isArray(c.r) && c.r.length > 500);
  assert.equal(calls.executeScript.length, 0);
});

test('init (sub-frame): only the small frame ruleset', async () => {
  reset();
  const main = (await deliver({ t: 'init' }, sender())).response.rules.compact;
  const frame = (await deliver({ t: 'init' }, sender({ frameId: 3, url: 'https://cdn.privacy-mgmt.com/index.html?message_id=1' }))).response.rules.compact;
  assert.equal(frame.v, 1);
  assert.ok(frame.r.length > 0 && frame.r.length < 50, `frame rules: ${frame.r.length}`);
  assert.ok(JSON.stringify(frame).length * 10 < JSON.stringify(main).length, 'frame payload should be far smaller');
});

test('init: site-specific rules are added for a matching URL only', async () => {
  reset();
  const generic = (await deliver({ t: 'init' }, sender())).response.rules.compact;
  const reddit = (await deliver({ t: 'init' }, sender({ url: 'https://www.reddit.com/r/de/', origin: 'https://www.reddit.com' }))).response.rules.compact;
  const name = (r) => r[1];
  assert.equal(generic.r.map(name).includes('reddit.com'), false);
  assert.equal(reddit.r.map(name).includes('reddit.com'), true);
  assert.equal(reddit.r.length, generic.r.length + 1);
});

test('init: the reply carries no URL of the sender, and nothing else is called', async () => {
  reset();
  const r = await deliver({ t: 'init' }, sender({ url: 'https://unique-host-4711.example/geheim?token=abc' , origin: 'https://unique-host-4711.example' }));
  const text = JSON.stringify(r.response);
  assert.equal(text.includes('unique-host-4711'), false);
  assert.equal(text.includes('token=abc'), false);
  assert.deepEqual(touched(), []);
});

test('init: falls back to the origin when the sender has no url (about:blank frames)', async () => {
  reset();
  const r = await deliver({ t: 'init' }, sender({ url: undefined, frameId: 2 }));
  assert.equal(r.responded, true);
  assert.equal(r.response.rules.compact.v, 1);
});

test('foreign or malformed senders are ignored', async () => {
  reset();
  for (const from of [sender({ id: 'other-extension' }), sender({ tab: undefined }), sender({ frameId: undefined }), sender({ tab: {} }), undefined, null]) {
    for (const msg of [{ t: 'init' }, { t: 'eval', s: 'EVAL_0' }]) {
      const r = await deliver(msg, from);
      assert.equal(r.responded, false, JSON.stringify(from));
      assert.equal(r.returned, false);
    }
  }
  assert.equal(calls.executeScript.length, 0);
});

test('unknown or malformed messages get no reply and no action', async () => {
  reset();
  for (const msg of [null, undefined, 'init', 42, {}, { t: 'report', url: 'https://x' }, { type: 'init' }, { t: 'optIn' }, { t: 'wall2' }]) {
    const r = await deliver(msg, sender());
    assert.equal(r.responded, false, JSON.stringify(msg));
    assert.equal(r.returned, false);
  }
  assert.equal(calls.executeScript.length, 0);
});

test('eval: runs the packaged function in the MAIN world of the exact document', async () => {
  reset();
  const r = await deliver({ t: 'eval', s: 'EVAL_COOKIEBOT_1' }, sender({ frameId: 4 }));
  assert.equal(r.returned, true, 'channel kept open for the asynchronous reply');
  assert.deepEqual(r.response, { r: true });
  assert.equal(calls.executeScript.length, 1);
  const arg = calls.executeScript[0];
  assert.deepEqual(Object.keys(arg).sort(), ['func', 'injectImmediately', 'target', 'world']);
  assert.equal(arg.world, 'MAIN');
  assert.equal(arg.injectImmediately, true);
  assert.equal(arg.func, SAFE_SNIPPETS.EVAL_COOKIEBOT_1);
  assert.deepEqual(arg.target, { tabId: 7, documentIds: ['DOC1'] });
});

test('eval: code in the message is never executed', async () => {
  reset();
  globalThis.__pwned = false;
  const hostile = { t: 'eval', s: 'EVAL_COOKIEBOT_1', code: 'globalThis.__pwned = true', func: 'globalThis.__pwned = true', args: ['x'], files: ['evil.js'], world: 'ISOLATED', target: { tabId: 999 } };
  await deliver(hostile, sender());
  const arg = calls.executeScript[0];
  assert.equal(arg.func, SAFE_SNIPPETS.EVAL_COOKIEBOT_1);
  assert.equal('args' in arg, false);
  assert.equal('files' in arg, false);
  assert.equal(arg.world, 'MAIN');
  assert.equal(arg.target.tabId, 7);
  assert.equal(globalThis.__pwned, false);
});

test('eval: unknown ids, opt-in ids and prototype names return {r:false} without injecting', async () => {
  reset();
  for (const s of ['EVAL_DOES_NOT_EXIST', 'EVAL_CONSENTMANAGER_4', 'EVAL_USERCENTRICS_API_3', 'EVAL_TARTEAUCITRON_1', 'EVAL_EZOIC_0', 'constructor', '__proto__', 'toString', 'hasOwnProperty', '', 7, null, undefined, {}, ['EVAL_0']]) {
    const r = await deliver({ t: 'eval', s }, sender());
    assert.deepEqual(r.response, { r: false }, String(s));
  }
  assert.equal(calls.executeScript.length, 0);
});

test('eval: a rejecting executeScript returns {r:false}; a gone document is not retried by frame id', async () => {
  reset();
  executeImpl = async () => { throw new Error('No document with id DOC1'); };
  const r = await deliver({ t: 'eval', s: 'EVAL_0' }, sender());
  assert.deepEqual(r.response, { r: false });
  assert.equal(calls.executeScript.length, 1, 'must not fall back to the frame id: another document may live there now');
});

test('eval: without sender.documentId the frame id is used', async () => {
  reset();
  const r = await deliver({ t: 'eval', s: 'EVAL_0' }, sender({ documentId: undefined, frameId: 5 }));
  assert.deepEqual(r.response, { r: true });
  assert.deepEqual(calls.executeScript[0].target, { tabId: 7, frameIds: [5] });
});

test('eval: a browser that rejects the documentIds key synchronously falls back to the frame id', async () => {
  reset();
  executeImpl = (arg) => { if (arg.target.documentIds) throw new TypeError('Unexpected property "documentIds"'); return Promise.resolve([{ result: true }]); };
  const r = await deliver({ t: 'eval', s: 'EVAL_0' }, sender({ frameId: 2 }));
  assert.deepEqual(r.response, { r: true });
  assert.equal(calls.executeScript.length, 2);
  assert.deepEqual(calls.executeScript[1].target, { tabId: 7, frameIds: [2] });
});

test('eval: only a literal true counts; null, undefined, objects and empty results are false', async () => {
  for (const results of [[{ result: null }], [{}], [], undefined, null, [{ result: 'yes' }], [{ result: { a: 1 } }], [{ result: 1 }]]) {
    reset();
    executeImpl = async () => results;
    const r = await deliver({ t: 'eval', s: 'EVAL_0' }, sender());
    assert.deepEqual(r.response, { r: false }, JSON.stringify(results));
  }
});

test('init and eval touch no cookie, site-data or request API and store nothing', async () => {
  reset();
  await deliver({ t: 'init' }, sender());
  await deliver({ t: 'eval', s: 'EVAL_0' }, sender());
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(touched(), []);
  assert.deepEqual(calls.sessionSet, [], 'with default settings an ordinary page visit is not remembered');
  assert.deepEqual(calls.tabsSend, []);
});

test('wall: no reply; the site comes from the tab, the top frame is told to hide, only the site is remembered', async () => {
  reset();
  const r = await deliver({ t: 'wall', url: 'https://evil.example/', site: 'evil.example' }, sender({ frameId: 3, url: 'https://cmp2.bild.de/index.html', tab: { id: 7, url: 'https://www.bild.de/artikel?x=1' } }));
  assert.equal(r.responded, false);
  assert.equal(r.returned, false);
  await new Promise((res) => setTimeout(res, 20));
  assert.deepEqual(calls.tabsSend, [[7, { t: 'hide' }, { frameId: 0 }]]);
  assert.deepEqual(calls.sessionSet, [{ w: { 7: { s: 'bild.de', o: ['https://www.bild.de'], wall: true } }, p: {} }]);
  assert.deepEqual(touched(), [], 'nothing is deleted while the tab is open');
});

test('wall: a third-party frame (ad, embed) cannot mark the embedding site', async () => {
  reset();
  for (const url of ['https://ads.evil.example/creative.html', 'https://codepen.io/pen/x', undefined]) {
    await deliver({ t: 'wall' }, sender({ frameId: 4, url, origin: undefined, tab: { id: 7, url: 'https://forum.example/thread/1' } }));
  }
  await new Promise((res) => setTimeout(res, 20));
  assert.deepEqual(calls.sessionSet, []);
  assert.deepEqual(calls.tabsSend, []);
  assert.deepEqual(calls.executeScript, []);
});

test("wall: Sourcepoint's own message host and the top frame are trusted", async () => {
  reset();
  await deliver({ t: 'wall' }, sender({ frameId: 4, url: 'https://cdn.privacy-mgmt.com/index.html?message_id=1', tab: { id: 7, url: 'https://www.spiegel.de/' } }));
  await new Promise((res) => setTimeout(res, 20));
  assert.equal(calls.sessionSet.at(-1).w[7].s, 'spiegel.de');
  reset();
  await deliver({ t: 'wall' }, sender({ frameId: 0, url: 'https://www.heise.de/', tab: { id: 8, url: 'https://www.heise.de/', incognito: true } }));
  await new Promise((res) => setTimeout(res, 20));
  assert.deepEqual(calls.sessionSet.at(-1).w[8], { s: 'heise.de', o: ['https://www.heise.de'], wall: true, c: '1' }, 'the cookie store is remembered');
  assert.deepEqual(calls.tabsSend, [[8, { t: 'hide' }, { frameId: 0 }]]);
});

test('tab listeners are registered at import time', () => {
  assert.equal(tabListeners.removed.length, 1);
  assert.equal(tabListeners.updated.length, 1);
});
