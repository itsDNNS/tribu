const fs = require('fs');
const path = require('path');
const { getTheme, isKnownTheme, lastThemeFor, listThemes, rememberTheme, themeScheme } = require('../../lib/themes');
const { PRE_PAINT_BOOTSTRAP } = require('../../lib/prePaintBootstrap');

const tokens = JSON.parse(fs.readFileSync(path.join(__dirname, '../../design/tokens.json'), 'utf8'));

describe('themes', () => {
  it('lists every theme in design/tokens.json, in order, with its name and scheme', () => {
    expect(listThemes().map((theme) => theme.key)).toEqual(Object.keys(tokens.themes));
    for (const theme of listThemes()) {
      expect(theme.name).toBe(tokens.themes[theme.key].name);
      expect(theme.colorScheme).toBe(tokens.themes[theme.key].colorScheme);
      expect(theme.preview).toContain(tokens.themes[theme.key].color.bg);
    }
  });

  it('knows each theme scheme and falls back for unknown ones', () => {
    expect(themeScheme('light')).toBe('light');
    expect(themeScheme('midnight-glass')).toBe('dark');
    expect(isKnownTheme('system')).toBe(false);
    expect(isKnownTheme('nope')).toBe(false);
    expect(getTheme('nope').key).toBe('light');
  });

  it('remembers the last light and dark theme for the dark-mode switch', () => {
    window.localStorage.clear();
    expect(lastThemeFor('light')).toBe('light');
    expect(lastThemeFor('dark')).toBe('dark');
    rememberTheme('midnight-glass');
    rememberTheme('system');
    expect(lastThemeFor('dark')).toBe('midnight-glass');
    expect(lastThemeFor('light')).toBe('light');
    window.localStorage.setItem('tribu_theme_light', 'midnight-glass');
    expect(lastThemeFor('light')).toBe('light');
  });
});

describe('pre-paint script', () => {
  function run({ stored, prefersDark = false }) {
    const meta = document.createElement('meta');
    meta.setAttribute('name', 'color-scheme');
    const themeColor = document.createElement('meta');
    themeColor.setAttribute('name', 'theme-color');
    document.head.append(meta, themeColor);
    window.localStorage.clear();
    if (stored) window.localStorage.setItem('tribu_theme', stored);
    const original = window.matchMedia;
    window.matchMedia = (query) => ({ matches: query.includes('dark') ? prefersDark : false });
    try {
      // eslint-disable-next-line no-new-func
      new Function(PRE_PAINT_BOOTSTRAP)();
    } finally {
      window.matchMedia = original;
    }
    const result = { ...document.documentElement.dataset, colorScheme: meta.content, themeColor: themeColor.content };
    meta.remove();
    themeColor.remove();
    return result;
  }

  it.each(Object.entries(tokens.themes))('applies %s with its scheme before the first paint', (key, entry) => {
    const result = run({ stored: key });
    expect(result.theme).toBe(key);
    expect(result.scheme).toBe(entry.colorScheme);
    expect(result.colorScheme).toBe(entry.colorScheme);
    expect(result.themeColor).toBe(entry.color.bg);
  });

  it('follows the device for system and for themes it does not know', () => {
    expect(run({ stored: 'system', prefersDark: true })).toMatchObject({ theme: 'dark', scheme: 'dark', colorScheme: 'light dark' });
    expect(run({ stored: 'retired-theme' })).toMatchObject({ theme: 'light', scheme: 'light', colorScheme: 'light dark' });
  });
});
