// Background: service worker in Chrome, event page in Firefox (ES module in both).
//
// It answers three requests from our own content scripts:
//   {t:'init'}            -> {rules}  the rule subset for the sender's frame
//   {t:'eval', s:<id>}    -> {r}      runs one packaged snippet in the page's MAIN world
//   {t:'wall'}            -> nothing  the tab shows a pay-or-accept wall: remember the
//                                     tab's site in memory so its cookies are wiped when
//                                     the last tab for it closes (see background/wipe.js).
//                                     Accepted only from the top frame, a frame of the
//                                     same site, or Sourcepoint's own message hosts.
//
// Nothing is logged or sent anywhere. Nothing about visited sites is written to
// disk: the only state is the in-memory tab list in background/wipe.js.

import { filterCompactRules } from './vendor/autoconsent/autoconsent.esm.js';
import COMPACT from './vendor/autoconsent/compact-rules.js';
import { SAFE_SNIPPETS } from './vendor/autoconsent/snippets.generated.js';
import { extraRulesFor } from './background/extra-rules.js';
import { navigated, wallSeen, tabClosed, addOrigins, flushPending, isWipeAlarm, parseUrl, storeOf } from './background/wipe.js';

const api = globalThis.browser ?? globalThis.chrome;

// Only our own content scripts, running in a tab frame, are served.
function fromOwnContentScript(sender) {
  return Boolean(
    sender &&
      sender.id === api.runtime.id &&
      sender.tab &&
      typeof sender.tab.id === 'number' &&
      typeof sender.frameId === 'number',
  );
}

function handleInit(sender, sendResponse) {
  const mainFrame = sender.frameId === 0;
  const url = sender.url || (sender.origin ? sender.origin + '/' : '');
  sendResponse({
    rules: {
      autoconsent: extraRulesFor(url, mainFrame),
      compact: filterCompactRules(COMPACT, { url, mainFrame }),
    },
  });
}

function handleEval(message, sender, sendResponse) {
  // The id selects a function shipped in this package. Code is never taken from a message.
  const id = message.s;
  const func = typeof id === 'string' && Object.hasOwn(SAFE_SNIPPETS, id) ? SAFE_SNIPPETS[id] : null;
  if (typeof func !== 'function') {
    sendResponse({ r: false });
    return false;
  }
  const tabId = sender.tab.id;
  const inject = (target) => api.scripting.executeScript({ target, world: 'MAIN', func, injectImmediately: true });
  const byFrame = () => inject({ tabId, frameIds: [sender.frameId] });

  let pending;
  if (typeof sender.documentId === 'string') {
    // Exact document. If this browser rejects the documentIds key itself (a
    // synchronous schema error), fall back to the frame id. An asynchronous
    // rejection means the document is gone; then the snippet must not run at all.
    try {
      pending = inject({ tabId, documentIds: [sender.documentId] });
    } catch (e) {
      pending = null;
    }
  }
  if (!pending) {
    try {
      pending = byFrame();
    } catch (e) {
      sendResponse({ r: false });
      return false;
    }
  }
  Promise.resolve(pending).then(
    (results) => {
      try {
        sendResponse({ r: results?.[0]?.result === true });
      } catch (e) {
        // The frame went away while the snippet ran.
      }
    },
    () => {
      try {
        sendResponse({ r: false });
      } catch (e) {
        // Same.
      }
    },
  );
  return true; // keep the channel open for the asynchronous answer
}

// Injected into every frame of a walled tab; returns that frame's origin.
function frameOrigin() {
  return location.origin;
}

// Hosts Sourcepoint serves its consent messages from when not from the site's
// own (cmp.<site>) subdomain.
const WALL_FRAME_HOSTS = ['privacy-mgmt.com', 'mgr.consensu.org'];

async function frameMayReportWall(sender, tabUrl) {
  if (sender.frameId === 0) return true;
  const frame = parseUrl(sender.url || (sender.origin ? sender.origin + '/' : ''));
  if (!frame) return false;
  const tab = parseUrl(tabUrl);
  if (tab && frame.site === tab.site) return true;
  let host = '';
  try {
    host = new URL(frame.origin).hostname;
  } catch (e) {
    return false;
  }
  if (!WALL_FRAME_HOSTS.some((h) => host === h || host.endsWith('.' + h))) return false;
  // A Sourcepoint frame counts only if the page itself shows it: the top frame
  // must hold a Sourcepoint message container with a frame from that host. An
  // ad or embed that loads a Sourcepoint message deeper down does not qualify.
  try {
    const hosts = await api.tabs.sendMessage(sender.tab.id, { t: 'spframes' }, { frameId: 0 });
    return Array.isArray(hosts) && hosts.includes(host);
  } catch (e) {
    return false;
  }
}

// A frame reported a wall that cannot be declined. The site is taken from the
// tab, never from the message, and a third-party frame (an ad, an embed) cannot
// report one for the page that embeds it. The top frame is told to hide the wall.
function handleWall(sender) {
  const tabId = sender.tab.id;
  const known = sender.tab.url || (sender.frameId === 0 ? sender.url : '');
  const url = known ? Promise.resolve(known) : Promise.resolve(api.tabs.get(tabId)).then((t) => (t && t.url) || '', () => '');
  const store = storeOf(sender.tab);
  const trusted = url.then(async (u) => ({ u, ok: await frameMayReportWall(sender, u) }));
  trusted
    .then(({ u, ok }) => {
      if (!ok) throw new Error('not trusted');
      return wallSeen(tabId, u, store);
    })
    // Site storage is kept per origin, so the wipe needs the origins of the
    // tab's frames (consent frames usually sit on a subdomain).
    .then(() => api.scripting.executeScript({ target: { tabId, allFrames: true }, func: frameOrigin }))
    .then((results) => addOrigins(tabId, (results || []).map((r) => r && r.result)))
    .catch(() => {});
  trusted
    .then(({ ok }) => {
      if (!ok) return;
      const p = api.tabs.sendMessage(tabId, { t: 'hide' }, { frameId: 0 });
      if (p && typeof p.catch === 'function') p.catch(() => {});
    })
    .catch(() => {
      // The tab went away.
    });
}

// Registered synchronously at top level so a cold-started worker never misses a message.
api.runtime.onMessage.addListener((message, sender, sendResponse) => {
  try {
    if (!message || typeof message !== 'object' || !fromOwnContentScript(sender)) return false;
    if (message.t === 'init') {
      handleInit(sender, sendResponse);
      if (sender.frameId === 0) navigated(sender.tab.id, sender.url || sender.tab.url || '', storeOf(sender.tab));
      return false;
    }
    if (message.t === 'wall') {
      handleWall(sender);
      return false;
    }
    if (message.t === 'eval') {
      return handleEval(message, sender, sendResponse);
    }
  } catch (e) {
    try {
      sendResponse(null);
    } catch (e2) {
      // Nothing to do.
    }
  }
  return false;
});

try {
  api.tabs.onRemoved.addListener((tabId) => {
    tabClosed(tabId);
  });
  api.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (!changeInfo) return;
    if (typeof changeInfo.url === 'string') {
      navigated(tabId, changeInfo.url, storeOf(tab));
    } else if (changeInfo.status === 'loading' && tab && tab.url === undefined && tab.pendingUrl === undefined) {
      // Without the "tabs" permission the browser hides the URL of non-web pages
      // (new tab page, about:, file:): the tab has left any web site.
      navigated(tabId, '', storeOf(tab));
    }
  });
} catch (e) {
  // Without tab events the wipe cannot run; declining still works.
}

try {
  // Sites a tab left are wiped after a grace period (see background/wipe.js).
  api.alarms.onAlarm.addListener((alarm) => {
    if (isWipeAlarm(alarm)) flushPending();
  });
} catch (e) {
  // No alarms: overdue wipes run at the next tab event instead.
}
