import { localeLoaders } from './lib/generated/i18nBundles';
import { loadLocale } from './lib/i18n';

// Tests render screens in any language synchronously, as the app does once a language has loaded.
beforeAll(() => Promise.all(Object.keys(localeLoaders).map(loadLocale)));
