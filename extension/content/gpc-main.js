// Runs in the page's MAIN world at document_start, in every frame.
// Makes navigator.globalPrivacyControl report true, matching the Sec-GPC: 1
// request header set by rules/gpc.json. No extension APIs are available here.
(() => {
  try {
    const source = {
      get globalPrivacyControl() {
        return true;
      },
    };
    const descriptor = Object.getOwnPropertyDescriptor(source, 'globalPrivacyControl');
    Object.defineProperty(Navigator.prototype, 'globalPrivacyControl', {
      get: descriptor.get,
      set: undefined,
      enumerable: true,
      configurable: true,
    });
  } catch (e) {
    // Fail silently: the header still carries the signal.
  }
})();
