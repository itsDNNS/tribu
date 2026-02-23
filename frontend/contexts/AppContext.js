import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { buildMessages } from '../lib/i18n';
import { getTheme, listThemes } from '../lib/themes';
import { buildUi } from '../lib/styles';
import * as api from '../lib/api';

const AppContext = createContext(null);

export function useApp() {
  return useContext(AppContext);
}

export function AppProvider({ children }) {
  // Auth
  const [loggedIn, setLoggedIn] = useState(false);
  const [me, setMe] = useState(null);
  const [profileImage, setProfileImage] = useState('');

  // Family
  const [familyId, setFamilyId] = useState('1');
  const [families, setFamilies] = useState([]);
  const [myFamilyRole, setMyFamilyRole] = useState('member');
  const [members, setMembers] = useState([]);

  // Theme / i18n
  const [theme, setTheme] = useState('light');
  const [lang, setLang] = useState('de');

  // Layout
  const [activeView, setActiveView] = useState('dashboard');
  const [isMobile, setIsMobile] = useState(false);

  // Data
  const [summary, setSummary] = useState({ next_events: [], upcoming_birthdays: [] });
  const [events, setEvents] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [tasks, setTasks] = useState([]);

  // Derived
  const messages = useMemo(() => buildMessages(lang), [lang]);
  const themeConfig = useMemo(() => getTheme(theme), [theme]);
  const tokens = themeConfig.tokens;
  const availableThemes = useMemo(() => listThemes(), []);
  const ui = useMemo(() => buildUi(tokens), [tokens]);
  const isAdmin = myFamilyRole === 'admin' || myFamilyRole === 'owner';

  // Loaders
  const loadDashboard = useCallback(async (fid = familyId) => {
    const { ok, data } = await api.apiGetDashboard(fid);
    if (ok) setSummary(data);
  }, [familyId]);

  const loadEvents = useCallback(async (fid = familyId) => {
    const { ok, data } = await api.apiGetEvents(fid);
    if (ok) setEvents(data);
  }, [familyId]);

  const loadMembers = useCallback(async (fid = familyId) => {
    const { ok, data } = await api.apiGetMembers(fid);
    if (ok) setMembers(data);
  }, [familyId]);

  const loadContacts = useCallback(async (fid = familyId) => {
    const { ok, data } = await api.apiGetContacts(fid);
    if (ok) setContacts(data);
  }, [familyId]);

  const loadTasks = useCallback(async (fid = familyId) => {
    const { ok, data } = await api.apiGetTasks(fid);
    if (ok) setTasks(data);
  }, [familyId]);

  const switchFamily = useCallback(async (fid) => {
    setFamilyId(fid);
    const selected = families.find((f) => String(f.family_id) === String(fid));
    if (selected) setMyFamilyRole(selected.role);
    await Promise.all([loadDashboard(fid), loadEvents(fid), loadMembers(fid), loadContacts(fid), loadTasks(fid)]);
  }, [families, loadDashboard, loadEvents, loadMembers, loadContacts, loadTasks]);

  const logout = useCallback(async () => {
    await api.apiLogout();
    setLoggedIn(false);
    setMe(null);
    setEvents([]);
    setSummary({ next_events: [], upcoming_birthdays: [] });
    setMembers([]);
    setContacts([]);
    setTasks([]);
  }, []);

  // Init: localStorage, resize, auto-login
  useEffect(() => {
    setTheme(window.localStorage.getItem('tribu_theme') || 'light');
    setLang(window.localStorage.getItem('tribu_lang') || 'de');
    setProfileImage('');

    const onResize = () => setIsMobile(window.innerWidth < 900);
    onResize();
    window.addEventListener('resize', onResize);

    api.apiGetMe().then(({ ok, data }) => {
      if (ok && data) {
        setMe(data);
        if (data.profile_image) setProfileImage(data.profile_image);
        setLoggedIn(true);
      }
    });

    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Persist theme + body background
  useEffect(() => {
    window.localStorage.setItem('tribu_theme', theme);
    document.body.style.background = tokens.bg;
  }, [theme, tokens.bg]);

  // Persist lang
  useEffect(() => {
    window.localStorage.setItem('tribu_lang', lang);
  }, [lang]);

  // Bootstrap after login
  useEffect(() => {
    if (!loggedIn) return;

    (async () => {
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
        await Promise.all([loadDashboard(fid), loadEvents(fid), loadMembers(fid), loadContacts(fid), loadTasks(fid)]);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loggedIn]);

  const value = {
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
    ui,
    activeView, setActiveView,
    isMobile,
    isAdmin,
    summary,
    events,
    contacts,
    tasks,
    loadDashboard, loadEvents, loadMembers, loadContacts, loadTasks,
    switchFamily,
    logout,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
