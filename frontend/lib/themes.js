// The themes come from design/tokens.json, the one theme list: a new theme
// is one more entry there (and `npm run tokens:generate`), nothing else.
import tokens from '../design/tokens.json';

const themes = Object.entries(tokens.themes).map(([key, entry]) => ({
  key,
  name: entry.name,
  description: entry.description || '',
  colorScheme: entry.colorScheme,
  partner: entry.partner || null,
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

// The light and the dark theme this device uses: the dark-mode switch moves
// between them, and "Match device" picks one by the device's mode. Picking a
// theme sets its side and, with { family: true }, its partner on the other
// side, so Garden by day becomes Garden Night after dark. The switch itself
// only sets its own side, so High Contrast -> dark -> back is High Contrast.
export function rememberTheme(themeKey, { family = false } = {}) {
  if (!isKnownTheme(themeKey)) return;
  const { colorScheme, partner } = byKey[themeKey];
  try {
    window.localStorage.setItem(`tribu_theme_${colorScheme}`, themeKey);
    if (family && isKnownTheme(partner)) window.localStorage.setItem(`tribu_theme_${byKey[partner].colorScheme}`, partner);
  } catch {}
}

export function lastThemeFor(scheme) {
  try {
    const stored = window.localStorage.getItem(`tribu_theme_${scheme}`);
    if (isKnownTheme(stored) && byKey[stored].colorScheme === scheme) return stored;
  } catch {}
  return scheme === 'dark' ? 'dark' : 'light';
}
