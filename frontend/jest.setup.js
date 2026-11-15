import { localeLoaders } from './lib/generated/i18nBundles';
import { loadLocale } from './lib/i18n';

// Tests render screens in any language synchronously, as the app does once a language has loaded.
beforeAll(() => Promise.all(Object.keys(localeLoaders).map(loadLocale)));

// jsdom has no modal dialogs yet: open and close them as plain dialogs so components using showModal can mount.
if (typeof HTMLDialogElement !== 'undefined' && !HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal() { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function close() { this.removeAttribute('open'); };
}
