// Debug builds only (CD_DEBUG=1): remembers errors thrown in the background.
export const errors = [];
try {
  self.addEventListener('error', (e) => errors.push(String(e.message || e)));
  self.addEventListener('unhandledrejection', (e) => errors.push('rejection: ' + String(e.reason && (e.reason.stack || e.reason))));
} catch (e) {
  errors.push('capture: ' + e);
}
