import { createContext, useContext, useMemo, useState } from 'react';
import { buildMessages, listLanguages } from '../lib/i18n';
import { getTheme, listThemes } from '../lib/themes';
import { buildUi } from '../lib/styles';

export const DEFAULT_NAV_ORDER = ['dashboard', 'calendar', 'shopping', 'tasks', 'contacts', 'notifications', 'settings', 'admin'];

const UIContext = createContext(null);
export const useUI = () => useContext(UIContext);

export function UIProvider({ children }) {
  const [theme, setTheme] = useState('light');
  const [lang, setLang] = useState('en');
  const [activeView, setActiveViewRaw] = useState('dashboard');
  const [isMobile, setIsMobile] = useState(false);
  const [navOrder, setNavOrder] = useState(DEFAULT_NAV_ORDER);
  const [loading, setLoading] = useState(true);

  const setActiveView = (view) => {
    sessionStorage.setItem('tribu_view', view);
    setActiveViewRaw(view);
  };

  const messages = useMemo(() => buildMessages(lang), [lang]);
  const themeConfig = useMemo(() => getTheme(theme), [theme]);
  const tokens = themeConfig.tokens;
  const availableThemes = useMemo(() => listThemes(), []);
  const availableLanguages = useMemo(() => listLanguages(), []);
  const ui = useMemo(() => buildUi(tokens), [tokens]);

  const value = {
    theme, setTheme,
    lang, setLang,
    messages,
    tokens,
    availableThemes,
    availableLanguages,
    ui,
    activeView, setActiveView,
    isMobile, setIsMobile,
    navOrder, setNavOrder,
    loading, setLoading,
  };

  return <UIContext.Provider value={value}>{children}</UIContext.Provider>;
}
