// Debug builds only (CD_DEBUG=1): writes what the content scripts and the
// background report into <html data-cd-debug>, which the test pages send to the
// fixture server. Never shipped.
(function () {
  var api = globalThis.browser || globalThis.chrome;
  var out = { cs: true, top: window.top === window, cd: typeof CD, status: null };
  function write() {
    try { out.status = typeof CD === 'object' && CD && CD.status ? CD.status : null; document.documentElement.setAttribute('data-cd-debug', JSON.stringify(out)); } catch (e) {}
  }
  write();
  try {
    api.runtime.sendMessage({ t: 'init' }).then(function (r) { out.init = r ? Object.keys(r.rules || {}).map(function (k) { var v = r.rules[k]; return k + ':' + (Array.isArray(v) ? v.length : typeof v); }) : String(r); write(); }, function (e) { out.init = 'err ' + e; write(); });
    api.runtime.sendMessage({ t: 'cd-debug' }).then(function (r) { out.bg = r; write(); }, function (e) { out.bg = 'err ' + e; write(); });
  } catch (e) { out.send = 'err ' + e; write(); }
  setInterval(write, 1000);
})();
