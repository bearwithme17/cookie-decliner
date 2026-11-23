// Cookie wipe for sites that could not be declined (pay-or-accept walls), and
// optionally for every site.
//
// What is remembered: tab id -> { s: site, o: [origins], wall: boolean, c: cookie
// store id }, plus sites a tab has just left -> the same entry and a due time.
// Both live in the browser's session storage area, which is held in memory and
// never written to disk. It is cleared when the browser closes. The two user
// settings (two booleans) are the only thing kept in the local storage area.
//
// When the last tab showing a remembered site closes, that site's cookies (all
// subdomains) and its site storage are deleted, in the tab's own cookie store
// only. When a tab moves on to another site, the wipe waits LEAVE_GRACE_MS, so a
// short trip away (single sign-on, payment, 3-D Secure) can come back to an
// intact session; coming back in any tab of the same cookie store cancels it.

const api = globalThis.browser ?? globalThis.chrome;

export const LEAVE_GRACE_MS = 3 * 60 * 1000;
const ALARM = 'cd-wipe';

// Suffixes under which unrelated parties register names. A site is one label
// more than its suffix; the suffix itself is never wiped. This is a hand-picked
// subset of the Public Suffix List; a name under an unlisted shared suffix is
// treated as its last two labels.
const MULTI_PART = new Set([
  'co.uk', 'org.uk', 'me.uk', 'ltd.uk', 'plc.uk', 'net.uk', 'sch.uk', 'ac.uk', 'gov.uk', 'nhs.uk',
  'com.au', 'net.au', 'org.au', 'edu.au', 'gov.au', 'id.au', 'co.nz', 'net.nz', 'org.nz', 'govt.nz',
  'co.jp', 'ne.jp', 'or.jp', 'ac.jp', 'go.jp', 'co.kr', 'or.kr', 'co.in', 'net.in', 'org.in', 'gov.in',
  'com.br', 'net.br', 'org.br', 'gov.br', 'com.mx', 'org.mx', 'com.ar', 'com.co', 'com.pe', 'com.ve',
  'com.cn', 'net.cn', 'org.cn', 'gov.cn', 'com.hk', 'org.hk', 'com.tw', 'org.tw', 'com.sg', 'org.sg',
  'com.my', 'com.ph', 'com.vn', 'co.id', 'or.id', 'co.th', 'in.th', 'com.tr', 'org.tr', 'gov.tr',
  'co.za', 'org.za', 'co.il', 'org.il', 'com.eg', 'com.sa', 'com.ua', 'org.ua', 'com.pl', 'org.pl',
  'net.pl', 'co.at', 'or.at', 'gv.at', 'com.es', 'org.es', 'com.pt', 'com.gr', 'com.cy', 'com.mt',
  'co.hu', 'com.ro', 'com.ru', 'org.ru', 'co.ke', 'com.ng', 'com.pk', 'com.bd', 'com.np', 'co.cr',
  // hosting platforms where each customer gets a subdomain
  'github.io', 'gitlab.io', 'pages.dev', 'workers.dev', 'netlify.app', 'vercel.app', 'herokuapp.com',
  'web.app', 'firebaseapp.com', 'appspot.com', 'azurewebsites.net', 'cloudfront.net', 'amazonaws.com',
  'blogspot.com', 'wordpress.com', 'tumblr.com', 'myshopify.com', 'wixsite.com', 'squarespace.com',
  'webflow.io', 'glitch.me', 'repl.co', 'replit.app', 'onrender.com', 'fly.dev', 'railway.app',
  'surge.sh', 'neocities.org', 'readthedocs.io', 'substack.com', 'medium.com', 'jimdofree.com',
  'jimdosite.com', 'weebly.com', 'godaddysites.com', 'translate.goog', 'r2.dev',
  'azurestaticapps.net', 'azureedge.net', 'azurefd.net', 'web.core.windows.net', 'blob.core.windows.net',
  'cloudapp.net', 'trafficmanager.net', 'run.app', 'cloudfunctions.net', 'ngrok.io', 'ngrok.app',
  'ngrok-free.app', 'ngrok-free.dev', 'trycloudflare.com', 'loca.lt', 'deno.dev', 'csb.app',
  'stackblitz.io', 'gitbook.io', 'notion.site', 'framer.app', 'framer.website', 'bubbleapps.io',
  'ghost.io', 'hashnode.dev', 'itch.io', 'bitbucket.io', 'codeberg.page', 'sourceforge.io',
  'duckdns.org', 'ddns.net', 'dyndns.org', 'hopto.org', 'no-ip.org', 'mystrikingly.com', 'carrd.co',
  'shopifypreview.com', 'statuspage.io', 'pythonanywhere.com', 'streamlit.app', 'hf.space',
]);

// Platform domains whose apex (and www.) is the platform's own site, with its
// own login cookies, while its subdomains belong to customers.
const PLATFORM_APEX = new Set([
  'medium.com', 'substack.com', 'wordpress.com', 'tumblr.com', 'squarespace.com', 'weebly.com',
  'blogspot.com', 'itch.io', 'gitbook.io', 'ghost.io', 'carrd.co', 'mystrikingly.com', 'pythonanywhere.com',
]);

// "www.bild.de" -> "bild.de"; "shop.example.co.uk" -> "example.co.uk".
// Returns '' when no site can be named safely.
export function siteOf(hostname) {
  if (typeof hostname !== 'string') return '';
  let host = hostname.trim().toLowerCase();
  if (host.endsWith('.')) host = host.slice(0, -1);
  if (host.startsWith('[') && host.endsWith(']')) host = host.slice(1, -1);
  if (!host) return '';
  if (host.includes(':') || /^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return host; // IP address
  const labels = host.split('.');
  if (labels.some((l) => l.length === 0)) return '';
  if (labels.length === 1) return host; // localhost and the like
  for (const apex of PLATFORM_APEX) {
    if (host === apex || host === 'www.' + apex) return apex;
  }
  if (MULTI_PART.has(host)) return '';
  // Longest listed suffix wins (web.core.windows.net before windows.net).
  for (let k = labels.length - 1; k >= 2; k--) {
    if (MULTI_PART.has(labels.slice(-k).join('.'))) return labels.slice(-(k + 1)).join('.');
  }
  const lastTwo = labels.slice(-2).join('.');
  if (MULTI_PART.has(lastTwo)) return labels.slice(-3).join('.');
  return lastTwo;
}

// The web page a top-level URL really shows. Reader view, view-source and blob:
// documents belong to the page they were made from. Returns null for documents
// that say nothing about where the tab is (about:blank, data:, about:srcdoc):
// those are neither the old site nor a new one.
export function pageUrlOf(url) {
  if (typeof url !== 'string') return '';
  let u = url.trim();
  if (u === 'about:blank' || u === 'about:srcdoc' || /^data:/i.test(u)) return null;
  if (/^view-source:/i.test(u)) u = u.slice('view-source:'.length);
  if (/^about:reader\?/i.test(u)) {
    try {
      u = new URL(u).searchParams.get('url') || '';
    } catch (e) {
      u = '';
    }
  }
  if (/^blob:/i.test(u)) {
    try {
      const origin = new URL(u.slice(5)).origin;
      u = origin && origin !== 'null' ? origin + '/' : '';
    } catch (e) {
      u = '';
    }
  }
  return u;
}

export function parseUrl(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    const site = siteOf(u.hostname);
    if (!site) return null;
    return { site, origin: u.origin };
  } catch (e) {
    return null;
  }
}

// Cookie store a tab uses: Firefox names it (containers, private windows);
// Chrome has "0" for normal windows and "1" for incognito.
export function storeOf(tab) {
  if (!tab || typeof tab !== 'object') return undefined;
  if (typeof tab.cookieStoreId === 'string') return tab.cookieStoreId;
  if (typeof tab.incognito === 'boolean') return tab.incognito ? '1' : '0';
  return undefined;
}

// Tab id -> cookie store id, as the browser reports it. Safari names its stores
// itself ("persistent-2") and rejects Chrome's "0", so the tab fields are only
// trusted when they name a store the browser listed.
async function tabStores() {
  const map = new Map();
  const ids = new Set();
  try {
    const stores = await api.cookies.getAllCookieStores();
    for (const st of Array.isArray(stores) ? stores : []) {
      if (typeof st.id === 'string') ids.add(st.id);
      for (const id of Array.isArray(st.tabIds) ? st.tabIds : []) map.set(id, st.id);
    }
  } catch (e) {
    // nothing listed: only the tab fields are left
  }
  const of = (tabId, hint) => {
    if (typeof hint === 'string' && hint.startsWith('firefox-')) return hint; // Firefox names it on the tab
    if (map.has(tabId)) return map.get(tabId);
    if (ids.size === 0 || ids.has(hint)) return hint;
    return undefined; // unknown: wipe in every store rather than in a store that does not exist
  };
  return { of };
}

// Started when the event arrives, before the tab can go away; awaited in the lock.
function storeForTab(tabId, hint) {
  return tabStores().then((t) => t.of(tabId, hint), () => hint);
}

function belongsTo(cookieDomain, site) {
  const d = String(cookieDomain || '').replace(/^\./, '').toLowerCase();
  return d === site || d.endsWith('.' + site);
}

// IPv6 hosts need brackets inside URLs and Firefox host names.
function urlHost(h) {
  return h.includes(':') && !h.startsWith('[') ? '[' + h + ']' : h;
}

function sameStore(a, b) {
  return a === undefined || b === undefined || a === b;
}

// ---- state ---------------------------------------------------------------
let chain = Promise.resolve();
function locked(fn) {
  chain = chain.then(fn, fn).catch(() => {});
  return chain;
}

async function loadState() {
  try {
    const r = await api.storage.session.get(['w', 'p']);
    return {
      w: r && r.w && typeof r.w === 'object' ? r.w : {},
      p: r && r.p && typeof r.p === 'object' ? r.p : {},
    };
  } catch (e) {
    return { w: {}, p: {} };
  }
}

async function saveState(st) {
  try {
    await api.storage.session.set({ w: st.w, p: st.p });
  } catch (e) {
    // nothing to do
  }
}

export async function readSettings() {
  try {
    const r = await api.storage.local.get({ wipeWalls: true, wipeAll: false });
    return { wipeWalls: r.wipeWalls !== false, wipeAll: r.wipeAll === true };
  } catch (e) {
    return { wipeWalls: true, wipeAll: false };
  }
}

// ---- deletion ------------------------------------------------------------
async function cookiesOf(site, storeId) {
  const base = { domain: site };
  if (storeId !== undefined) base.storeId = storeId;
  const variants = [
    { ...base, firstPartyDomain: null, partitionKey: {} }, // Firefox
    { ...base, partitionKey: {} },                         // Chrome
    base,
  ];
  for (const query of variants) {
    try {
      const list = await api.cookies.getAll(query);
      if (Array.isArray(list)) return list;
    } catch (e) {
      // try the next shape
    }
  }
  return [];
}

async function removeCookie(c) {
  const host = urlHost(String(c.domain || '').replace(/^\./, ''));
  const details = { url: (c.secure ? 'https://' : 'http://') + host + (c.path || '/'), name: c.name, storeId: c.storeId };
  if (c.partitionKey) details.partitionKey = c.partitionKey;
  if (typeof c.firstPartyDomain === 'string') details.firstPartyDomain = c.firstPartyDomain;
  try {
    await api.cookies.remove(details);
  } catch (e) {
    // gone already, or the browser refused: nothing else to try
  }
}

export async function wipeSite(entry) {
  const site = entry && entry.s;
  if (!site) return;
  const store = entry.c;
  const isIp = site.includes(':') || /^\d{1,3}(\.\d{1,3}){3}$/.test(site);
  const hosts = new Set(isIp ? [site] : [site, 'www.' + site]);
  const origins = new Set(Array.isArray(entry.o) ? entry.o : []);
  for (const o of origins) {
    try {
      hosts.add(new URL(o).hostname.replace(/^\[|\]$/g, ''));
    } catch (e) {
      // ignore
    }
  }

  let storeIds;
  if (store !== undefined) {
    storeIds = [store];
  } else {
    let stores = [];
    try {
      stores = await api.cookies.getAllCookieStores();
    } catch (e) {
      stores = [];
    }
    storeIds = Array.isArray(stores) && stores.length ? stores.map((s) => s.id) : [undefined];
  }
  for (const storeId of storeIds) {
    const list = await cookiesOf(site, storeId);
    for (const c of list) {
      if (!belongsTo(c.domain, site)) continue;
      if (storeId !== undefined && c.storeId !== undefined && c.storeId !== storeId) continue;
      hosts.add(String(c.domain).replace(/^\./, '').toLowerCase());
      await removeCookie(c);
    }
  }

  for (const h of hosts) {
    if (!belongsTo(h, site)) continue;
    origins.add('https://' + urlHost(h));
    origins.add('http://' + urlHost(h));
  }
  // Firefox matches "host" or "host:port" exactly, so non-default ports are listed too.
  const hostnames = new Set([...hosts].filter((h) => belongsTo(h, site)).map(urlHost));
  for (const o of origins) {
    try {
      const u = new URL(o);
      if (belongsTo(u.hostname.replace(/^\[|\]$/g, ''), site)) hostnames.add(u.host);
    } catch (e) {
      // ignore
    }
  }

  const firefoxStore = typeof store === 'string' && store.startsWith('firefox-');
  const chromeIncognito = store === '1';
  const fxTypes = { indexedDB: true, localStorage: true, serviceWorkers: true };
  const attempts = [];
  if (chromeIncognito) {
    // Chrome's site-data removal reaches the normal profile, not the incognito
    // one, whose storage disappears with its window anyway: cookies only.
  } else if (firefoxStore) {
    attempts.push([{ hostnames: [...hostnames], cookieStoreId: store }, fxTypes]);
    attempts.push([{ hostnames: [...hostnames], cookieStoreId: store }, { localStorage: true }]);
    if (store === 'firefox-default') {
      attempts.push([{ hostnames: [...hostnames] }, fxTypes]);
      attempts.push([{ hostnames: [...hostnames] }, { localStorage: true }]);
    }
  } else {
    // Chrome
    attempts.push([{ origins: [...origins] }, { cacheStorage: true, indexedDB: true, localStorage: true, serviceWorkers: true }]);
    // Firefox without a known store
    attempts.push([{ hostnames: [...hostnames] }, fxTypes]);
    attempts.push([{ hostnames: [...hostnames] }, { localStorage: true }]);
  }
  for (const [options, types] of attempts) {
    try {
      await api.browsingData.remove(options, types);
      break;
    } catch (e) {
      // this browser does not take that shape: try the next
    }
  }
}

function keyOf(entry) {
  return entry.s + '|' + (entry.c === undefined ? '' : entry.c);
}

function merge(a, b) {
  const sameSite = a && b && a.s === b.s && sameStore(a.c, b.c);
  const base = b || a;
  const out = {
    s: base.s,
    o: [...new Set([...((sameSite && a.o) || []), ...(base.o || [])])].slice(0, 20),
    wall: Boolean(base.wall || (sameSite && a.wall)),
  };
  const c = base.c !== undefined ? base.c : sameSite ? a.c : undefined;
  if (c !== undefined) out.c = c;
  return out;
}

// Entries that lost their tab are released: if another open tab of the same
// cookie store still shows the site, the entry moves to that tab (so the wipe
// happens when it closes); otherwise the site is wiped. `goneTabId` is a tab
// known to be closing even if the browser still lists it. Entries of tabs that
// vanished without an event reaching us are swept up the same way.
async function release(st, extras, goneTabId) {
  const w = st.w;
  let tabs;
  try {
    tabs = await api.tabs.query({});
  } catch (e) {
    return false; // cannot tell what is still open: delete nothing
  }
  if (!Array.isArray(tabs)) return false;
  const open = tabs.filter((t) => t && typeof t.id === 'number' && t.id !== goneTabId);
  const stores = await tabStores();
  const storeOfTab = (t) => stores.of(t.id, storeOf(t));
  const openIds = new Set(open.map((t) => String(t.id)));
  const queue = [...extras];
  for (const id of Object.keys(w)) {
    if (openIds.has(id)) continue;
    queue.push(w[id]);
    delete w[id];
  }
  if (queue.length === 0) return true;
  const settings = await readSettings();
  const toWipe = new Map();
  let guard = 0;
  while (queue.length && guard++ < 500) {
    const entry = queue.shift();
    if (!entry || !entry.s) continue;
    const wanted = entry.wall ? settings.wipeWalls || settings.wipeAll : settings.wipeAll;
    if (!wanted) continue;
    const holder = open.find((t) => {
      const parsed = parseUrl(pageUrlOf(t.url || t.pendingUrl || '') || '');
      return parsed && parsed.site === entry.s && sameStore(entry.c, storeOfTab(t));
    });
    if (!holder) {
      const k = keyOf(entry);
      toWipe.set(k, toWipe.has(k) ? merge(toWipe.get(k), entry) : entry);
      continue;
    }
    const other = w[holder.id];
    if (other && (other.s !== entry.s || !sameStore(other.c, entry.c))) {
      // The holder tab was remembered for a site it no longer shows: that entry
      // is released too instead of being overwritten.
      queue.push(other);
      delete w[holder.id];
      w[holder.id] = merge(null, entry);
    } else {
      w[holder.id] = merge(other, entry);
    }
    if (w[holder.id].c === undefined && storeOfTab(holder) !== undefined) w[holder.id].c = storeOfTab(holder);
  }
  // A site about to be wiped that is still pending elsewhere goes with it.
  for (const k of toWipe.keys()) delete st.p[k];
  await saveState(st);
  for (const entry of toWipe.values()) await wipeSite(entry);
  return true;
}

function schedule(p) {
  const dues = Object.values(p).map((x) => x.due).filter((d) => typeof d === 'number');
  if (!dues.length) {
    try {
      api.alarms?.clear?.(ALARM);
    } catch (e) {
      // ignore
    }
    return;
  }
  const when = Math.min(...dues);
  try {
    if (api.alarms && typeof api.alarms.create === 'function') {
      const r = api.alarms.create(ALARM, { when: Math.max(when, Date.now() + 1000) });
      if (r && typeof r.catch === 'function') r.catch(() => {});
      return;
    }
  } catch (e) {
    // fall back to a timer; any later tab event also flushes overdue entries
  }
  const timer = setTimeout(() => {
    flushPending();
  }, Math.max(0, when - Date.now()) + 50);
  // Node (unit tests) must not stay alive for it.
  if (timer && typeof timer.unref === 'function') timer.unref();
}

// Takes the left sites whose grace period is over out of the pending list.
function takeDue(st, now) {
  const due = [];
  for (const [k, x] of Object.entries(st.p)) {
    if (!x || typeof x.due !== 'number' || x.due <= now) {
      if (x && x.e) due.push(x.e);
      delete st.p[k];
    }
  }
  return due;
}

// Releases `due` (and entries of vanished tabs). If the open tabs cannot be
// listed, the due sites stay pending for the next chance.
async function releaseDue(st, due, now, goneTabId) {
  const ok = await release(st, due, goneTabId);
  if (!ok && due.length) {
    for (const e of due) st.p[keyOf(e)] = { e, due: now + LEAVE_GRACE_MS };
    await saveState(st);
  }
}

async function flushDue(st, now) {
  const due = takeDue(st, now);
  if (due.length) await releaseDue(st, due, now, undefined);
}

export function flushPending(now = Date.now()) {
  return locked(async () => {
    const st = await loadState();
    if (!Object.keys(st.p).length) return;
    await flushDue(st, now);
    schedule(st.p);
  });
}

export function isWipeAlarm(alarm) {
  return Boolean(alarm && alarm.name === ALARM);
}

function remember(w, tabId, parsed, wall, store) {
  const prev = w[tabId];
  const same = prev && prev.s === parsed.site && sameStore(prev.c, store);
  w[tabId] = merge(same ? prev : null, { s: parsed.site, o: [parsed.origin], wall: Boolean(wall), ...(store !== undefined ? { c: store } : {}) });
}

// The top frame of a tab is now at `url` (may be a non-web page, or '' when the
// browser does not tell us which non-web page). `store` is the tab's cookie store.
export function navigated(tabId, url, store) {
  if (typeof tabId !== 'number') return Promise.resolve();
  const storeP = storeForTab(tabId, store);
  return locked(async () => {
    const page = pageUrlOf(url);
    if (page === null) return; // about:blank and the like: nothing changed
    store = await storeP;
    const parsed = parseUrl(page);
    const st = await loadState();
    const w = st.w;
    const prev = w[tabId];
    const now = Date.now();
    const before = JSON.stringify(st);
    const hadPending = Object.keys(st.p).length > 0;
    if (prev && (!parsed || parsed.site !== prev.s || !sameStore(prev.c, store))) {
      delete w[tabId];
      // The tab is still open but shows something else now: wipe later unless
      // the site comes back.
      const k = keyOf(prev);
      st.p[k] = { e: st.p[k] ? merge(st.p[k].e, prev) : prev, due: now + LEAVE_GRACE_MS };
    }
    let back = null;
    if (parsed) {
      for (const [k, x] of Object.entries(st.p)) {
        if (x.e && x.e.s === parsed.site && sameStore(x.e.c, store)) {
          back = back ? merge(back, x.e) : x.e;
          delete st.p[k];
        }
      }
    }
    await flushDue(st, now);
    if (parsed) {
      const same = prev && prev.s === parsed.site && sameStore(prev.c, store);
      if (back) {
        w[tabId] = merge(same ? prev : null, back);
        if (store !== undefined) w[tabId].c = store;
        remember(w, tabId, parsed, false, store);
      } else if (same || (await readSettings()).wipeAll) {
        remember(w, tabId, parsed, false, store);
      }
    }
    if (JSON.stringify(st) !== before) await saveState(st);
    if (hadPending || Object.keys(st.p).length) schedule(st.p);
  });
}

// A content script in this tab saw a wall that cannot be declined.
export function wallSeen(tabId, url, store) {
  if (typeof tabId !== 'number') return Promise.resolve();
  const storeP = storeForTab(tabId, store);
  return locked(async () => {
    const parsed = parseUrl(pageUrlOf(url) || '');
    if (!parsed) return;
    const settings = await readSettings();
    if (!settings.wipeWalls && !settings.wipeAll) return;
    store = await storeP;
    const st = await loadState();
    remember(st.w, tabId, parsed, true, store);
    await saveState(st);
  });
}

// More origins seen in a remembered tab (its frames). Only origins of the
// remembered site are kept.
export function addOrigins(tabId, list) {
  if (typeof tabId !== 'number' || !Array.isArray(list)) return Promise.resolve();
  return locked(async () => {
    const st = await loadState();
    const entry = st.w[tabId];
    if (!entry) return;
    const extra = [];
    for (const o of list) {
      const parsed = typeof o === 'string' ? parseUrl(o) : null;
      if (parsed && parsed.site === entry.s) extra.push(parsed.origin);
    }
    if (extra.length === 0) return;
    entry.o = [...new Set([...(entry.o || []), ...extra])].slice(0, 20);
    await saveState(st);
  });
}

export function tabClosed(tabId) {
  if (typeof tabId !== 'number') return Promise.resolve();
  return locked(async () => {
    const st = await loadState();
    if (Object.keys(st.w).length === 0 && Object.keys(st.p).length === 0) return;
    const now = Date.now();
    const hadPending = Object.keys(st.p).length > 0;
    await releaseDue(st, takeDue(st, now), now, tabId);
    if (hadPending || Object.keys(st.p).length) schedule(st.p);
  });
}
