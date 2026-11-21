// The themes come from design/tokens.json, the one theme list: a new theme
// is one more entry there (and `npm run tokens:generate`), nothing else.
import tokens from '../design/tokens.json';

const themes = Object.entries(tokens.themes).map(([key, entry]) => ({
  key,
  name: entry.name,
  description: entry.description || '',
  colorScheme: entry.colorScheme,
  background: entry.color.bg,
  // The swatch for theme pickers: the page colour with the theme's accent.
  preview: `linear-gradient(135deg, ${entry.color.bg} 0 58%, ${entry.color.accentFill} 58% 100%)`,
}));

const byKey = Object.fromEntries(themes.map((theme) => [theme.key, theme]));

export function getTheme(themeKey) {
  return byKey[themeKey] || byKey.light;
}

export function listThemes() {
  return themes;
}

export function isKnownTheme(themeKey) {
  return Object.prototype.hasOwnProperty.call(byKey, themeKey);
}

// 'light' or 'dark', for styles that only care which kind of theme is on.
export function themeScheme(themeKey) {
  return isKnownTheme(themeKey) ? byKey[themeKey].colorScheme : 'dark';
}

// The last light and the last dark theme picked on this device, so the
// dark-mode switch can go back to the theme someone had, not to Light.
export function rememberTheme(themeKey) {
  if (!isKnownTheme(themeKey)) return;
  try {
    window.localStorage.setItem(`tribu_theme_${byKey[themeKey].colorScheme}`, themeKey);
  } catch {}
}

export function lastThemeFor(scheme) {
  try {
    const stored = window.localStorage.getItem(`tribu_theme_${scheme}`);
    if (isKnownTheme(stored) && byKey[stored].colorScheme === scheme) return stored;
  } catch {}
  return scheme === 'dark' ? 'dark' : 'light';
}
