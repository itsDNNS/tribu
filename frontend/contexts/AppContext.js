import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { buildMessages, listLanguages } from '../lib/i18n';
import { getTheme, listThemes } from '../lib/themes';
import { buildUi } from '../lib/styles';
import * as api from '../lib/api';
import { buildDemoData } from '../lib/demo-data';

export const DEFAULT_NAV_ORDER = ['dashboard', 'calendar', 'shopping', 'tasks', 'contacts', 'notifications', 'settings', 'admin'];

const AppContext = createContext(null);

export function useApp() {
  return useContext(AppContext);
}

export function AppProvider({ children }) {
  // Demo mode
  const [demoMode, setDemoMode] = useState(false);

  // Auth
  const [loggedIn, setLoggedIn] = useState(false);
  const [me, setMe] = useState(null);
  const [profileImage, setProfileImage] = useState('');

  // Family
  const [familyId, setFamilyId] = useState('1');
  const [families, setFamilies] = useState([]);
  const [myFamilyRole, setMyFamilyRole] = useState('member');
  const [myFamilyIsAdult, setMyFamilyIsAdult] = useState(true);
  const [members, setMembers] = useState([]);

  // Theme / i18n
  const [theme, setTheme] = useState('light');
  const [lang, setLang] = useState('en');

  // Layout
  const [activeView, setActiveViewRaw] = useState('dashboard');
  const setActiveView = (view) => {
    sessionStorage.setItem('tribu_view', view);
    setActiveViewRaw(view);
  };
  const [isMobile, setIsMobile] = useState(false);

  // Setup
  const [needsSetup, setNeedsSetup] = useState(false);

  // Loading
  const [loading, setLoading] = useState(true);

  // Data
  const [summary, setSummary] = useState({ next_events: [], upcoming_birthdays: [] });
  const [events, setEvents] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [birthdays, setBirthdays] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [shoppingLists, setShoppingLists] = useState([]);

  // Nav Order
  const [navOrder, setNavOrder] = useState(DEFAULT_NAV_ORDER);

  // Notifications
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  // Derived
  const messages = useMemo(() => buildMessages(lang), [lang]);
  const themeConfig = useMemo(() => getTheme(theme), [theme]);
  const tokens = themeConfig.tokens;
  const availableThemes = useMemo(() => listThemes(), []);
  const availableLanguages = useMemo(() => listLanguages(), []);
  const ui = useMemo(() => buildUi(tokens), [tokens]);
  const isAdmin = myFamilyRole === 'admin' || myFamilyRole === 'owner';
  const isChild = !isAdmin && !myFamilyIsAdult;

  // Loaders (no-op in demo mode)
  const loadDashboard = useCallback(async (fid = familyId) => {
    if (demoMode) return;
    const { ok, data } = await api.apiGetDashboard(fid);
    if (ok) setSummary(data);
  }, [familyId, demoMode]);

  const loadEvents = useCallback(async (fid = familyId) => {
    if (demoMode) return;
    const { ok, data } = await api.apiGetEvents(fid);
    if (ok) setEvents(data);
  }, [familyId, demoMode]);

  const loadMembers = useCallback(async (fid = familyId) => {
    if (demoMode) return;
    const { ok, data } = await api.apiGetMembers(fid);
    if (ok) setMembers(data);
  }, [familyId, demoMode]);

  const loadContacts = useCallback(async (fid = familyId) => {
    if (demoMode) return;
    const { ok, data } = await api.apiGetContacts(fid);
    if (ok) setContacts(data);
  }, [familyId, demoMode]);

  const loadBirthdays = useCallback(async (fid = familyId) => {
    if (demoMode) return;
    const { ok, data } = await api.apiGetBirthdays(fid);
    if (ok) setBirthdays(data);
  }, [familyId, demoMode]);

  const loadTasks = useCallback(async (fid = familyId) => {
    if (demoMode) return;
    const { ok, data } = await api.apiGetTasks(fid);
    if (ok) setTasks(data);
  }, [familyId, demoMode]);

  const loadShoppingLists = useCallback(async (fid = familyId) => {
    if (demoMode) return;
    const { ok, data } = await api.apiGetShoppingLists(fid);
    if (ok) setShoppingLists(data);
  }, [familyId, demoMode]);

  const loadNavOrder = useCallback(async () => {
    if (demoMode) return;
    const { ok, data } = await api.apiGetNavOrder();
    if (ok && data?.nav_order) {
      const order = data.nav_order;
      // Migrate: append any keys from DEFAULT_NAV_ORDER missing in persisted order
      const missing = DEFAULT_NAV_ORDER.filter((k) => !order.includes(k));
      setNavOrder(missing.length ? [...order, ...missing] : order);
    }
  }, [demoMode]);

  const loadNotifications = useCallback(async () => {
    if (demoMode) return;
    const { ok, data } = await api.apiGetNotifications(50, 0);
    if (ok) {
      setNotifications(data);
      setUnreadCount(data.filter((n) => !n.read).length);
    }
  }, [demoMode]);

  const switchFamily = useCallback(async (fid) => {
    setLoading(true);
    setFamilyId(fid);
    const selected = families.find((f) => String(f.family_id) === String(fid));
    if (selected) {
      setMyFamilyRole(selected.role);
      setMyFamilyIsAdult(selected.is_adult);
    }
    await Promise.all([loadDashboard(fid), loadEvents(fid), loadMembers(fid), loadContacts(fid), loadBirthdays(fid), loadTasks(fid), loadShoppingLists(fid)]);
    setLoading(false);
  }, [families, loadDashboard, loadEvents, loadMembers, loadContacts, loadBirthdays, loadTasks, loadShoppingLists]);

  const enterDemo = useCallback(() => {
    const demo = buildDemoData(lang);
    setDemoMode(true);
    setMe(demo.me);
    setFamilies(demo.families);
    setFamilyId(String(demo.families[0].family_id));
    setMyFamilyRole(demo.families[0].role);
    setMyFamilyIsAdult(true);
    setMembers(demo.members);
    setEvents(demo.events);
    setTasks(demo.tasks);
    setShoppingLists(demo.shoppingLists);
    setContacts(demo.contacts);
    setBirthdays(demo.birthdays);
    setSummary(demo.summary);
    setLoggedIn(true);
    setLoading(false);
  }, [lang]);

  const logout = useCallback(async () => {
    if (!demoMode) await api.apiLogout();
    setDemoMode(false);
    setLoggedIn(false);
    setMe(null);
    setMyFamilyIsAdult(true);
    setEvents([]);
    setSummary({ next_events: [], upcoming_birthdays: [] });
    setMembers([]);
    setContacts([]);
    setBirthdays([]);
    setTasks([]);
    setShoppingLists([]);
    setNavOrder(DEFAULT_NAV_ORDER);
    setNotifications([]);
    setUnreadCount(0);
  }, [demoMode]);

  // Init: localStorage, resize, auto-login
  useEffect(() => {
    setTheme(window.localStorage.getItem('tribu_theme') || 'light');
    const stored = window.localStorage.getItem('tribu_lang');
    if (stored) {
      setLang(stored);
    } else {
      const supported = ['en', 'de'];
      const browserLangs = (navigator.languages || [navigator.language || ''])
        .map(l => l.split('-')[0].toLowerCase());
      const match = browserLangs.find(l => supported.includes(l));
      setLang(match || 'en');
    }
    setProfileImage('');
    const savedView = sessionStorage.getItem('tribu_view');
    if (savedView) setActiveViewRaw(savedView);

    const onResize = () => setIsMobile(window.innerWidth < 768);
    onResize();
    window.addEventListener('resize', onResize);

    api.apiGetMe().then(async ({ ok, data }) => {
      if (ok && data) {
        setMe(data);
        if (data.profile_image) setProfileImage(data.profile_image);
        setLoggedIn(true);
      } else {
        const { ok: sOk, data: sData } = await api.apiGetSetupStatus();
        if (sOk && sData?.needs_setup) setNeedsSetup(true);
        setLoading(false);
      }
    });

    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Persist theme + set data-theme attribute for CSS
  useEffect(() => {
    window.localStorage.setItem('tribu_theme', theme);
    const dataTheme = themeConfig.dataTheme || theme;
    document.documentElement.setAttribute('data-theme', dataTheme);
  }, [theme, themeConfig]);

  // Persist lang + set html lang attribute
  useEffect(() => {
    window.localStorage.setItem('tribu_lang', lang);
    document.documentElement.lang = lang;
  }, [lang]);

  // Bootstrap after login (skip in demo mode — data already injected)
  useEffect(() => {
    if (!loggedIn || demoMode) return;

    (async () => {
      setLoading(true);
      const { ok: meOk, data: meData } = await api.apiGetMe();
      if (meOk) {
        setMe(meData);
        if (meData.profile_image) setProfileImage(meData.profile_image);
      }

      const { ok: famOk, data: famData } = await api.apiGetMyFamilies();
      if (famOk && famData.length > 0) {
        setFamilies(famData);
        const fid = String(famData[0].family_id);
        setFamilyId(fid);
        setMyFamilyRole(famData[0].role);
        setMyFamilyIsAdult(famData[0].is_adult);
        await Promise.all([loadDashboard(fid), loadEvents(fid), loadMembers(fid), loadContacts(fid), loadBirthdays(fid), loadTasks(fid), loadShoppingLists(fid), loadNavOrder()]);
      }

      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loggedIn]);

  // Listen for NAVIGATE messages from service worker (push notification clicks)
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const handler = (event) => {
      if (event.data?.type === 'NAVIGATE' && event.data.url) {
        setActiveView(event.data.url);
      }
    };
    navigator.serviceWorker.addEventListener('message', handler);
    return () => navigator.serviceWorker.removeEventListener('message', handler);
  }, []);

  // Notification polling — separate effect to avoid race conditions with bootstrap
  useEffect(() => {
    if (!loggedIn || demoMode) return;

    let cancelled = false;
    let pollInterval = null;

    (async () => {
      const { ok, data } = await api.apiGetUnreadCount();
      if (!cancelled && ok) setUnreadCount(data.count);
    })();

    pollInterval = setInterval(async () => {
      const { ok, data } = await api.apiGetUnreadCount();
      if (!cancelled && ok) setUnreadCount(data.count);
    }, 30000);

    return () => {
      cancelled = true;
      clearInterval(pollInterval);
    };
  }, [loggedIn, demoMode]);

  const value = {
    loading,
    loggedIn, setLoggedIn,
    me, setMe,
    profileImage, setProfileImage,
    familyId, setFamilyId,
    families, setFamilies,
    myFamilyRole, setMyFamilyRole,
    members,
    theme, setTheme,
    lang, setLang,
    messages,
    tokens,
    availableThemes,
    availableLanguages,
    ui,
    activeView, setActiveView,
    isMobile,
    isAdmin, isChild,
    summary, setSummary,
    events, setEvents,
    contacts, setContacts,
    birthdays, setBirthdays,
    tasks, setTasks,
    shoppingLists, setShoppingLists,
    navOrder, setNavOrder, loadNavOrder,
    loadDashboard, loadEvents, loadMembers, loadContacts, loadBirthdays, loadTasks, loadShoppingLists, loadNotifications,
    notifications, setNotifications, unreadCount, setUnreadCount,
    switchFamily,
    logout,
    needsSetup, setNeedsSetup,
    demoMode, enterDemo,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
