// First isolated-world content script. Declares the three globals the generated
// engine wrapper (vendor/autoconsent/autoconsent.content.js) is called with, plus
// the namespace shared by our own content scripts. These live in the extension's
// isolated world only; the page cannot see them.

// CommonJS-style holder the engine assigns its exports to.
var CD_MODULE = { exports: {} };

// Stand-in for the logging object inside the engine: every method is a no-op, so
// the engine cannot write to the page's developer tools under any code path.
var CD_SILENT_CONSOLE = (function () {
  var noop = function () {};
  var silent = {};
  var names = [
    'assert', 'clear', 'count', 'countReset', 'debug', 'dir', 'dirxml', 'error', 'group',
    'groupCollapsed', 'groupEnd', 'info', 'log', 'table', 'time', 'timeEnd', 'timeLog',
    'timeStamp', 'trace', 'warn',
  ];
  for (var i = 0; i < names.length; i++) silent[names[i]] = noop;
  return Object.freeze(silent);
})();

// Namespace for our own content scripts (10-heuristic.js, 20-supervisor.js).
var CD = {};
