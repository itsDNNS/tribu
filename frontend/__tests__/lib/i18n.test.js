import { buildMessages, t } from '../../lib/i18n';

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
    for (const [key, value] of Object.entries(locale)) {
      expect(value.trim()).not.toBe('');
    }
  });
});

describe('buildMessages()', () => {
  it('EN and DE produce the same set of keys', () => {
    const enKeys = Object.keys(buildMessages('en')).sort();
    const deKeys = Object.keys(buildMessages('de')).sort();
    expect(enKeys).toEqual(deKeys);
  });

  it('merges core and module translations', () => {
    const en = buildMessages('en');
    expect(en.app_name).toBe('Tribu');
    expect(en['module.tasks.name']).toBe('Tasks');
    expect(en['module.calendar.name']).toBe('Calendar');
    expect(en['module.dashboard.name']).toBe('Dashboard');
    expect(en['module.contacts.name']).toBe('Contacts');
  });

  it('falls back to DE for unknown language', () => {
    const fr = buildMessages('fr');
    const de = buildMessages('de');
    expect(fr).toEqual(de);
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
