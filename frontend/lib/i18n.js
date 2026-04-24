import coreDe from '../i18n/core/de.json';
import coreEn from '../i18n/core/en.json';

import calendarDe from '../i18n/modules/calendar/de.json';
import calendarEn from '../i18n/modules/calendar/en.json';
import dashboardDe from '../i18n/modules/dashboard/de.json';
import dashboardEn from '../i18n/modules/dashboard/en.json';
import contactsDe from '../i18n/modules/contacts/de.json';
import contactsEn from '../i18n/modules/contacts/en.json';
import tasksDe from '../i18n/modules/tasks/de.json';
import tasksEn from '../i18n/modules/tasks/en.json';
import shoppingDe from '../i18n/modules/shopping/de.json';
import shoppingEn from '../i18n/modules/shopping/en.json';
import birthdaysDe from '../i18n/modules/birthdays/de.json';
import birthdaysEn from '../i18n/modules/birthdays/en.json';
import rewardsDe from '../i18n/modules/rewards/de.json';
import rewardsEn from '../i18n/modules/rewards/en.json';
import giftsDe from '../i18n/modules/gifts/de.json';
import giftsEn from '../i18n/modules/gifts/en.json';
import mealPlansDe from '../i18n/modules/meal_plans/de.json';
import mealPlansEn from '../i18n/modules/meal_plans/en.json';
import recipesDe from '../i18n/modules/recipes/de.json';
import recipesEn from '../i18n/modules/recipes/en.json';

const moduleLocales = {
  de: [calendarDe, dashboardDe, contactsDe, tasksDe, shoppingDe, birthdaysDe, rewardsDe, giftsDe, mealPlansDe, recipesDe],
  en: [calendarEn, dashboardEn, contactsEn, tasksEn, shoppingEn, birthdaysEn, rewardsEn, giftsEn, mealPlansEn, recipesEn],
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

const languageMeta = {
  en: { name: 'English', nativeName: 'English', version: '1.0.0', author: 'Tribu' },
  de: { name: 'German', nativeName: 'Deutsch', version: '1.0.0', author: 'Tribu' },
};

export function listLanguages() {
  return Object.entries(languageMeta).map(([key, meta]) => ({ key, ...meta }));
}

export function languageCompleteness(lang) {
  const ref = buildMessages('en');
  const target = buildMessages(lang);
  const total = Object.keys(ref).length;
  const translated = Object.keys(ref).filter((k) => target[k]).length;
  return { total, translated, percent: total > 0 ? Math.round((translated / total) * 100) : 0 };
}
