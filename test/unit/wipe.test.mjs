// background/wipe.js against a fake extension API: site naming, last-tab logic,
// what gets deleted and what is stored.
import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const EXT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'extension');

const state = { session: {}, local: {}, tabs: [], cookies: [], removed: [], browsingData: [], localWrites: 0 };
globalThis.chrome = {
  storage: {
    session: {
      get: async (keys) => Object.fromEntries([].concat(keys).filter((k) => k in state.session).map((k) => [k, JSON.parse(JSON.stringify(state.session[k]))])),
      set: async (v) => { Object.assign(state.session, JSON.parse(JSON.stringify(v))); },
    },
    local: {
      get: async (defaults) => ({ ...defaults, ...state.local }),
      set: async () => { state.localWrites++; },
    },
  },
  tabs: { query: async () => state.tabs },
  cookies: {
    // Chrome lists '0', and '1' while incognito windows are open; tests set tabIds where they matter.
    getAllCookieStores: async () => state.stores || [{ id: '0' }, { id: '1' }],
    getAll: async (q) => {
      if ('firstPartyDomain' in q) throw new Error('not Firefox');
      return state.cookies.filter((c) => { const d = c.domain.replace(/^\./, ''); return d === q.domain || d.endsWith('.' + q.domain); });
    },
    remove: async (d) => { state.removed.push(d); },
  },
  browsingData: { remove: async (options, types) => { state.browsingData.push([options, types]); } },
};
const { siteOf, parseUrl, pageUrlOf, navigated, wallSeen, tabClosed, flushPending, LEAVE_GRACE_MS } = await import(pathToFileURL(path.join(EXT, 'background', 'wipe.js')).href);

const reset = (local = {}) => Object.assign(state, { stores: null, session: {}, local, tabs: [], cookies: [], removed: [], browsingData: [], localWrites: 0 });
const cookie = (domain, name, extra = {}) => ({ domain, name, path: '/', secure: true, storeId: '0', ...extra });

test('siteOf: registrable domain, never a bare public suffix', () => {
  assert.equal(siteOf('www.bild.de'), 'bild.de');
  assert.equal(siteOf('cmp2.bild.de'), 'bild.de');
  assert.equal(siteOf('bild.de'), 'bild.de');
  assert.equal(siteOf('WWW.Spiegel.DE.'), 'spiegel.de');
  assert.equal(siteOf('shop.example.co.uk'), 'example.co.uk');
  assert.equal(siteOf('example.co.uk'), 'example.co.uk');
  assert.equal(siteOf('co.uk'), '');
  assert.equal(siteOf('github.io'), '');
  assert.equal(siteOf('evil.azurestaticapps.net'), 'evil.azurestaticapps.net');
  assert.equal(siteOf('x.ngrok-free.app'), 'x.ngrok-free.app');
  assert.equal(siteOf('a.b.web.core.windows.net'), 'b.web.core.windows.net');
  assert.equal(siteOf('medium.com'), 'medium.com');
  assert.equal(siteOf('www.tumblr.com'), 'tumblr.com');
  assert.equal(siteOf('someone.substack.com'), 'someone.substack.com');
  assert.equal(siteOf('[2001:db8::5]'), '2001:db8::5');
  assert.equal(siteOf('someone.github.io'), 'someone.github.io');
  assert.equal(siteOf('a.b.someone.github.io'), 'someone.github.io');
  assert.equal(siteOf('localhost'), 'localhost');
  assert.equal(siteOf('127.0.0.1'), '127.0.0.1');
  assert.equal(siteOf(''), '');
  assert.equal(siteOf('a..b'), '');
  assert.equal(siteOf(undefined), '');
});

test('parseUrl: web pages only', () => {
  assert.deepEqual(parseUrl('https://www.bild.de/a?b=1#c'), { site: 'bild.de', origin: 'https://www.bild.de' });
  assert.deepEqual(parseUrl('http://localhost:8080/x'), { site: 'localhost', origin: 'http://localhost:8080' });
  for (const u of ['chrome://newtab/', 'about:blank', 'file:///etc/passwd', 'moz-extension://abc/x.html', '', 'nonsense', 'https://co.uk/']) assert.equal(parseUrl(u), null, u);
});

test('wall site: wiped when its only tab closes; other sites are left alone', async () => {
  reset();
  state.cookies = [cookie('.bild.de', 'consentUUID'), cookie('www.bild.de', 'a', { secure: false, path: '/x' }), cookie('.notbild.de', 'keep'), cookie('.example.org', 'keep2')];
  await wallSeen(1, 'https://www.bild.de/artikel');
  assert.deepEqual(state.session.w, { 1: { s: 'bild.de', o: ['https://www.bild.de'], wall: true } });
  assert.deepEqual(state.session.p, {});
  assert.equal(state.removed.length, 0);
  state.tabs = [{ id: 2, url: 'https://www.example.org/' }];
  await tabClosed(1);
  assert.deepEqual(state.removed.map((r) => [r.url, r.name]), [['https://bild.de/', 'consentUUID'], ['http://www.bild.de/x', 'a']]);
  assert.equal(state.browsingData.length, 1);
  const [options, types] = state.browsingData[0];
  assert.deepEqual(options.origins.sort(), ['http://bild.de', 'http://www.bild.de', 'https://bild.de', 'https://www.bild.de']);
  assert.deepEqual(types, { cacheStorage: true, indexedDB: true, localStorage: true, serviceWorkers: true });
  assert.deepEqual(state.session.w, {});
  assert.equal(state.localWrites, 0);
});

test('wall site still open in another tab: nothing deleted; the wipe moves to that tab', async () => {
  reset();
  state.cookies = [cookie('.bild.de', 'x')];
  await wallSeen(1, 'https://www.bild.de/');
  state.tabs = [{ id: 1, url: 'https://www.bild.de/' }, { id: 5, url: 'https://sport.bild.de/fussball' }];
  await tabClosed(1);
  assert.equal(state.removed.length, 0);
  assert.equal(state.browsingData.length, 0);
  assert.equal(state.session.w[5].s, 'bild.de');
  assert.equal(state.session.w[5].wall, true);
  state.tabs = [];
  await tabClosed(5);
  assert.equal(state.removed.length, 1);
  assert.equal(state.browsingData.length, 1);
});

test('wall tab navigates within the site: kept; to another site: wiped after the grace period', async () => {
  reset();
  state.cookies = [cookie('.spiegel.de', 'x')];
  await wallSeen(3, 'https://www.spiegel.de/');
  state.tabs = [{ id: 3, url: 'https://www.spiegel.de/politik' }];
  await navigated(3, 'https://www.spiegel.de/politik');
  assert.equal(state.removed.length, 0);
  assert.equal(state.session.w[3].wall, true);
  state.tabs = [{ id: 3, url: 'https://www.example.org/' }];
  await navigated(3, 'https://www.example.org/');
  assert.equal(state.removed.length, 0, 'not at once: the user may come straight back');
  assert.deepEqual(state.session.w, {}, 'the new site is not remembered with default settings');
  await flushPending(Date.now() + LEAVE_GRACE_MS - 1000);
  assert.equal(state.removed.length, 0);
  await flushPending(Date.now() + LEAVE_GRACE_MS + 1);
  assert.equal(state.removed.length, 1);
  assert.deepEqual(state.session.p, {});
});

test('leaving for a moment (sign-in, payment) and coming back keeps the site', async () => {
  reset({ wipeAll: true });
  state.cookies = [cookie('.shop.example', 'session'), cookie('.accounts.idp.example', 'idp')];
  await navigated(1, 'https://www.shop.example/login');
  state.tabs = [{ id: 1, url: 'https://accounts.idp.example/' }];
  await navigated(1, 'https://accounts.idp.example/o/auth');
  state.tabs = [{ id: 1, url: 'https://www.shop.example/callback' }];
  await navigated(1, 'https://www.shop.example/callback');
  await flushPending(Date.now() + LEAVE_GRACE_MS + 1);
  assert.deepEqual(state.removed.map((r) => r.name), ['idp'], 'only the site that was really left is wiped');
  assert.equal(state.session.w[1].s, 'shop.example');
});

test('overdue leaves are wiped at the next tab event even without an alarm', async () => {
  reset();
  state.cookies = [cookie('.bild.de', 'x')];
  await wallSeen(1, 'https://www.bild.de/');
  state.tabs = [{ id: 1, url: 'https://www.example.org/' }];
  await navigated(1, 'https://www.example.org/');
  state.session.p['bild.de|'].due = Date.now() - 1;
  await tabClosed(99);
  assert.equal(state.removed.length, 1);
});

test('only the cookie store of the tab is wiped (incognito, containers)', async () => {
  reset();
  state.cookies = [cookie('.bild.de', 'normal', { storeId: '0' }), cookie('.bild.de', 'private', { storeId: '1' })];
  const getAll = globalThis.chrome.cookies.getAll;
  globalThis.chrome.cookies.getAll = async (q) => (await getAll(q)).filter((c) => q.storeId === undefined || c.storeId === q.storeId);
  await wallSeen(1, 'https://www.bild.de/', '1');
  state.tabs = [{ id: 2, url: 'https://www.bild.de/', incognito: false }];
  await tabClosed(1);
  globalThis.chrome.cookies.getAll = getAll;
  assert.deepEqual(state.removed.map((r) => [r.name, r.storeId]), [['private', '1']], 'a normal-window tab on the same site does not hold an incognito entry');
  assert.equal(state.browsingData.length, 0, 'Chrome site-data removal would hit the normal profile');
});

test('Firefox container: site data is removed for that container only', async () => {
  reset();
  await wallSeen(1, 'https://www.bild.de/', 'firefox-container-2');
  await tabClosed(1);
  assert.equal(state.browsingData.length, 1);
  assert.equal(state.browsingData[0][0].cookieStoreId, 'firefox-container-2');
});

test('a holder tab remembered for another site keeps that site pending, not overwritten', async () => {
  reset({ wipeAll: true });
  state.cookies = [cookie('.a.example', 'a'), cookie('.c.example', 'c')];
  await navigated(1, 'https://a.example/');
  await navigated(2, 'https://c.example/');
  // Tab 2 already shows a.example, but its navigation event has not arrived yet.
  state.tabs = [{ id: 2, url: 'https://a.example/' }];
  await tabClosed(1);
  assert.equal(state.session.w[2].s, 'a.example');
  assert.deepEqual(state.removed.map((r) => r.name), ['c'], 'c.example, which tab 2 left, is wiped instead of forgotten');
});

test('reader view, view-source and blob: pages stay on the site; about:blank changes nothing', async () => {
  assert.equal(pageUrlOf('about:reader?url=https%3A%2F%2Fwww.spiegel.de%2Fa'), 'https://www.spiegel.de/a');
  assert.equal(pageUrlOf('view-source:https://www.spiegel.de/'), 'https://www.spiegel.de/');
  assert.equal(pageUrlOf('blob:https://www.spiegel.de/0f1e'), 'https://www.spiegel.de/');
  assert.equal(pageUrlOf('about:blank'), null);
  assert.equal(pageUrlOf('data:text/html,x'), null);
  reset();
  await wallSeen(1, 'https://www.spiegel.de/');
  for (const u of ['about:reader?url=https%3A%2F%2Fwww.spiegel.de%2Fa', 'view-source:https://www.spiegel.de/', 'blob:https://www.spiegel.de/0f1e', 'about:blank']) {
    await navigated(1, u);
    assert.equal(state.session.w[1].s, 'spiegel.de', u);
  }
  await navigated(1, '');
  assert.equal(state.session.w[1], undefined, 'a hidden non-web page (new tab page) leaves the site');
});

test('IPv6 hosts produce valid origins', async () => {
  reset({ wipeAll: true });
  await navigated(1, 'https://[2001:db8::5]/app');
  await tabClosed(1);
  assert.deepEqual(state.browsingData[0][0].origins.sort(), ['http://[2001:db8::5]', 'https://[2001:db8::5]']);
});

test('ordinary sites are never remembered or wiped with default settings', async () => {
  reset();
  state.cookies = [cookie('.example.org', 'session')];
  await navigated(1, 'https://www.example.org/');
  await navigated(1, 'https://other.example.net/');
  await tabClosed(1);
  assert.deepEqual(state.session.w || {}, {});
  assert.deepEqual(state.session.p || {}, {});
  assert.equal(state.removed.length, 0);
  assert.equal(state.browsingData.length, 0);
});

test('wipeWalls off: a wall is not remembered', async () => {
  reset({ wipeWalls: false });
  await wallSeen(1, 'https://www.bild.de/');
  await tabClosed(1);
  assert.deepEqual(state.session, {});
  assert.equal(state.removed.length, 0);
});

test('wipeAll on: every site is wiped when its last tab closes or moves on', async () => {
  reset({ wipeAll: true });
  state.cookies = [cookie('.example.org', 'session'), cookie('.example.net', 'n')];
  await navigated(1, 'https://www.example.org/');
  state.tabs = [{ id: 1, url: 'https://www.example.net/' }];
  await navigated(1, 'https://www.example.net/');
  await flushPending(Date.now() + LEAVE_GRACE_MS + 1);
  assert.deepEqual(state.removed.map((r) => r.name), ['session']);
  state.tabs = [];
  await tabClosed(1);
  assert.deepEqual(state.removed.map((r) => r.name), ['session', 'n']);
});

test('state survives a worker restart (kept in the session area, not in module memory)', async () => {
  reset();
  state.cookies = [cookie('.heise.de', 'x')];
  await wallSeen(9, 'https://www.heise.de/');
  const again = await import(pathToFileURL(path.join(EXT, 'background', 'wipe.js')).href + '?restart=1');
  await again.tabClosed(9);
  assert.equal(state.removed.length, 1);
});

test('cannot list tabs: nothing is deleted', async () => {
  reset();
  state.cookies = [cookie('.bild.de', 'x')];
  await wallSeen(1, 'https://www.bild.de/');
  const query = globalThis.chrome.tabs.query;
  globalThis.chrome.tabs.query = async () => { throw new Error('no'); };
  await tabClosed(1);
  globalThis.chrome.tabs.query = query;
  assert.equal(state.removed.length, 0);
  assert.equal(state.browsingData.length, 0);
});

test('an entry whose tab vanished without an event is swept up at the next tab close', async () => {
  reset();
  state.cookies = [cookie('.bild.de', 'x'), cookie('.spiegel.de', 'y')];
  await wallSeen(1, 'https://www.bild.de/');
  await wallSeen(2, 'https://www.spiegel.de/');
  // Tab 1 is gone but no close event was processed for it; now tab 2 closes.
  state.tabs = [{ id: 3, url: 'https://www.example.org/' }];
  await tabClosed(2);
  assert.deepEqual(state.removed.map((r) => r.name).sort(), ['x', 'y']);
  assert.deepEqual(state.session.w, {});
});

test('Safari: the cookie store comes from cookies.getAllCookieStores, not from the tab', async () => {
  reset();
  const api = globalThis.chrome;
  const saved = { stores: api.cookies.getAllCookieStores, getAll: api.cookies.getAll, browsingData: api.browsingData };
  const valid = ['persistent-2', 'persistent-1'];
  try {
    // Safari names its stores and rejects any other id; it has no browsingData API.
    api.cookies.getAllCookieStores = async () => [{ id: 'persistent-2', tabIds: [1, 3] }, { id: 'persistent-1', tabIds: [] }];
    api.cookies.getAll = async (q) => {
      if ('firstPartyDomain' in q || 'partitionKey' in q) throw new Error('unsupported key');
      if (q.storeId !== undefined && !valid.includes(q.storeId)) throw new Error(`'${q.storeId}' is not a valid cookie store identifier`);
      return state.cookies.filter((c) => (q.storeId === undefined || c.storeId === q.storeId) && (c.domain.replace(/^\./, '') === q.domain || c.domain.endsWith('.' + q.domain)));
    };
    delete api.browsingData;
    state.cookies = [cookie('.bild.de', 'id', { storeId: 'persistent-2' }), cookie('.example.org', 'keep', { storeId: 'persistent-2' })];

    await wallSeen(1, 'https://www.bild.de/', '0'); // the tab fields say '0' (no cookieStoreId, incognito false)
    assert.equal(state.session.w[1].c, 'persistent-2');

    // Another tab of the same store still shows the site: it inherits the entry.
    state.tabs = [{ id: 3, url: 'https://www.bild.de/sport', incognito: false }];
    await tabClosed(1);
    assert.equal(state.removed.length, 0, 'not wiped while tab 3 still shows bild.de');
    assert.equal(state.session.w[3].s, 'bild.de');

    state.tabs = [];
    await tabClosed(3);
    assert.deepEqual(state.removed.map((r) => [r.name, r.storeId]), [['id', 'persistent-2']]);
  } finally {
    api.cookies.getAllCookieStores = saved.stores;
    api.cookies.getAll = saved.getAll;
    api.browsingData = saved.browsingData;
  }
});

test('Chrome: the store comes from the tab list of each store (normal "0", incognito "1")', async () => {
  reset();
  state.stores = [{ id: '0', tabIds: [1] }, { id: '1', tabIds: [2] }];
  await wallSeen(2, 'https://www.bild.de/', undefined); // no hint at all
  assert.equal(state.session.w[2].c, '1');
  await wallSeen(1, 'https://www.spiegel.de/', '1'); // a wrong hint loses against the list
  assert.equal(state.session.w[1].c, '0');
});

test('Safari: a tab missing from the store list never gets a store the browser does not have', async () => {
  reset();
  state.stores = [{ id: 'persistent-2', tabIds: [] }];
  await wallSeen(4, 'https://www.bild.de/', '0'); // tab already gone from tabIds; hint "0" is not a Safari store
  assert.equal('c' in state.session.w[4], false, 'unknown store: the wipe covers every store instead of none');
});

test('the store is looked up when the event arrives, not when the queue gets to it', async () => {
  reset();
  state.stores = [{ id: 'persistent-2', tabIds: [5] }];
  const p = wallSeen(5, 'https://www.bild.de/', '0');
  state.stores = [{ id: 'persistent-2', tabIds: [] }]; // the tab closes right after
  await p;
  assert.equal(state.session.w[5].c, 'persistent-2');
});
