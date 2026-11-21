// Runs before the first paint, so neither the layout nor the colors jump once
// React starts: marks installed apps (data-display-mode) and applies the
// stored appearance (data-theme, data-scheme, color-scheme, and theme-color
// for the installed app's status and navigation bars). next.config.js
// allows exactly this text by its hash in the Content-Security-Policy, so it
// has to be the same on every request: the theme list is written in when the
// app is built, from design/tokens.json, and nothing per request.
const tokens = require('../design/tokens.json');

// key: [colour scheme, page colour]
const THEMES = JSON.stringify(
  Object.fromEntries(Object.entries(tokens.themes).map(([key, entry]) => [key, [entry.colorScheme, entry.color.bg]])),
);

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
    const themes = ${THEMES};
    const stored = window.localStorage.getItem('tribu_theme');
    const fixed = Object.prototype.hasOwnProperty.call(themes, stored);
    const theme = fixed ? stored : window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    root.dataset.theme = theme;
    root.dataset.scheme = themes[theme][0];
    document.querySelector('meta[name="color-scheme"]').content = fixed ? themes[theme][0] : 'light dark';
    document.querySelector('meta[name="theme-color"]').content = themes[theme][1];
  } catch {}
})();
`;

module.exports = { PRE_PAINT_BOOTSTRAP };
