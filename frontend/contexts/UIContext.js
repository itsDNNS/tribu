import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { buildMessages, listLanguages } from '../lib/i18n';
import { getTheme, listThemes } from '../lib/themes';
import { buildUi } from '../lib/styles';

export const DEFAULT_NAV_ORDER = ['dashboard', 'calendar', 'shopping', 'tasks', 'templates', 'meal_plans', 'recipes', 'rewards', 'gifts', 'contacts', 'notifications', 'settings', 'admin'];

const UIContext = createContext(null);
export const useUI = () => useContext(UIContext);

export function UIProvider({ children }) {
  const [theme, setTheme] = useState('light');
  const [lang, setLang] = useState('en');
  const [activeView, setActiveViewRaw] = useState('dashboard');
  const [isMobile, setIsMobile] = useState(false);
  const [navOrder, setNavOrder] = useState(DEFAULT_NAV_ORDER);
  const [loading, setLoading] = useState(true);
  const [timeFormat, setTimeFormat] = useState('24h');

  const setActiveView = useCallback((view) => {
    sessionStorage.setItem('tribu_view', view);
    setActiveViewRaw(view);
    if (typeof window !== 'undefined') {
      history.pushState(null, '', `#${view}`);
    }
  }, []);

  // Restore view without creating a history entry (for init/popstate)
  const restoreView = useCallback((view) => {
    sessionStorage.setItem('tribu_view', view);
    setActiveViewRaw(view);
    if (typeof window !== 'undefined') {
      history.replaceState(null, '', `#${view}`);
    }
  }, []);

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
    activeView, setActiveView, restoreView,
    isMobile, setIsMobile,
    navOrder, setNavOrder,
    loading, setLoading,
    timeFormat, setTimeFormat,
  };

  return <UIContext.Provider value={value}>{children}</UIContext.Provider>;
}
