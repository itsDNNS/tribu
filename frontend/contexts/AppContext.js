import { createContext, useCallback, useContext, useEffect, useRef } from 'react';
import * as api from '../lib/api';
import { buildDemoData } from '../lib/demo-data';
import { AuthProvider, useAuth } from './AuthContext';
import { FamilyProvider, useFamily } from './FamilyContext';
import { DataProvider, useData } from './DataContext';
import { UIProvider, useUI, DEFAULT_NAV_ORDER } from './UIContext';

export { DEFAULT_NAV_ORDER };

const AppContext = createContext(null);

export function useApp() {
  return useContext(AppContext);
}

function AppOrchestrator({ children }) {
  const auth = useAuth();
  const family = useFamily();
  const data = useData();
  const ui = useUI();

  const { loggedIn, demoMode, me, setMe, setLoggedIn, setDemoMode, setProfileImage, setNeedsSetup } = auth;
  const { familyId, setFamilyId, families, setFamilies, setMyFamilyRole, setMyFamilyIsAdult, loadMembers, setMembers } = family;
  const { loadDashboard, loadEvents, loadContacts, loadBirthdays, loadTasks, loadShoppingLists, loadNotifications, resetData, lastEventIdRef, setNotifications, setUnreadCount, setEvents, setTasks, setShoppingLists, setContacts, setBirthdays, setSummary } = data;
  const { setLoading, setTheme, setLang, setActiveView: setActiveViewUI, setIsMobile, setNavOrder, lang, messages } = ui;

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
  }, [demoMode, setNavOrder]);

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
  }, [families, loadDashboard, loadEvents, loadMembers, loadContacts, loadBirthdays, loadTasks, loadShoppingLists, setLoading, setFamilyId, setMyFamilyRole, setMyFamilyIsAdult]);

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
  }, [lang, setDemoMode, setMe, setFamilies, setFamilyId, setMyFamilyRole, setMyFamilyIsAdult, setMembers, setEvents, setTasks, setShoppingLists, setContacts, setBirthdays, setSummary, setLoggedIn, setLoading]);

  const logout = useCallback(async () => {
    await auth.logout();
    resetData();
    setFamilies([]);
    setFamilyId('1');
    setMembers([]);
    setMyFamilyRole('member');
    setMyFamilyIsAdult(true);
    setNavOrder(DEFAULT_NAV_ORDER);
  }, [auth.logout, resetData, setFamilies, setFamilyId, setMembers, setMyFamilyRole, setMyFamilyIsAdult, setNavOrder]);

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
    // Hash takes priority (bookmarkable URLs), then sessionStorage
    const hashView = window.location.hash?.slice(1);
    const savedView = hashView || sessionStorage.getItem('tribu_view');
    if (savedView) setActiveViewUI(savedView);

    const onResize = () => setIsMobile(window.innerWidth < 768);
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

    return () => window.removeEventListener('resize', onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist theme
  useEffect(() => {
    window.localStorage.setItem('tribu_theme', ui.theme);
    document.documentElement.setAttribute('data-theme', ui.theme);
  }, [ui.theme]);

  // Persist lang
  useEffect(() => {
    window.localStorage.setItem('tribu_lang', ui.lang);
    document.documentElement.lang = ui.lang;
  }, [ui.lang]);

  // Bootstrap after login
  useEffect(() => {
    if (!loggedIn || demoMode) return;

    // Clear landing page hash (only #auth, not navigation hashes)
    if (window.location.hash === '#auth') {
      history.replaceState(null, '', '#dashboard');
    }

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
        await Promise.all([loadDashboard(fid), loadEvents(fid), loadMembers(fid), loadContacts(fid), loadBirthdays(fid), loadTasks(fid), loadShoppingLists(fid), loadNavOrderWrapped()]);
      }

      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loggedIn]);

  // SW navigation messages
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const handler = (event) => {
      if (event.data?.type === 'NAVIGATE' && event.data.url) {
        setActiveViewUI(event.data.url);
      }
    };
    navigator.serviceWorker.addEventListener('message', handler);
    return () => navigator.serviceWorker.removeEventListener('message', handler);
  }, [setActiveViewUI]);

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
  }, [loggedIn, demoMode, loadNotificationsWrapped, lastEventIdRef, setNotifications, setUnreadCount]);

  // Compose the value that useApp() returns — backward compatible
  const value = {
    // Auth
    ...auth,
    logout,
    // Family
    ...family,
    // Data
    ...data,
    // UI
    ...ui,
    // Orchestrated loaders (with familyId default + demo guard)
    loadDashboard: loadDashboardWrapped,
    loadEvents: loadEventsWrapped,
    loadMembers: loadMembersWrapped,
    loadContacts: loadContactsWrapped,
    loadBirthdays: loadBirthdaysWrapped,
    loadTasks: loadTasksWrapped,
    loadShoppingLists: loadShoppingListsWrapped,
    loadNotifications: loadNotificationsWrapped,
    loadNavOrder: loadNavOrderWrapped,
    // Cross-domain
    switchFamily,
    enterDemo,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function AppProvider({ children }) {
  return (
    <UIProvider>
      <AuthProvider>
        <FamilyProvider>
          <DataProvider>
            <AppOrchestrator>{children}</AppOrchestrator>
          </DataProvider>
        </FamilyProvider>
      </AuthProvider>
    </UIProvider>
  );
}
