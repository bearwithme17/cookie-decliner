// Debug builds only (CD_DEBUG=1): the normal background plus a {t:'cd-debug'}
// answer describing what this browser offers. Never shipped.
import { errors } from './capture.js';
import '../../extension/background.js';

const api = globalThis.browser ?? globalThis.chrome;
api.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.t !== 'cd-debug') return false;
  (async () => {
    const info = { errors, sender: { id: sender.id === api.runtime.id, tab: sender.tab ? { id: sender.tab.id, url: sender.tab.url, incognito: sender.tab.incognito } : null, frameId: sender.frameId, url: sender.url, origin: sender.origin, documentId: sender.documentId } };
    info.apis = ['storage', 'alarms', 'cookies', 'scripting', 'declarativeNetRequest', 'tabs', 'browsingData'].filter((k) => api[k]);
    info.session = Boolean(api.storage && api.storage.session);
    try { info.rulesets = await api.declarativeNetRequest.getEnabledRulesets(); } catch (e) { info.rulesets = 'err ' + e; }
    try { info.dynamic = (await api.declarativeNetRequest.getDynamicRules()).length; } catch (e) { info.dynamic = 'err ' + e; }
    try {
      const r = await api.scripting.executeScript({ target: { tabId: sender.tab.id, frameIds: [sender.frameId] }, world: 'MAIN', func: () => typeof window.CDT });
      info.mainWorld = r && r[0] && r[0].result;
    } catch (e) { info.mainWorld = 'err ' + e; }
    try {
      const r = await api.scripting.executeScript({ target: { tabId: sender.tab.id, documentIds: [sender.documentId] }, world: 'MAIN', func: () => 1 });
      info.byDocumentId = r && r[0] && r[0].result;
    } catch (e) { info.byDocumentId = 'err ' + e; }
    try { info.cookieStores = (await api.cookies.getAllCookieStores()).map((c) => ({ id: c.id, tabs: (c.tabIds || []).length })); } catch (e) { info.cookieStores = 'err ' + e; }
    const host = sender.url ? new URL(sender.url).hostname : '';
    let first = '0';
    try { first = (await api.cookies.getAllCookieStores())[0].id; } catch (e) { /* keep '0' */ }
    for (const [k, q] of Object.entries({ chrome0: { domain: host, storeId: '0' }, withPartition: { domain: host, storeId: first, partitionKey: {} }, withFpd: { domain: host, storeId: first, firstPartyDomain: null, partitionKey: {} }, plain: { domain: host, storeId: first }, noStore: { domain: host } })) {
      try { info['cookies_' + k] = (await api.cookies.getAll(q)).map((c) => c.name + '@' + c.domain + '#' + c.storeId).join(','); } catch (e) { info['cookies_' + k] = 'err ' + e; }
    }
    try { info.tabsQuery = (await api.tabs.query({})).map((t) => typeof t.url).join(','); } catch (e) { info.tabsQuery = 'err ' + e; }
    sendResponse(info);
  })();
  return true;
});
