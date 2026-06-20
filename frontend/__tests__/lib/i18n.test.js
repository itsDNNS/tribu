import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';

import {
  languageMeta,
  localeBundles as generatedLocaleBundles,
  supportedLanguageKeys,
} from '../../lib/generated/i18nBundles';
import { buildMessages, listLanguages, mergeMessages, t } from '../../lib/i18n';

const expectedLanguages = [
  'bg',
  'cs',
  'da',
  'de',
  'el',
  'en',
  'es',
  'et',
  'fi',
  'fr',
  'ga',
  'hr',
  'hu',
  'it',
  'lt',
  'lv',
  'nb',
  'nl',
  'pl',
  'pt',
  'ro',
  'sk',
  'sl',
  'sv',
];

const projectRoot = path.join(process.cwd(), '..');
const i18nRoot = path.join(process.cwd(), 'i18n');

function gitIgnoreRule(relativePath) {
  try {
    return execFileSync('git', ['check-ignore', '-v', relativePath], {
      cwd: projectRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch (error) {
    if (error.status === 1) {
      return '';
    }
    throw error;
  }
}

function readLocale(lang) {
  return JSON.parse(fs.readFileSync(path.join(i18nRoot, `${lang}.json`), 'utf8'));
}

const localeFiles = fs
  .readdirSync(i18nRoot)
  .filter((file) => file.endsWith('.json'))
  .sort();

const fileLocaleBundles = Object.fromEntries(
  localeFiles.map((file) => [path.basename(file, '.json'), readLocale(path.basename(file, '.json'))])
);

function placeholderSet(value) {
  return Array.from(String(value).matchAll(/\{\{[^{}]+\}\}|\{[^{}]+\}|%[sd]/g), (match) => match[0]).sort();
}

function protectedLiteralSet(value) {
  const text = String(value);
  const patterns = [
    /\b[a-z_]+:(?:read|write)\b/g,
    /\bopenid\b/g,
    /\b(?:BEGIN|END):VCALENDAR\b/g,
    /\b(?:full_name|birthday_month|birthday_day)\b/g,
    /\bfull_name,email,phone,birthday_month,birthday_day\b/g,
    /\bDELETE\b/g,
  ];
  return patterns.flatMap((pattern) => Array.from(text.matchAll(pattern), (match) => match[0])).sort();
}

describe('i18n bundled locale files', () => {
  it('keeps locale bundle files trackable by git while ignoring unrelated tasks state', () => {
    expect(gitIgnoreRule('frontend/i18n/sv.json')).toBe('');
    expect(gitIgnoreRule('tasks/session.json')).toContain('/tasks/');
  });

  it('ships one bundle for every supported language', () => {
    expect(Object.keys(fileLocaleBundles).sort()).toEqual(expectedLanguages);
  });

  it('keeps the generated bundle index in sync with locale files and language metadata', () => {
    expect(() => {
      execFileSync('npm', ['run', 'i18n:check', '--silent'], {
        cwd: process.cwd(),
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    }).not.toThrow();

    expect(supportedLanguageKeys).toEqual(listLanguages().map((lang) => lang.key));
    expect(Object.keys(generatedLocaleBundles).sort()).toEqual(expectedLanguages);
    expect(Object.keys(languageMeta).sort()).toEqual(expectedLanguages);
    for (const lang of expectedLanguages) {
      expect(generatedLocaleBundles[lang]).toEqual(fileLocaleBundles[lang]);
    }
  });

  it('reduces the hand-maintained catalog to per-language bundles', () => {
    expect(localeFiles).toHaveLength(expectedLanguages.length);
    expect(fs.existsSync(path.join(i18nRoot, 'core'))).toBe(false);
    expect(fs.existsSync(path.join(i18nRoot, 'modules'))).toBe(false);
  });

  it('keeps keys and placeholders aligned with English', () => {
    const english = fileLocaleBundles.en;
    const englishKeys = Object.keys(english).sort();
    for (const lang of expectedLanguages) {
      const locale = fileLocaleBundles[lang];
      expect(Object.keys(locale).sort()).toEqual(englishKeys);
      for (const key of englishKeys) {
        expect(String(locale[key]).trim()).not.toBe('');
        expect(placeholderSet(locale[key])).toEqual(placeholderSet(english[key]));
        expect(protectedLiteralSet(locale[key])).toEqual(protectedLiteralSet(english[key]));
      }
    }
  });
});

describe('listLanguages()', () => {
  it('lists the expanded European language pack with native names', () => {
    const languages = listLanguages();
    expect(languages.map((lang) => lang.key).sort()).toEqual(expectedLanguages);
    expect(languages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'es', nativeName: 'Español' }),
        expect.objectContaining({ key: 'fr', nativeName: 'Français' }),
        expect.objectContaining({ key: 'pt', nativeName: 'Português' }),
        expect.objectContaining({ key: 'it', nativeName: 'Italiano' }),
        expect.objectContaining({ key: 'nl', nativeName: 'Nederlands' }),
        expect.objectContaining({ key: 'pl', nativeName: 'Polski' }),
        expect.objectContaining({ key: 'sv', nativeName: 'Svenska' }),
        expect.objectContaining({ key: 'da', nativeName: 'Dansk' }),
        expect.objectContaining({ key: 'nb', nativeName: 'Norsk bokmål' }),
        expect.objectContaining({ key: 'fi', nativeName: 'Suomi' }),
        expect.objectContaining({ key: 'cs', nativeName: 'Čeština' }),
        expect.objectContaining({ key: 'sk', nativeName: 'Slovenčina' }),
        expect.objectContaining({ key: 'hu', nativeName: 'Magyar' }),
        expect.objectContaining({ key: 'ro', nativeName: 'Română' }),
        expect.objectContaining({ key: 'el', nativeName: 'Ελληνικά' }),
        expect.objectContaining({ key: 'bg', nativeName: 'Български' }),
        expect.objectContaining({ key: 'hr', nativeName: 'Hrvatski' }),
        expect.objectContaining({ key: 'sl', nativeName: 'Slovenščina' }),
        expect.objectContaining({ key: 'lt', nativeName: 'Lietuvių' }),
        expect.objectContaining({ key: 'lv', nativeName: 'Latviešu' }),
        expect.objectContaining({ key: 'et', nativeName: 'Eesti' }),
        expect.objectContaining({ key: 'ga', nativeName: 'Gaeilge' }),
      ])
    );
  });
});

describe('buildMessages()', () => {
  it('all supported languages produce the same set of keys as English', () => {
    const enKeys = Object.keys(buildMessages('en')).sort();
    for (const lang of expectedLanguages) {
      expect(Object.keys(buildMessages(lang)).sort()).toEqual(enKeys);
    }
  });

  it('loads core and feature translations from the language bundle', () => {
    const en = buildMessages('en');
    expect(en.app_name).toBe('Tribu');
    expect(en['module.tasks.name']).toBe('Tasks');
    expect(en['module.calendar.name']).toBe('Calendar');
    expect(en['module.dashboard.name']).toBe('Dashboard');
    expect(en['module.contacts.name']).toBe('Contacts');
  });

  it('falls missing bundle keys back to English', () => {
    expect(mergeMessages({ app_name: 'Localized Tribu' })).toEqual(
      expect.objectContaining({
        app_name: 'Localized Tribu',
        'module.dashboard.name': 'Dashboard',
      })
    );
  });

  it('returns translated messages for the expanded language pack', () => {
    expect(buildMessages('es')['module.dashboard.name']).toBe('Panel');
    expect(buildMessages('fr')['module.dashboard.name']).toBe('Tableau de bord');
    expect(buildMessages('pt')['module.dashboard.name']).toBe('Painel');
    expect(buildMessages('it')['module.dashboard.name']).toBe('Cruscotto');
    expect(buildMessages('nl')['module.dashboard.name']).toBe('Dashboard');
    expect(buildMessages('pl')['module.dashboard.name']).toBe('Pulpit');
    expect(buildMessages('sv')['module.dashboard.name']).toBe('Instrumentpanel');
    expect(buildMessages('da')['module.dashboard.name']).toBe('Dashboard');
    expect(buildMessages('nb')['module.dashboard.name']).toBe('Dashbord');
    expect(buildMessages('fi')['module.dashboard.name']).toBe('Kojelauta');
    expect(buildMessages('cs')['module.dashboard.name']).toBe('Dashboard');
    expect(buildMessages('sk')['module.dashboard.name']).toBe('Dashboard');
    expect(buildMessages('hu')['module.dashboard.name']).toBe('Irányítópult');
    expect(buildMessages('ro')['module.dashboard.name']).toBe('Tabloul de bord');
    expect(buildMessages('el')['module.dashboard.name']).toBe('Ταμπλό');
    expect(buildMessages('bg')['module.dashboard.name']).toBe('Табло за управление');
    expect(buildMessages('hr')['module.dashboard.name']).toBe('Nadzorna ploča');
    expect(buildMessages('sl')['module.dashboard.name']).toBe('Nadzorna plošča');
    expect(buildMessages('lt')['module.dashboard.name']).toBe('Prietaisų skydelis');
    expect(buildMessages('lv')['module.dashboard.name']).toBe('Informācijas panelis');
    expect(buildMessages('et')['module.dashboard.name']).toBe('Armatuurlaud');
    expect(buildMessages('ga')['module.dashboard.name']).toBe('Deais');
  });

  it('falls back to English for unknown language', () => {
    expect(buildMessages('xx')).toEqual(buildMessages('en'));
  });
});

describe('t()', () => {
  const messages = buildMessages('en');

  it('returns value for existing key', () => {
    expect(t(messages, 'app_name')).toBe('Tribu');
  });

  it('returns key name for missing key', () => {
    expect(t(messages, 'nonexistent.key')).toBe('nonexistent.key');
  });

  it('returns fallback when provided and key is missing', () => {
    expect(t(messages, 'nonexistent.key', 'Fallback')).toBe('Fallback');
  });
});
