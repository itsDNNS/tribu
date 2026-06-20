import { languageMeta, localeBundles } from './generated/i18nBundles';

export function mergeMessages(localeMessages, fallbackMessages = localeBundles.en) {
  return { ...fallbackMessages, ...localeMessages };
}

export function buildMessages(lang) {
  const safeLang = localeBundles[lang] ? lang : 'en';
  return mergeMessages(localeBundles[safeLang]);
}

export function t(messages, key, fallback) {
  return messages[key] || fallback || key;
}

export function listLanguages() {
  return Object.entries(languageMeta).map(([key, meta]) => ({ key, ...meta }));
}
