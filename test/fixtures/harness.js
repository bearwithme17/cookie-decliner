// Page-side recorder for the fixtures. This is test code that plays the role of
// a website; it is not part of the extension.
//
// Markup contract: an element with data-cd="<event>" reports <event> when it is
// clicked (accepted, rejected, settings, saved, ...). data-cd-hide="<selector>"
// on the same element hides that selector afterwards, like a real banner closing.
//
//   CDT.report(event, detail)   record an event and post it to the test server
//   CDT.wire(root)              attach the click recorders inside root (document by default)
//   CDT.events                  everything recorded in this document
(function () {
  var params = new URLSearchParams(location.search);
  var fixture = params.get('fixture') || (location.pathname.split('/').pop() || '').replace(/\.html$/, '');
  var events = [];

  function report(event, detail) {
    events.push(event);
    if (window.top !== window) {
      try { window.top.postMessage({ cdt: event }, '*'); } catch (e) {}
    }
    try {
      fetch('/__event', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ fixture: fixture, event: event, detail: detail === undefined ? null : detail }),
        keepalive: true,
      }).catch(function () {});
    } catch (e) {}
  }

  function wire(root) {
    (root || document).querySelectorAll('[data-cd]').forEach(function (el) {
      if (el.__cdWired) return;
      el.__cdWired = true;
      el.addEventListener('click', function (ev) {
        report(el.getAttribute('data-cd'), { trusted: ev.isTrusted });
        var hide = el.getAttribute('data-cd-hide');
        if (hide) {
          document.querySelectorAll(hide).forEach(function (n) { n.style.display = 'none'; });
        }
      });
    });
  }

  window.CDT = { fixture: fixture, events: events, report: report, wire: wire, params: params };

  // Debug builds of the Safari version write their findings into <html data-cd-debug>.
  setTimeout(function () {
    var d = document.documentElement.getAttribute('data-cd-debug');
    if (d) report('cd-debug', d);
  }, 3000);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { wire(document); });
  } else {
    wire(document);
  }

  // Chain mode (Firefox smoke run, where nothing drives the browser from outside):
  // ?chain=<i> makes the top frame move on to /__next?i=<i+1> shortly after a
  // decisive event, or after ?after=<ms> when nothing happens.
  var chain = params.get('chain');
  if (chain !== null && window.top === window) {
    var moved = false;
    var move = function (delay) {
      if (moved) return;
      moved = true;
      setTimeout(function () { location.href = '/__next?i=' + (Number(chain) + 1); }, delay);
    };
    var decisive = function (event) { return event === 'rejected' || event === 'accepted' || event === 'subscribed'; };
    var ownReport = report;
    window.CDT.report = report = function (event, detail) {
      ownReport(event, detail);
      if (decisive(event)) move(1500);
    };
    window.addEventListener('message', function (ev) {
      if (ev.data && typeof ev.data.cdt === 'string' && decisive(ev.data.cdt)) move(1500);
    });
    setTimeout(function () { move(0); }, Number(params.get('after')) || 12000);
  }
})();
