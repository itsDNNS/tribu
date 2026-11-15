// Runs before the first paint, so neither the layout nor the colors jump once
// React starts: marks installed apps (data-display-mode) and applies the
// stored appearance (data-theme, color-scheme). next.config.js allows exactly
// this text by its hash in the Content-Security-Policy, so keep it static.
const PRE_PAINT_BOOTSTRAP = `
(() => {
  const root = document.documentElement;
  try {
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true;
    root.dataset.displayMode = isStandalone ? 'standalone' : 'browser';
  } catch {}
  try {
    const stored = window.localStorage.getItem('tribu_theme');
    const fixed = stored === 'light' || stored === 'dark' || stored === 'midnight-glass';
    root.dataset.theme = fixed ? stored : window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    document.querySelector('meta[name="color-scheme"]').content = !fixed ? 'light dark' : stored === 'light' ? 'light' : 'dark';
  } catch {}
})();
`;

module.exports = { PRE_PAINT_BOOTSTRAP };
