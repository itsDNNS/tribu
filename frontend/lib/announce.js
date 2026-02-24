/**
 * Announce a message to screen readers via the live region.
 */
export function announce(message) {
  const el = document.getElementById('a11y-announcer');
  if (!el) return;
  el.textContent = '';
  requestAnimationFrame(() => {
    el.textContent = message;
  });
}
