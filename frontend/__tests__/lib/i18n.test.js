import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';

import {
  languageMeta,
  localeBundles as generatedLocaleBundles,
  supportedLanguageKeys,
} from '../../lib/generated/i18nBundles';
import { buildMessages, listLanguages, mergeMessages, t, tc } from '../../lib/i18n';

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

// Counted texts keep their language's forms as key_one, key_few, … (#539).
const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;
function isPluralForm(bundle, key) {
  return PLURAL_SUFFIX.test(key) && Object.prototype.hasOwnProperty.call(bundle, key.replace(PLURAL_SUFFIX, ''));
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
    const englishKeys = Object.keys(english).filter((key) => !isPluralForm(english, key)).sort();
    for (const lang of expectedLanguages) {
      const locale = fileLocaleBundles[lang];
      expect(Object.keys(locale).filter((key) => !isPluralForm(locale, key)).sort()).toEqual(englishKeys);
      for (const key of englishKeys) {
        expect(String(locale[key]).trim()).not.toBe('');
        expect(placeholderSet(locale[key])).toEqual(placeholderSet(english[key]));
        expect(protectedLiteralSet(locale[key])).toEqual(protectedLiteralSet(english[key]));
      }
    }
  });

  // Texts of several words that stay English in another language were left
  // untranslated (#550). These read the same on purpose: formats, product
  // names and terms the language borrows.
  const SAME_AS_ENGLISH = {
    display_eink_format_large: 'all',
    'module.calendar.import_placeholder': 'all',
    'module.kids.earned': 'all',
    api_tokens: ['de'],
    audit_log_title: ['de'],
    auth_selfhosted: ['de'],
    automation_webhooks: ['de'],
    'display.stage.participants': ['fr'],
    'display.stage.participants_one': ['fr'],
    'display.stage.routines_open': ['nl'],
    'module.school_timetables.day_plan_aria': ['da', 'nb'],
    'module.weekly_plan.shopping_open': ['nl'],
    notification_destinations_send_test: ['da', 'nb'],
    notification_destinations_url: ['hr', 'hu', 'lt', 'lv'],
    notification_minutes_15: ['fr'],
    notification_minutes_30: ['fr'],
    notification_minutes_60: ['fr'],
    'sso.client_id': ['pl'],
    'sso.client_secret': ['pl'],
    'sso.title': ['da', 'de', 'pl'],
    sub_setup_android_title: ['pl', 'ro'],
    sub_setup_ios_title: ['pl'],
    webhooks_send_test: ['da', 'nb'],
    webhooks_url_label: ['de', 'hu', 'lt'],
  };

  it('translates every text of several words', () => {
    const english = fileLocaleBundles.en;
    const untranslated = [];
    for (const lang of expectedLanguages.filter((name) => name !== 'en')) {
      for (const [key, value] of Object.entries(fileLocaleBundles[lang])) {
        const allowed = SAME_AS_ENGLISH[key];
        if (allowed === 'all' || allowed?.includes(lang)) continue;
        if (value === english[key] && String(value).trim().split(/\s+/).length > 1) {
          untranslated.push(`${lang}: ${key}`);
        }
      }
    }
    expect(untranslated).toEqual([]);
  });

  it('keeps plural forms next to their text and within its placeholders', () => {
    for (const lang of expectedLanguages) {
      const locale = fileLocaleBundles[lang];
      for (const key of Object.keys(locale).filter((name) => isPluralForm(locale, name))) {
        const base = key.replace(PLURAL_SUFFIX, '');
        const allowed = placeholderSet(locale[base]);
        // "once" may drop the count; nothing else may appear.
        expect(placeholderSet(locale[key]).filter((name) => !allowed.includes(name))).toEqual([]);
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
    const keys = (messages) => Object.keys(messages).filter((key) => !isPluralForm(messages, key)).sort();
    const enKeys = keys(buildMessages('en'));
    for (const lang of expectedLanguages) {
      expect(keys(buildMessages(lang))).toEqual(enKeys);
    }
  });

  it('loads core and feature translations from the language bundle', () => {
    const en = buildMessages('en');
    expect(en.app_name).toBe('Tribu');
    expect(en['module.tasks.name']).toBe('Tasks');
    expect(en['module.calendar.name']).toBe('Calendar');
    expect(en['module.today.title']).toBe('Today');
    expect(en['module.contacts.name']).toBe('Contacts');
  });

  it('falls missing bundle keys back to English', () => {
    expect(mergeMessages({ app_name: 'Localized Tribu' })).toEqual(
      expect.objectContaining({
        app_name: 'Localized Tribu',
        'module.today.title': 'Today',
      })
    );
  });

  it('returns translated messages for the expanded language pack', () => {
    expect(buildMessages('es')['module.today.title']).toBe('Hoy');
    expect(buildMessages('fr')['module.today.title']).toBe("Aujourd'hui");
    expect(buildMessages('pt')['module.today.title']).toBe('Hoje');
    expect(buildMessages('it')['module.today.title']).toBe('Oggi');
    expect(buildMessages('nl')['module.today.title']).toBe('Vandaag');
    expect(buildMessages('pl')['module.today.title']).toBe('Dziś');
    expect(buildMessages('sv')['module.today.title']).toBe('Idag');
    expect(buildMessages('da')['module.today.title']).toBe('I dag');
    expect(buildMessages('nb')['module.today.title']).toBe('I dag');
    expect(buildMessages('fi')['module.today.title']).toBe('Tänään');
    expect(buildMessages('cs')['module.today.title']).toBe('Dnes');
    expect(buildMessages('sk')['module.today.title']).toBe('Dnes');
    expect(buildMessages('hu')['module.today.title']).toBe('Ma');
    expect(buildMessages('ro')['module.today.title']).toBe('Azi');
    expect(buildMessages('el')['module.today.title']).toBe('Σήμερα');
    expect(buildMessages('bg')['module.today.title']).toBe('Днес');
    expect(buildMessages('hr')['module.today.title']).toBe('Danas');
    expect(buildMessages('sl')['module.today.title']).toBe('Danes');
    expect(buildMessages('lt')['module.today.title']).toBe('Šiandien');
    expect(buildMessages('lv')['module.today.title']).toBe('Šodien');
    expect(buildMessages('et')['module.today.title']).toBe('Täna');
    expect(buildMessages('ga')['module.today.title']).toBe('Inniu');
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

describe('tc() counted texts (#539)', () => {
  it('picks the singular for one and the plain text otherwise', () => {
    const en = buildMessages('en');
    expect(tc(en, 'module.dashboard.quick_capture_inbox_count', 1)).toBe('1 quick note open');
    expect(tc(en, 'module.dashboard.quick_capture_inbox_count', 3)).toBe('3 quick notes open');
    const de = buildMessages('de');
    expect(tc(de, 'module.today.shopping_hint', 1)).toBe('1 Ding auf der Einkaufsliste');
    expect(tc(de, 'module.today.shopping_hint', 12)).toBe('12 Dinge auf der Einkaufsliste');
  });

  it('uses the forms of the language, never English ones', () => {
    // Polish words this count neutrally and has no key_one: no "1 quick note".
    expect(tc(buildMessages('pl'), 'module.dashboard.quick_capture_inbox_count', 1)).toBe('Otwarte szybkie notatki: 1');
    // Czech: 1 den, 2–4 dny, 5+ dní.
    const cs = buildMessages('cs');
    expect(tc(cs, 'display.stage.in_days', 1)).toBe('za 1 den');
    expect(tc(cs, 'display.stage.in_days', 3)).toBe('za 3 dny');
    expect(tc(cs, 'display.stage.in_days', 7)).toBe('za 7 dní');
  });

  it('keeps the singular of counted texts in every language that needs one', () => {
    const counted = [
      'module.responsive.entries',
      'module.today.shopping_hint',
      'family.open_tasks',
      'family.gift_ideas',
      'module.calendar.import_success',
      'module.dashboard.quick_capture_inbox_count',
      'module.meal_plans.ingredients_summary',
      'module.recipes.ingredients_summary',
      'module.recipes.servings_count',
      'admin_layout_member_count',
      'display.stage.in_days',
    ];
    for (const lang of ['en', 'de', 'fr', 'es', 'it', 'nl', 'pt', 'sv', 'da', 'nb']) {
      const bundle = JSON.parse(fs.readFileSync(path.join(__dirname, '../../i18n', `${lang}.json`), 'utf8'));
      for (const key of counted) {
        // Either a singular form, or a text that does not depend on the count.
        const neutral = /:\s*\{count\}|\{count\}\s*[×x]|^\{count\} \/ /.test(bundle[key]) || bundle[key] === bundle[`${key}_one`];
        expect({ lang, key, ok: Boolean(bundle[`${key}_one`]) || neutral }).toEqual({ lang, key, ok: true });
      }
    }
  });
});
