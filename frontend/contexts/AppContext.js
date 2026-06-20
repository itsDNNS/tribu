import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import * as api from '../lib/api';
import { buildDemoData } from '../lib/demo-data';
import { buildMessages, listLanguages } from '../lib/i18n';
import { resolveInitialView } from '../lib/navigationState';
import { notificationLinkView } from '../lib/notificationLinks';
import { buildUi } from '../lib/styles';
import { getTheme, listThemes } from '../lib/themes';

export const DEFAULT_NAV_ORDER = ['dashboard', 'calendar', 'weekly_plan', 'shopping', 'tasks', 'activity', 'templates', 'meal_plans', 'school_timetables', 'recipes', 'rewards', 'gifts', 'contacts', 'notifications', 'settings', 'admin'];

const AppContext = createContext(null);

export function useApp() {
  return useContext(AppContext);
}

export function AppProvider({ children }) {
  // Auth state
  const [loggedIn, setLoggedIn] = useState(false);
  const [me, setMe] = useState(null);
  const [profileImage, setProfileImage] = useState('');
  const [needsSetup, setNeedsSetup] = useState(false);
  const [demoMode, setDemoMode] = useState(false);

  // Family state
  const [familyId, setFamilyId] = useState('1');
  const [families, setFamilies] = useState([]);
  const [myFamilyRole, setMyFamilyRole] = useState('member');
  const [myFamilyIsAdult, setMyFamilyIsAdult] = useState(true);
  const [members, setMembers] = useState([]);

  // Data state
  const [summary, setSummary] = useState({ next_events: [], upcoming_birthdays: [] });
  const [events, setEvents] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [birthdays, setBirthdays] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [shoppingLists, setShoppingLists] = useState([]);
  const [mealPlans, setMealPlans] = useState([]);
  const [activity, setActivity] = useState([]);
  const [quickCaptureInbox, setQuickCaptureInbox] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const lastEventIdRef = useRef(0);

  // UI state
  const [theme, setTheme] = useState('light');
  const [lang, setLang] = useState('en');
  const [activeView, setActiveViewRaw] = useState('dashboard');
  const [isMobile, setIsMobile] = useState(false);
  const [navOrder, setNavOrder] = useState(DEFAULT_NAV_ORDER);
  const [loading, setLoading] = useState(true);
  const [timeFormat, setTimeFormat] = useState('24h');

  const messages = useMemo(() => buildMessages(lang), [lang]);
  const themeConfig = useMemo(() => getTheme(theme), [theme]);
  const tokens = themeConfig.tokens;
  const availableThemes = useMemo(() => listThemes(), []);
  const availableLanguages = useMemo(() => listLanguages(), []);
  const ui = useMemo(() => buildUi(tokens), [tokens]);

  const isAdmin = myFamilyRole === 'admin' || myFamilyRole === 'owner';
  const isChild = !isAdmin && !myFamilyIsAdult;

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

  const loadDashboard = useCallback(async (fid) => {
    const { ok, data } = await api.apiGetDashboard(fid);
    if (ok) setSummary(data);
  }, []);

  const loadEvents = useCallback(async (fid) => {
    const { ok, data } = await api.apiGetEvents(fid);
    if (ok) setEvents(data);
  }, []);

  const loadMembers = useCallback(async (fid) => {
    const { ok, data } = await api.apiGetMembers(fid);
    if (ok) setMembers(data);
  }, []);

  const loadContacts = useCallback(async (fid) => {
    const { ok, data } = await api.apiGetContacts(fid);
    if (ok) setContacts(data);
  }, []);

  const loadBirthdays = useCallback(async (fid) => {
    const { ok, data } = await api.apiGetBirthdays(fid);
    if (ok) setBirthdays(data);
  }, []);

  const loadTasks = useCallback(async (fid) => {
    const { ok, data } = await api.apiGetTasks(fid);
    if (ok) setTasks(data);
  }, []);

  const loadShoppingLists = useCallback(async (fid) => {
    const { ok, data } = await api.apiGetShoppingLists(fid);
    if (ok) setShoppingLists(data);
  }, []);

  const loadActivity = useCallback(async (fid) => {
    const { ok, data } = await api.apiGetActivity(fid, 10, 0);
    if (ok) setActivity(Array.isArray(data?.items) ? data.items : []);
  }, []);

  const loadQuickCaptureInbox = useCallback(async (fid) => {
    const { ok, data } = await api.apiGetQuickCaptureInbox(fid, 10, 0);
    if (ok) setQuickCaptureInbox(Array.isArray(data?.items) ? data.items : []);
  }, []);

  const loadNotifications = useCallback(async () => {
    const { ok, data } = await api.apiGetNotifications(50, 0);
    if (ok) {
      setNotifications(data);
      setUnreadCount(data.filter((n) => !n.read).length);
      if (data.length) {
        lastEventIdRef.current = Math.max(lastEventIdRef.current, data[0].id);
      }
    }
  }, []);

  const resetData = useCallback(() => {
    setEvents([]);
    setSummary({ next_events: [], upcoming_birthdays: [] });
    setContacts([]);
    setBirthdays([]);
    setTasks([]);
    setShoppingLists([]);
    setMealPlans([]);
    setActivity([]);
    setQuickCaptureInbox([]);
    setNotifications([]);
    setUnreadCount(0);
  }, []);

  // Wrap data loaders to inject familyId default and skip in demo mode
  const loadDashboardWrapped = useCallback(async (fid = familyId) => {
    if (demoMode) return;
    return loadDashboard(fid);
  }, [familyId, demoMode, loadDashboard]);

  const loadEventsWrapped = useCallback(async (fid = familyId) => {
    if (demoMode) return;
    return loadEvents(fid);
  }, [familyId, demoMode, loadEvents]);

  const loadMembersWrapped = useCallback(async (fid = familyId) => {
    if (demoMode) return;
    return loadMembers(fid);
  }, [familyId, demoMode, loadMembers]);

  const loadContactsWrapped = useCallback(async (fid = familyId) => {
    if (demoMode) return;
    return loadContacts(fid);
  }, [familyId, demoMode, loadContacts]);

  const loadBirthdaysWrapped = useCallback(async (fid = familyId) => {
    if (demoMode) return;
    return loadBirthdays(fid);
  }, [familyId, demoMode, loadBirthdays]);

  const loadTasksWrapped = useCallback(async (fid = familyId) => {
    if (demoMode) return;
    return loadTasks(fid);
  }, [familyId, demoMode, loadTasks]);

  const loadShoppingListsWrapped = useCallback(async (fid = familyId) => {
    if (demoMode) return;
    return loadShoppingLists(fid);
  }, [familyId, demoMode, loadShoppingLists]);

  const loadActivityWrapped = useCallback(async (fid = familyId) => {
    if (demoMode) return;
    return loadActivity(fid);
  }, [familyId, demoMode, loadActivity]);

  const loadQuickCaptureInboxWrapped = useCallback(async (fid = familyId) => {
    if (demoMode) return;
    return loadQuickCaptureInbox(fid);
  }, [familyId, demoMode, loadQuickCaptureInbox]);

  const loadNotificationsWrapped = useCallback(async () => {
    if (demoMode) return;
    return loadNotifications();
  }, [demoMode, loadNotifications]);

  const loadNavOrderWrapped = useCallback(async () => {
    if (demoMode) return;
    const { ok, data: navData } = await api.apiGetNavOrder();
    if (ok && navData?.nav_order) {
      const order = navData.nav_order;
      const missing = DEFAULT_NAV_ORDER.filter((k) => !order.includes(k));
      setNavOrder(missing.length ? [...order, ...missing] : order);
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
    await Promise.all([loadDashboard(fid), loadEvents(fid), loadMembers(fid), loadContacts(fid), loadBirthdays(fid), loadTasks(fid), loadShoppingLists(fid), loadActivity(fid), loadQuickCaptureInbox(fid)]);
    setLoading(false);
  }, [families, loadDashboard, loadEvents, loadMembers, loadContacts, loadBirthdays, loadTasks, loadShoppingLists, loadActivity, loadQuickCaptureInbox]);

  const loadFamilyDataInBackground = useCallback((fid) => {
    void Promise.allSettled([
      loadDashboard(fid),
      loadEvents(fid),
      loadMembers(fid),
      loadContacts(fid),
      loadBirthdays(fid),
      loadTasks(fid),
      loadShoppingLists(fid),
      loadActivity(fid),
      loadQuickCaptureInbox(fid),
      loadNavOrderWrapped(),
      api.apiGetTimeFormat().then(({ ok, data: tfData }) => {
        if (ok && tfData?.time_format) setTimeFormat(tfData.time_format);
      }),
    ]);
  }, [loadDashboard, loadEvents, loadMembers, loadContacts, loadBirthdays, loadTasks, loadShoppingLists, loadActivity, loadQuickCaptureInbox, loadNavOrderWrapped]);

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
    setMealPlans(demo.mealPlans || []);
    setActivity(demo.activity || []);
    setQuickCaptureInbox(demo.quickCaptureInbox || []);
    setContacts(demo.contacts);
    setBirthdays(demo.birthdays);
    setSummary(demo.summary);
    setNeedsSetup(false);
    setLoggedIn(true);
    setLoading(false);
  }, [lang]);

  const logout = useCallback(async () => {
    if (!demoMode) await api.apiLogout();
    setDemoMode(false);
    setLoggedIn(false);
    setMe(null);
    resetData();
    setFamilies([]);
    setFamilyId('1');
    setMembers([]);
    setMyFamilyRole('member');
    setMyFamilyIsAdult(true);
    setNavOrder(DEFAULT_NAV_ORDER);
  }, [demoMode, resetData]);

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
    // Hash takes priority (bookmarkable URLs), then PWA shortcut query URLs, then sessionStorage.
    const VALID_VIEWS = new Set(DEFAULT_NAV_ORDER);
    const savedView = resolveInitialView({
      hash: window.location.hash,
      search: window.location.search,
      storedView: sessionStorage.getItem('tribu_view'),
      validViews: VALID_VIEWS,
    });
    if (savedView) restoreView(savedView);

    // Listen for browser back/forward
    const onPopState = () => {
      const v = window.location.hash?.slice(1);
      if (v && VALID_VIEWS.has(v)) restoreView(v);
    };
    window.addEventListener('popstate', onPopState);

    const onResize = () => setIsMobile(window.innerWidth <= 768);
    onResize();
    window.addEventListener('resize', onResize);

    api.apiGetMe().then(async ({ ok, data: meData }) => {
      if (ok && meData) {
        setMe(meData);
        if (meData.profile_image) setProfileImage(meData.profile_image);
        setLoggedIn(true);
      } else {
        const { ok: sOk, data: sData } = await api.apiGetSetupStatus();
        if (sOk && sData?.needs_setup) setNeedsSetup(true);
        setLoading(false);
      }
    });

    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('popstate', onPopState);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist theme
  useEffect(() => {
    window.localStorage.setItem('tribu_theme', theme);
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Persist lang
  useEffect(() => {
    window.localStorage.setItem('tribu_lang', lang);
    document.documentElement.lang = lang;
  }, [lang]);

  // Bootstrap after login
  useEffect(() => {
    if (!loggedIn || demoMode) return;

    // Clear landing page hash (only #auth, not navigation hashes)
    if (window.location.hash === '#auth') {
      history.replaceState(null, '', '#dashboard');
    }

    (async () => {
      setLoading(true);
      try {
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
          loadFamilyDataInBackground(fid);
        }
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loggedIn]);

  // SW navigation messages
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const handler = (event) => {
      if (event.data?.type === 'NAVIGATE' && event.data.url) {
        setActiveView(notificationLinkView(event.data.url));
      }
    };
    navigator.serviceWorker.addEventListener('message', handler);
    return () => navigator.serviceWorker.removeEventListener('message', handler);
  }, [setActiveView]);

  // SSE real-time notifications with polling fallback
  useEffect(() => {
    if (!loggedIn || demoMode) return;

    let cancelled = false;
    let es = null;
    let reconnectTimer = null;
    let pollInterval = null;
    let backoff = 1000;

    (async () => {
      const { ok: countOk, data: countData } = await api.apiGetUnreadCount();
      if (!cancelled && countOk) setUnreadCount(countData.count);

      const { ok: listOk, data: listData } = await api.apiGetNotifications(1, 0);
      if (!cancelled && listOk && listData?.length) {
        lastEventIdRef.current = listData[0].id;
      }

      if (!cancelled) connect();
    })();

    function connect() {
      if (cancelled) return;
      es = api.connectNotificationStream((notif) => {
        if (cancelled) return;
        if (notif.id <= lastEventIdRef.current) return;
        lastEventIdRef.current = notif.id;
        setNotifications(prev => [notif, ...prev]);
        if (!notif.read) setUnreadCount(c => c + 1);
      }, { lastEventId: lastEventIdRef.current });

      es.onopen = () => {
        backoff = 1000;
        if (pollInterval) {
          clearInterval(pollInterval);
          pollInterval = null;
        }
      };

      es.onerror = () => {
        es.close();
        if (!pollInterval && !cancelled) {
          pollInterval = setInterval(async () => {
            const { ok, data: countData } = await api.apiGetUnreadCount();
            if (!cancelled && ok) setUnreadCount(countData.count);
            if (!cancelled) await loadNotificationsWrapped();
          }, 30000);
        }
        clearTimeout(reconnectTimer);
        const delay = backoff;
        backoff = Math.min(backoff * 2, 30000);
        reconnectTimer = setTimeout(() => connect(), delay);
      };
    }

    return () => {
      cancelled = true;
      if (es) es.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [loggedIn, demoMode, loadNotificationsWrapped]);

  const value = {
    // Auth
    loggedIn, setLoggedIn,
    me, setMe,
    profileImage, setProfileImage,
    needsSetup, setNeedsSetup,
    demoMode, setDemoMode,
    logout,
    // Family
    familyId, setFamilyId,
    families, setFamilies,
    myFamilyRole, setMyFamilyRole,
    myFamilyIsAdult, setMyFamilyIsAdult,
    members, setMembers,
    loadMembers: loadMembersWrapped,
    isAdmin, isChild,
    // Data
    summary, setSummary,
    events, setEvents,
    contacts, setContacts,
    birthdays, setBirthdays,
    tasks, setTasks,
    shoppingLists, setShoppingLists,
    mealPlans, setMealPlans,
    activity, setActivity,
    quickCaptureInbox, setQuickCaptureInbox,
    notifications, setNotifications,
    unreadCount, setUnreadCount,
    lastEventIdRef,
    loadDashboard: loadDashboardWrapped,
    loadEvents: loadEventsWrapped,
    loadContacts: loadContactsWrapped,
    loadBirthdays: loadBirthdaysWrapped,
    loadTasks: loadTasksWrapped,
    loadShoppingLists: loadShoppingListsWrapped,
    loadActivity: loadActivityWrapped,
    loadQuickCaptureInbox: loadQuickCaptureInboxWrapped,
    loadNotifications: loadNotificationsWrapped,
    resetData,
    // UI
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
    loadNavOrder: loadNavOrderWrapped,
    // Cross-domain
    switchFamily,
    enterDemo,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
