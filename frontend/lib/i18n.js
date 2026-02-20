import coreDe from '../i18n/core/de.json';
import coreEn from '../i18n/core/en.json';

import calendarDe from '../i18n/modules/calendar/de.json';
import calendarEn from '../i18n/modules/calendar/en.json';
import dashboardDe from '../i18n/modules/dashboard/de.json';
import dashboardEn from '../i18n/modules/dashboard/en.json';
import contactsDe from '../i18n/modules/contacts/de.json';
import contactsEn from '../i18n/modules/contacts/en.json';

const moduleLocales = {
  de: [calendarDe, dashboardDe, contactsDe],
  en: [calendarEn, dashboardEn, contactsEn],
};

const coreLocales = { de: coreDe, en: coreEn };

export function buildMessages(lang) {
  const safeLang = coreLocales[lang] ? lang : 'de';
  const merged = { ...coreLocales[safeLang] };
  for (const mod of moduleLocales[safeLang] || []) {
    Object.assign(merged, mod);
  }
  return merged;
}

export function t(messages, key, fallback) {
  return messages[key] || fallback || key;
}
