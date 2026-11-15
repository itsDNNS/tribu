/**
 * Announce a message to screen readers. ariaNotify also reaches them while a
 * modal dialog makes the page (and its live region) inert.
 */
export function announce(message) {
  if (typeof document.ariaNotify === 'function') {
    document.ariaNotify(message);
    return;
  }
  const el = document.getElementById('a11y-announcer');
  if (!el) return;
  el.textContent = '';
  requestAnimationFrame(() => {
    el.textContent = message;
  });
}
