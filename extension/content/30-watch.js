// Three small jobs around the engine run in 20-supervisor.js:
//
//   1. Pay-or-accept walls. A consent message that offers only "accept" or
//      "subscribe" cannot be declined. It is never clicked. The frame that sees
//      it sends {t:'wall'} (no URL, no text) so the background can wipe the
//      site's cookies once its last tab closes; the top frame then hides the
//      wall and releases the scroll lock. Hiding gives no consent.
//   2. Late banners. If the first run found nothing, watch for consent-looking
//      elements appearing and run the engine again, a few times at most.
//   3. In-page navigation. A route change in a single-page app gets a fresh run.
//
// Everything is bounded: fixed numbers of retries, timers and observers, all of
// which stop on their own.
(function () {
  'use strict';

  if (typeof CD !== 'object' || CD === null || typeof CD.requestRun !== 'function') return;
  var api = globalThis.browser || globalThis.chrome;
  if (!api || !api.runtime) return;

  var isTop = false;
  try {
    isTop = window.top === window;
  } catch (e) {
    isTop = false;
  }

  function tell(message) {
    try {
      var p = api.runtime.sendMessage(message);
      if (p && typeof p.catch === 'function') p.catch(function () {});
    } catch (e) {
      // background gone: nothing to do
    }
  }

  // ---- 1. walls ------------------------------------------------------------
  // Sourcepoint marks its "subscribe instead" button with choice type 9. That
  // button only exists on pay-or-accept messages (bild.de, spiegel.de, t-online.de ...).
  var WALL_SELECTOR = '.message-button.sp_choice_type_9, .sp_choice_type_9';
  var WALL_CHECKS = [300, 1000, 2500, 5000, 9000, 15000];
  var wallReported = false;

  // Some walls (heise.de) carry no subscribe button, only a link. Signs: a
  // Sourcepoint message with an accept button, no reject button, and wording
  // that offers an ad-free subscription instead.
  var WALL_WORDS = /\bpur\b|pur-abo|werbefrei|ohne werbung und tracking|contentpass|ad-free subscription/i;
  function isUnmarkedWall() {
    if (!document.querySelector('.message-button.sp_choice_type_11')) return false;
    if (document.querySelector('.sp_choice_type_13, .sp_choice_type_REJECT_ALL')) return false;
    // Only the message's own text counts, not the rest of the page.
    var box = document.querySelector('.message-container');
    var text = box ? String(box.textContent || '').slice(0, 20000) : '';
    return WALL_WORDS.test(text);
  }

  function reportWall() {
    tell({ t: 'wall' });
  }

  function checkWall() {
    if (wallReported) return true;
    var found = false;
    try {
      found = Boolean(document.querySelector(WALL_SELECTOR)) || isUnmarkedWall();
    } catch (e) {
      found = false;
    }
    if (!found) return false;
    wallReported = true;
    CD.wall = true;
    reportWall();
    if (isTop) hideWall();
    return true;
  }

  function scheduleWallChecks() {
    WALL_CHECKS.forEach(function (ms) {
      setTimeout(function () {
        checkWall();
      }, ms);
    });
  }

  var WALL_CSS =
    'div[id^="sp_message_container_"]{display:none!important}' +
    'html.sp-message-open,html.sp-message-open body{overflow:auto!important;position:static!important}';
  var wallHidden = false;

  // Back from the back/forward cache: the background forgot this tab's site when
  // the tab left it, so the wall is reported again.
  window.addEventListener('pageshow', function (event) {
    if (event && event.persisted && wallReported) reportWall();
  });

  function hideWall() {
    if (wallHidden) return;
    wallHidden = true;
    try {
      var style = document.createElement('style');
      style.textContent = WALL_CSS;
      (document.head || document.documentElement).appendChild(style);
    } catch (e) {
      // ignore
    }
  }

  if (isTop && api.runtime.onMessage && typeof api.runtime.onMessage.addListener === 'function') {
    try {
      api.runtime.onMessage.addListener(function (message, sender) {
        // Only our own background sends this; it carries nothing but the type.
        if (sender && sender.id === api.runtime.id && !sender.tab && message && message.t === 'hide') hideWall();
        return false;
      });
    } catch (e) {
      // ignore
    }
  }

  // ---- 2. late banners -------------------------------------------------------
  var GATE =
    // Bare iframes are not a sign: ads insert them all the time and would use up
    // the late runs. Consent iframes carry a telling src, id or class.
    'dialog,[role="dialog"],[role="alertdialog"],[aria-modal="true"],' +
    'iframe[src*="consent" i],iframe[src*="privacy" i],iframe[src*="cmp" i],iframe[src*="cookie" i],' +
    '[id*="cookie" i],[class*="cookie" i],[id*="consent" i],[class*="consent" i],' +
    '[id*="cmp" i],[class*="cmp" i],[id*="gdpr" i],[class*="gdpr" i],[id*="privacy" i],[class*="privacy" i],' +
    '[id*="onetrust" i],[id*="usercentrics" i],[id*="didomi" i],[id^="sp_message"]';
  var WATCH_MS = 45000;
  var MAX_LATE_RUNS = 3;
  var MIN_GAP_MS = 3000;
  var DEBOUNCE_MS = 600;

  var observer = null;
  var watchTimer = 0;
  var debounceTimer = 0;
  var lateRuns = 0;
  var lastRunAt = 0;
  var hit = false;

  function looksLikeConsent(node) {
    if (!node || node.nodeType !== 1) return false;
    try {
      if (node.shadowRoot) return true;
      return node.matches(GATE) || Boolean(node.querySelector(GATE));
    } catch (e) {
      return false;
    }
  }

  function stopWatch() {
    if (observer) {
      try {
        observer.disconnect();
      } catch (e) {
        // ignore
      }
      observer = null;
    }
    clearTimeout(watchTimer);
    clearTimeout(debounceTimer);
    watchTimer = 0;
    debounceTimer = 0;
  }

  function lateRun() {
    debounceTimer = 0;
    if (!hit) return;
    hit = false;
    var status = CD.status || {};
    if (status.done || CD.wall) {
      stopWatch();
      return;
    }
    if (status.running) {
      debounceTimer = setTimeout(lateRun, MIN_GAP_MS);
      hit = true;
      return;
    }
    var wait = MIN_GAP_MS - (Date.now() - lastRunAt);
    if (wait > 0) {
      debounceTimer = setTimeout(lateRun, wait);
      hit = true;
      return;
    }
    lateRuns++;
    lastRunAt = Date.now();
    stopWatch(); // the run's end arms the watch again if runs remain
    CD.requestRun({ detectRetries: 3 });
  }

  function startWatch(ms) {
    if (observer || lateRuns >= MAX_LATE_RUNS || !document.documentElement) return;
    try {
      observer = new MutationObserver(function (records) {
        if (hit) return;
        var looked = 0;
        for (var i = 0; i < records.length && looked < 20; i++) {
          var added = records[i].addedNodes;
          for (var j = 0; j < added.length && looked < 20; j++) {
            if (added[j].nodeType !== 1) continue;
            looked++;
            if (looksLikeConsent(added[j])) {
              hit = true;
              break;
            }
          }
          if (hit) break;
        }
        if (hit && !debounceTimer) debounceTimer = setTimeout(lateRun, DEBOUNCE_MS);
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
      watchTimer = setTimeout(stopWatch, ms);
    } catch (e) {
      observer = null;
    }
  }

  // Called by the supervisor each time an engine run has finished.
  CD.onRunEnd = function (status) {
    lastRunAt = Date.now();
    if (checkWall()) return;
    if (status && status.done) {
      stopWatch();
      return;
    }
    if (isTop) startWatch(WATCH_MS);
  };

  // ---- 3. in-page navigation -------------------------------------------------
  var MAX_NAV_RUNS = 5;
  var navRuns = 0;
  var navTimer = 0;
  var lastPath = '';
  try {
    lastPath = location.pathname + location.search;
  } catch (e) {
    lastPath = '';
  }

  function onRouteChange() {
    var now = '';
    try {
      now = location.pathname + location.search;
    } catch (e) {
      return;
    }
    if (now === lastPath) return;
    lastPath = now;
    if (navRuns >= MAX_NAV_RUNS || navTimer) return;
    var startNavRun = function () {
      navTimer = 0;
      var status = CD.status || {};
      if (CD.wall) return;
      if (status.running) {
        // Try again when the current run has had time to finish, so the new
        // route is not lost.
        navTimer = setTimeout(startNavRun, 1000);
        return;
      }
      navRuns++;
      lateRuns = 0;
      status.done = false;
      CD.requestRun({ detectRetries: 8 });
    };
    navTimer = setTimeout(startNavRun, 1000);
  }

  // Without the Navigation API, history.pushState cannot be seen from the
  // isolated world, so the path is compared once a second. Stops once the
  // in-page navigation budget is used up.
  function pollRoute() {
    var poll = setInterval(function () {
      if (navRuns >= MAX_NAV_RUNS || CD.wall) {
        clearInterval(poll);
        return;
      }
      onRouteChange();
    }, 1000);
  }

  if (isTop) {
    try {
      if (globalThis.navigation && typeof globalThis.navigation.addEventListener === 'function') {
        globalThis.navigation.addEventListener('navigatesuccess', onRouteChange);
      } else {
        window.addEventListener('popstate', onRouteChange);
        pollRoute();
      }
    } catch (e) {
      // ignore
    }
  }

  // ---- start -----------------------------------------------------------------
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scheduleWallChecks, { once: true });
  } else {
    scheduleWallChecks();
  }
})();
