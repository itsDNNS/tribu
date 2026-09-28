import { languageMeta, localeBundles } from './generated/i18nBundles';

export function mergeMessages(localeMessages, fallbackMessages = localeBundles.en) {
  return { ...fallbackMessages, ...localeMessages };
}

export function buildMessages(lang) {
  const safeLang = localeBundles[lang] ? lang : 'en';
  // The language travels along for counted texts (tc).
  return { ...mergeMessages(localeBundles[safeLang]), _lang: safeLang };
}

export function t(messages, key, fallback) {
  return messages[key] || fallback || key;
}

const pluralRules = {};

// A counted text in the right form: "1 event", "2 events". Languages keep
// their forms as key_one, key_few, … next to the key itself, which is the
// text for every other count. Forms come from the language itself only, so
// a language without them never falls back to English words.
export function tc(messages, key, count) {
  const lang = messages?._lang || 'en';
  pluralRules[lang] ||= new Intl.PluralRules(lang);
  const form = pluralRules[lang].select(Number(count));
  const own = localeBundles[lang] || localeBundles.en;
  return String(own[`${key}_${form}`] || t(messages, key)).replace('{count}', count);
}

export function listLanguages() {
  return Object.entries(languageMeta).map(([key, meta]) => ({ key, ...meta }));
}
