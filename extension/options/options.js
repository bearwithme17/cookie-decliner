// The two switches. Stored as two booleans in the local storage area; nothing else is.
(function () {
  'use strict';
  var api = globalThis.browser || globalThis.chrome;
  var DEFAULTS = { wipeWalls: true, wipeAll: false };
  var boxes = {
    wipeWalls: document.getElementById('wipeWalls'),
    wipeAll: document.getElementById('wipeAll'),
  };

  function show(values) {
    boxes.wipeWalls.checked = values.wipeWalls !== false;
    boxes.wipeAll.checked = values.wipeAll === true;
  }

  show(DEFAULTS);
  try {
    Promise.resolve(api.storage.local.get(DEFAULTS)).then(show, function () {});
  } catch (e) {
    // keep the defaults on screen
  }

  Object.keys(boxes).forEach(function (key) {
    boxes[key].addEventListener('change', function () {
      var change = {};
      change[key] = boxes[key].checked === true;
      try {
        Promise.resolve(api.storage.local.set(change)).catch(function () {});
      } catch (e) {
        // ignore
      }
    });
  });
})();
