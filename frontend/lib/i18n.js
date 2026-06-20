import bg from '../i18n/bg.json';
import cs from '../i18n/cs.json';
import da from '../i18n/da.json';
import de from '../i18n/de.json';
import el from '../i18n/el.json';
import en from '../i18n/en.json';
import es from '../i18n/es.json';
import et from '../i18n/et.json';
import fi from '../i18n/fi.json';
import fr from '../i18n/fr.json';
import ga from '../i18n/ga.json';
import hr from '../i18n/hr.json';
import hu from '../i18n/hu.json';
import it from '../i18n/it.json';
import lt from '../i18n/lt.json';
import lv from '../i18n/lv.json';
import nb from '../i18n/nb.json';
import nl from '../i18n/nl.json';
import pl from '../i18n/pl.json';
import pt from '../i18n/pt.json';
import ro from '../i18n/ro.json';
import sk from '../i18n/sk.json';
import sl from '../i18n/sl.json';
import sv from '../i18n/sv.json';

const localeBundles = {
  bg,
  cs,
  da,
  de,
  el,
  en,
  es,
  et,
  fi,
  fr,
  ga,
  hr,
  hu,
  it,
  lt,
  lv,
  nb,
  nl,
  pl,
  pt,
  ro,
  sk,
  sl,
  sv,
};

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

const languageMeta = {
  de: { name: 'German', nativeName: 'Deutsch', version: '1.0.0', author: 'Tribu' },
  en: { name: 'English', nativeName: 'English', version: '1.0.0', author: 'Tribu' },
  es: { name: 'Spanish', nativeName: 'Español', version: '1.0.0', author: 'Tribu' },
  fr: { name: 'French', nativeName: 'Français', version: '1.0.0', author: 'Tribu' },
  it: { name: 'Italian', nativeName: 'Italiano', version: '1.0.0', author: 'Tribu' },
  nl: { name: 'Dutch', nativeName: 'Nederlands', version: '1.0.0', author: 'Tribu' },
  pl: { name: 'Polish', nativeName: 'Polski', version: '1.0.0', author: 'Tribu' },
  pt: { name: 'Portuguese', nativeName: 'Português', version: '1.0.0', author: 'Tribu' },
  sv: { name: 'Swedish', nativeName: 'Svenska', version: '1.0.0', author: 'Tribu' },
  da: { name: 'Danish', nativeName: 'Dansk', version: '1.0.0', author: 'Tribu' },
  nb: { name: 'Norwegian Bokmål', nativeName: 'Norsk bokmål', version: '1.0.0', author: 'Tribu' },
  fi: { name: 'Finnish', nativeName: 'Suomi', version: '1.0.0', author: 'Tribu' },
  cs: { name: 'Czech', nativeName: 'Čeština', version: '1.0.0', author: 'Tribu' },
  sk: { name: 'Slovak', nativeName: 'Slovenčina', version: '1.0.0', author: 'Tribu' },
  hu: { name: 'Hungarian', nativeName: 'Magyar', version: '1.0.0', author: 'Tribu' },
  ro: { name: 'Romanian', nativeName: 'Română', version: '1.0.0', author: 'Tribu' },
  el: { name: 'Greek', nativeName: 'Ελληνικά', version: '1.0.0', author: 'Tribu' },
  bg: { name: 'Bulgarian', nativeName: 'Български', version: '1.0.0', author: 'Tribu' },
  hr: { name: 'Croatian', nativeName: 'Hrvatski', version: '1.0.0', author: 'Tribu' },
  sl: { name: 'Slovenian', nativeName: 'Slovenščina', version: '1.0.0', author: 'Tribu' },
  lt: { name: 'Lithuanian', nativeName: 'Lietuvių', version: '1.0.0', author: 'Tribu' },
  lv: { name: 'Latvian', nativeName: 'Latviešu', version: '1.0.0', author: 'Tribu' },
  et: { name: 'Estonian', nativeName: 'Eesti', version: '1.0.0', author: 'Tribu' },
  ga: { name: 'Irish', nativeName: 'Gaeilge', version: '1.0.0', author: 'Tribu' },
};

export function listLanguages() {
  return Object.entries(languageMeta).map(([key, meta]) => ({ key, ...meta }));
}
