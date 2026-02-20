import lightTheme from '../themes/light.json';
import darkTheme from '../themes/dark.json';
import midnightGlassTheme from '../themes/midnight-glass.json';

const themes = {
  light: lightTheme,
  dark: darkTheme,
  'midnight-glass': midnightGlassTheme,
};

export function getTheme(themeKey) {
  return themes[themeKey] || themes.light;
}

export function listThemes() {
  return Object.entries(themes).map(([key, t]) => ({ key, id: t.id, name: t.name }));
}
