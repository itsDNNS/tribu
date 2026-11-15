import { useEffect, useMemo, useState } from 'react';
import { buildMessages, isLocaleLoaded, loadLocale } from '../lib/i18n';

// Messages for lang, loaded on demand. While it downloads, the texts stay in the
// language shown before (English at first); ready turns true once the download settled.
export function useLocaleMessages(lang) {
  const [loadedLang, setLoadedLang] = useState(null);

  useEffect(() => {
    let current = true;
    loadLocale(lang).then(() => { if (current) setLoadedLang(lang); });
    return () => { current = false; };
  }, [lang]);

  const shownLang = isLocaleLoaded(lang) ? lang : loadedLang || 'en';
  const messages = useMemo(() => buildMessages(shownLang), [shownLang]);
  return { messages, ready: isLocaleLoaded(lang) || loadedLang === lang };
}
