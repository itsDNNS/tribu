import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';

import { buildMessages, listLanguages, t } from '../../lib/i18n';

import coreEn from '../../i18n/core/en.json';
import coreDe from '../../i18n/core/de.json';
import calendarEn from '../../i18n/modules/calendar/en.json';
import calendarDe from '../../i18n/modules/calendar/de.json';
import dashboardEn from '../../i18n/modules/dashboard/en.json';
import dashboardDe from '../../i18n/modules/dashboard/de.json';
import contactsEn from '../../i18n/modules/contacts/en.json';
import contactsDe from '../../i18n/modules/contacts/de.json';
import tasksEn from '../../i18n/modules/tasks/en.json';
import tasksDe from '../../i18n/modules/tasks/de.json';

const localePairs = [
  ['core', coreEn, coreDe],
  ['calendar', calendarEn, calendarDe],
  ['dashboard', dashboardEn, dashboardDe],
  ['contacts', contactsEn, contactsDe],
  ['tasks', tasksEn, tasksDe],
];

describe('i18n key symmetry', () => {
  it.each(localePairs)('%s: EN and DE have identical keys', (_name, en, de) => {
    const enKeys = Object.keys(en).sort();
    const deKeys = Object.keys(de).sort();
    expect(enKeys).toEqual(deKeys);
  });
});

describe('i18n no empty strings', () => {
  const allFiles = [
    ['core/en', coreEn], ['core/de', coreDe],
    ['calendar/en', calendarEn], ['calendar/de', calendarDe],
    ['dashboard/en', dashboardEn], ['dashboard/de', dashboardDe],
    ['contacts/en', contactsEn], ['contacts/de', contactsDe],
    ['tasks/en', tasksEn], ['tasks/de', tasksDe],
  ];

  it.each(allFiles)('%s has no empty string values', (_name, locale) => {
    for (const [, value] of Object.entries(locale)) {
      expect(value.trim()).not.toBe('');
    }
  });
});

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
const englishLocaleFiles = fs
  .readdirSync(i18nRoot, { recursive: true })
  .filter((file) => file.endsWith('/en.json'))
  .sort();

function readLocale(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(i18nRoot, relativePath), 'utf8'));
}

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

describe('i18n language pack completeness', () => {
  it('keeps the task module locale directory trackable by git', () => {
    expect(gitIgnoreRule('frontend/i18n/modules/tasks/sv.json')).toBe('');
    expect(gitIgnoreRule('tasks/session.json')).toContain('/tasks/');
  });

  it('ships every English locale file for every supported language', () => {
    for (const enFile of englishLocaleFiles) {
      for (const lang of expectedLanguages) {
        expect(fs.existsSync(path.join(i18nRoot, enFile.replace('/en.json', `/${lang}.json`)))).toBe(true);
      }
    }
  });

  it('keeps keys and placeholders aligned with English', () => {
    for (const enFile of englishLocaleFiles) {
      const en = readLocale(enFile);
      const enKeys = Object.keys(en).sort();
      for (const lang of expectedLanguages) {
        const locale = readLocale(enFile.replace('/en.json', `/${lang}.json`));
        expect(Object.keys(locale).sort()).toEqual(enKeys);
        for (const key of enKeys) {
          expect(String(locale[key]).trim()).not.toBe('');
          expect(placeholderSet(locale[key])).toEqual(placeholderSet(en[key]));
          expect(protectedLiteralSet(locale[key])).toEqual(protectedLiteralSet(en[key]));
        }
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

  it('merges core and module translations', () => {
    const en = buildMessages('en');
    expect(en.app_name).toBe('Tribu');
    expect(en['module.tasks.name']).toBe('Tasks');
    expect(en['module.calendar.name']).toBe('Calendar');
    expect(en['module.dashboard.name']).toBe('Dashboard');
    expect(en['module.contacts.name']).toBe('Contacts');
  });

  it('returns translated messages for the new languages', () => {
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

  it('falls back to DE for unknown language', () => {
    const unknown = buildMessages('xx');
    const de = buildMessages('de');
    expect(unknown).toEqual(de);
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
