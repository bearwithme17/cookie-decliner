// Runs the vendored engine once per document, in the isolated world of every frame.
//
// What crosses to the background: {t:'init'} and {t:'eval', s:<snippet id>}.
// Nothing else. The engine's own lifecycle messages (which carry the page URL)
// are consumed in this file and go no further. No port is opened.
//
// Guarantees enforced here rather than trusted to the engine:
//   - opt-in is impossible (doOptIn is a no-op);
//   - no click made from this world lands on a button labelled accept / agree /
//     OK (see guardClicks and the HTMLElement.prototype.click wrapper);
//   - nothing thrown or rejected by the engine reaches the page's developer tools.
(function () {
  'use strict';

  if (typeof CD !== 'object' || CD === null) return;
  var Base = typeof CD_MODULE === 'object' && CD_MODULE && CD_MODULE.exports && CD_MODULE.exports.default;
  var api = globalThis.browser || globalThis.chrome;
  if (typeof Base !== 'function' || !api || !api.runtime || typeof api.runtime.sendMessage !== 'function') return;

  var CONFIG = Object.freeze({
    enabled: true,
    autoAction: 'optOut',
    disabledCmps: [],
    enablePrehide: true,
    enableCosmeticRules: true,
    enableGeneratedRules: true,
    enableHeuristicDetection: false,
    enablePopupMutationObserver: false,
    detectRetries: 20,
    isMainWorld: false,
    prehideTimeout: 2000,
    visualTest: false,
    performanceLoggingEnabled: false,
    heuristicPopupSearchTimeout: 100,
    enableHeuristicHitTest: false,
    heuristicMode: 'reject',
    logs: Object.freeze({
      lifecycle: false, rulesteps: false, detectionsteps: false, evals: false,
      errors: false, messages: false, waits: false,
    }),
  });

  // Settings no caller of requestRun() can change.
  var LOCKED = Object.freeze({
    enabled: true,
    autoAction: 'optOut',
    heuristicMode: 'reject',
    isMainWorld: false,
    visualTest: false,
    performanceLoggingEnabled: false,
    enableHeuristicDetection: false,
    logs: CONFIG.logs,
  });

  var isTop = false;
  try {
    isTop = window.top === window;
  } catch (e) {
    isTop = false;
  }

  // Plain in-memory facts about this document, for the other content scripts.
  // Never sent anywhere.
  var status = (CD.status = {
    runs: 0,          // engine runs started in this document
    running: false,   // a run is in progress (detection or opt-out)
    lifecycle: 'idle',// last lifecycle value the engine reported
    acted: false,     // an opt-out was started at least once
    done: false,      // an opt-out finished successfully
  });

  function noop() {}

  // One request to the background. Resolves to the reply, or undefined on any
  // failure (worker gone, extension reloaded, no listener). Never rejects.
  function ask(message) {
    try {
      var p = api.runtime.sendMessage(message);
      if (p && typeof p.then === 'function') {
        return p.then(function (v) { return v; }, function () { return undefined; });
      }
    } catch (e) {
      // fall through
    }
    return Promise.resolve(undefined);
  }

  // ---- click guard -------------------------------------------------------
  // Every click the engine's rules make goes through domActions.click or
  // domActions.clickElement. Both are replaced per instance so a button whose
  // label means accept / agree / OK is skipped, whichever rule selected it.
  function isAccept(el) {
    try {
      return CD.heuristic.isAcceptElement(el);
    } catch (e) {
      return true; // cannot tell: do not click
    }
  }

  // Some of the engine's built-in CMP handlers (TikTok, Sourcepoint, Unic ...)
  // call element.click() themselves instead of going through domActions. The
  // isolated world has its own copy of HTMLElement.prototype, so click() is
  // wrapped there too: the page never sees this, and every click made from this
  // extension's content scripts gets the same veto. Not covered: synthetic
  // events (dispatchEvent) and the packaged page-world snippets (run through
  // scripting.executeScript in the page's own world, where this wrapper does not
  // exist). Those snippets are fixed, reviewed reject actions; a page cannot
  // choose or change them.
  var nativeClick = null;
  try {
    nativeClick = HTMLElement.prototype.click;
    if (typeof nativeClick === 'function') {
      var guarded = function click() {
        if (isAccept(this)) return undefined;
        return nativeClick.call(this);
      };
      Object.defineProperty(HTMLElement.prototype, 'click', { value: guarded, writable: true, configurable: true });
    }
  } catch (e) {
    // keep the per-call checks below
  }
  function press(el) {
    if (typeof nativeClick === 'function') nativeClick.call(el);
    else el.click();
  }

  function guardClicks(engine) {
    var actions = engine.domActions;
    actions.clickElement = async function (el) {
      if (!el || !(el instanceof HTMLElement) || isAccept(el)) return false;
      press(el);
      return true;
    };
    actions.click = async function (selector, all) {
      var elements = this.elementSelector(selector);
      if (elements.length === 0) return false;
      if (!all) {
        if (isAccept(elements[0])) return false;
        press(elements[0]);
        return true;
      }
      var clicked = false;
      for (var i = 0; i < elements.length; i++) {
        if (isAccept(elements[i])) continue;
        press(elements[i]);
        clicked = true;
        await new Promise(function (resolve) { setTimeout(resolve, 0); });
      }
      return clicked;
    };
  }

  // ---- engine ------------------------------------------------------------
  class Engine extends Base {
    async _start() {
      try {
        return await super._start();
      } catch (e) {
        return false;
      } finally {
        this.cdRun.detecting = false;
        settle(this.cdRun);
      }
    }
    async handlePopup(cmp) {
      // The engine calls this without awaiting it, so it must not reject.
      this.cdRun.optOuts++;
      try {
        return await super.handlePopup(cmp);
      } catch (e) {
        return false;
      } finally {
        this.cdRun.optOuts--;
        settle(this.cdRun);
      }
    }
    async doOptOut() {
      try {
        return await super.doOptOut();
      } catch (e) {
        try {
          if (this.shouldPrehide) this.undoPrehide();
        } catch (e2) {
          // ignore
        }
        return false;
      }
    }
    async doOptIn() {
      return false; // this extension never opts in
    }
    async doSelfTest() {
      return false; // self-tests exist for upstream's CI; not needed here
    }
  }

  // Messages the engine emits. Only 'eval' leads to a request to the background.
  function onEngineMessage(run, msg) {
    if (!msg || typeof msg !== 'object') return;
    switch (msg.type) {
      case 'eval':
        evalInPage(run, msg);
        break;
      case 'report':
        if (msg.state && typeof msg.state.lifecycle === 'string') {
          status.lifecycle = msg.state.lifecycle;
          if (status.lifecycle === 'runningOptOut') status.acted = true;
        }
        break;
      case 'optOutResult':
        if (msg.result === true) status.done = true;
        break;
      case 'autoconsentDone':
        status.done = true;
        break;
      default:
        break; // init, cmpDetected, popupFound, autoconsentError, ...: dropped
    }
  }

  // The engine wants a packaged snippet run in the page's world. Only the id is
  // forwarded; msg.code is dropped.
  function evalInPage(run, msg) {
    var id = msg.id;
    var answer = function (result) {
      try {
        var p = run.engine && run.engine.receiveMessageCallback({ type: 'evalResp', id: id, result: result === true });
        if (p && typeof p.catch === 'function') p.catch(noop);
      } catch (e) {
        // ignore
      }
    };
    if (typeof msg.snippetId !== 'string') {
      Promise.resolve().then(function () { answer(false); });
      return;
    }
    ask({ t: 'eval', s: msg.snippetId }).then(function (reply) {
      answer(Boolean(reply && reply.r === true));
    });
  }

  // A run is over when detection has returned and no opt-out is still in flight.
  function settle(run) {
    if (run.settled || run.detecting || run.optOuts > 0) return;
    run.settled = true;
    status.running = false;
    // Extension point: late-banner watch and the own heuristic start from here
    // when status.done is false.
    if (typeof CD.onRunEnd === 'function') {
      try {
        CD.onRunEnd(status);
      } catch (e) {
        // ignore
      }
    }
  }

  function startEngine(rules, overrides) {
    var run = { engine: null, detecting: true, optOuts: 0, settled: false };
    status.runs++;
    try {
      // Constructed without a config on purpose: with one, the constructor
      // prehides before its own domActions field exists and throws. The 'init'
      // message it emits instead is dropped by onEngineMessage.
      var engine = new Engine(function (msg) {
        try {
          onEngineMessage(run, msg);
        } catch (e) {
          // never let a handler error surface inside the engine
        }
      });
      engine.cdRun = run;
      run.engine = engine;
      CD.engine = engine; // latest engine, for the other content scripts
      guardClicks(engine);
      engine.initialize(Object.assign({}, CONFIG, overrides || {}, LOCKED), rules);
    } catch (e) {
      run.detecting = false;
      run.optOuts = 0;
      settle(run);
    }
  }

  // Ask the background for this frame's rules, then run the engine once.
  function requestRun(overrides) {
    if (status.running) return;
    status.running = true;
    ask({ t: 'init' }).then(function (reply) {
      var rules = reply && reply.rules;
      if (!rules || typeof rules !== 'object') {
        status.running = false;
        return;
      }
      startEngine(rules, overrides);
    });
  }
  CD.requestRun = requestRun;

  // ---- boot --------------------------------------------------------------
  function whenDomReady(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn, { once: true });
    } else {
      fn();
    }
  }

  // Sub-frames: skip pixels and collapsed frames. A consent frame that starts
  // collapsed gets a few resize events' worth of second chances, then we stop.
  function bootFrame() {
    var chances = 3;
    var check = function () {
      if (window.innerWidth >= 50 && window.innerHeight >= 50) {
        window.removeEventListener('resize', check);
        requestRun();
      } else if (--chances < 0) {
        window.removeEventListener('resize', check);
      }
    };
    if (window.innerWidth >= 50 && window.innerHeight >= 50) {
      requestRun();
    } else {
      window.addEventListener('resize', check);
    }
  }

  function boot() {
    if (isTop) {
      requestRun();
    } else {
      whenDomReady(bootFrame);
    }
  }

  try {
    if (document.prerendering) {
      document.addEventListener('prerenderingchange', boot, { once: true });
    } else {
      boot();
    }
  } catch (e) {
    // fail silently
  }
})();
