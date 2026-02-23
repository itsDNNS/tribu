import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, CheckSquare, LayoutDashboard, Settings, Shield, Moon, Sun, Languages, BookUser } from 'lucide-react';
import { buildMessages, t } from '../lib/i18n';
import { getTheme, listThemes } from '../lib/themes';

const API = '/api';

function resolveApiBase() {
  return API;
}

function toIsoOrNull(localValue) {
  if (!localValue) return null;
  return new Date(localValue).toISOString();
}

function prettyDate(value) {
  if (!value) return '-';
  const d = new Date(value);
  return d.toLocaleString('de-DE', {
    weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

function errorText(detail, fallback) {
  if (!detail) return fallback;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail) && detail[0]?.msg) return detail[0].msg;
  if (typeof detail === 'object' && detail.msg) return detail.msg;
  try { return JSON.stringify(detail); } catch { return fallback; }
}

export default function Home() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [familyName, setFamilyName] = useState('');
  const [loggedIn, setLoggedIn] = useState(false);
  const [authMode, setAuthMode] = useState('login');
  const [msg, setMsg] = useState('');

  const [theme, setTheme] = useState('light');
  const [lang, setLang] = useState('de');
  const [activeView, setActiveView] = useState('dashboard');
  const [contacts, setContacts] = useState([]);
  const [contactsCsv, setContactsCsv] = useState('');
  const [isMobile, setIsMobile] = useState(false);

  const [me, setMe] = useState(null);
  const [profileImage, setProfileImage] = useState('');
  const [familyId, setFamilyId] = useState('1');
  const [myFamilyRole, setMyFamilyRole] = useState('member');
  const [families, setFamilies] = useState([]);

  const [summary, setSummary] = useState({ next_events: [], upcoming_birthdays: [] });
  const [events, setEvents] = useState([]);
  const [members, setMembers] = useState([]);
  const [calendarMsg, setCalendarMsg] = useState('');
  const [calendarView, setCalendarView] = useState('month');
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [allDay, setAllDay] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);

  const [birthdayName, setBirthdayName] = useState('');
  const [birthdayMonth, setBirthdayMonth] = useState('');
  const [birthdayDay, setBirthdayDay] = useState('');

  const [tasks, setTasks] = useState([]);
  const [taskFilter, setTaskFilter] = useState('open');
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDesc, setTaskDesc] = useState('');
  const [taskDueDate, setTaskDueDate] = useState('');
  const [taskPriority, setTaskPriority] = useState('normal');
  const [taskRecurrence, setTaskRecurrence] = useState('');
  const [taskAssignee, setTaskAssignee] = useState('');
  const [taskMsg, setTaskMsg] = useState('');

  const messages = useMemo(() => buildMessages(lang), [lang]);
  const apiBase = useMemo(() => resolveApiBase(), []);
  const themeConfig = useMemo(() => getTheme(theme), [theme]);
  const tokens = themeConfig.tokens;
  const availableThemes = useMemo(() => listThemes(), []);

  const weekBuckets = useMemo(() => {
    const buckets = {};
    for (const e of events) {
      const key = new Date(e.starts_at).toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit' });
      if (!buckets[key]) buckets[key] = [];
      buckets[key].push(e);
    }
    return buckets;
  }, [events]);

  const monthLabel = useMemo(
    () => calendarMonth.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' }),
    [calendarMonth],
  );

  const selectedDayEvents = useMemo(() => {
    if (!selectedDate) return [];
    const y = selectedDate.getFullYear();
    const m = selectedDate.getMonth();
    const d = selectedDate.getDate();
    return events.filter((ev) => {
      const dt = new Date(ev.starts_at);
      return dt.getFullYear() === y && dt.getMonth() === m && dt.getDate() === d;
    });
  }, [events, selectedDate]);

  const monthCells = useMemo(() => {
    const y = calendarMonth.getFullYear();
    const m = calendarMonth.getMonth();
    const first = new Date(y, m, 1);
    const lastDay = new Date(y, m + 1, 0).getDate();
    const startOffset = (first.getDay() + 6) % 7;

    const eventCount = {};
    for (const ev of events) {
      const d = new Date(ev.starts_at);
      if (d.getFullYear() === y && d.getMonth() === m) {
        const day = d.getDate();
        eventCount[day] = (eventCount[day] || 0) + 1;
      }
    }

    const cells = [];
    for (let i = 0; i < startOffset; i += 1) cells.push({ empty: true });
    for (let d = 1; d <= lastDay; d += 1) cells.push({ day: d, count: eventCount[d] || 0 });
    while (cells.length % 7 !== 0) cells.push({ empty: true });
    return cells;
  }, [calendarMonth, events]);

  const weekInfo = useMemo(() => {
    const ref = selectedDate || new Date();
    const current = new Date(ref);
    const day = (current.getDay() + 6) % 7;
    const weekStart = new Date(current);
    weekStart.setDate(current.getDate() - day);
    weekStart.setHours(0, 0, 0, 0);

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 7);

    const firstThursday = new Date(current.getFullYear(), 0, 4);
    const firstThursdayDay = (firstThursday.getDay() + 6) % 7;
    const firstWeekStart = new Date(firstThursday);
    firstWeekStart.setDate(firstThursday.getDate() - firstThursdayDay);
    firstWeekStart.setHours(0, 0, 0, 0);

    const diffMs = weekStart - firstWeekStart;
    const weekNumber = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000)) + 1;

    const weekEvents = events.filter((ev) => {
      const dt = new Date(ev.starts_at);
      return dt >= weekStart && dt < weekEnd;
    });

    return {
      weekStart,
      weekEnd,
      weekNumber,
      weekEvents,
    };
  }, [events, selectedDate]);

  useEffect(() => {
    setTheme(window.localStorage.getItem('tribu_theme') || 'light');
    setLang(window.localStorage.getItem('tribu_lang') || 'de');
    setProfileImage('');

    const onResize = () => setIsMobile(window.innerWidth < 900);
    onResize();
    window.addEventListener('resize', onResize);

    // Auto-login: check if cookie session is still valid
    fetch(`${API}/auth/me`, { credentials: 'include' })
      .then((res) => {
        if (res.ok) return res.json();
        return null;
      })
      .then((data) => {
        if (data) {
          setMe(data);
          if (data.profile_image) setProfileImage(data.profile_image);
          setLoggedIn(true);
        }
      })
      .catch(() => {});

    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    window.localStorage.setItem('tribu_theme', theme);
    document.body.style.background = tokens.bg;
  }, [theme, tokens.bg]);

  useEffect(() => {
    window.localStorage.setItem('tribu_lang', lang);
  }, [lang]);

  useEffect(() => {
    // Profilbild wird serverseitig gespeichert, nicht in localStorage.
  }, [profileImage]);

  useEffect(() => {
    if (!loggedIn) return;
    bootstrapAfterLogin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loggedIn]);

  async function bootstrapAfterLogin() {
    const meRes = await fetch(`${apiBase}/auth/me`, { credentials: 'include' });
    const meData = await meRes.json();
    if (meRes.ok) {
      setMe(meData);
      if (meData.profile_image) setProfileImage(meData.profile_image);
    }

    const famRes = await fetch(`${apiBase}/families/me`, { credentials: 'include' });
    const famData = await famRes.json();
    if (famRes.ok && famData.length > 0) {
      setFamilies(famData);
      const fid = String(famData[0].family_id);
      setFamilyId(fid);
      setMyFamilyRole(famData[0].role);
      await Promise.all([loadDashboard(fid), loadEvents(fid), loadMembers(fid), loadContacts(fid), loadTasks(fid)]);
    }
  }

  async function register(e) {
    e.preventDefault();
    setMsg('');
    const res = await fetch(`${apiBase}/auth/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password, display_name: displayName, family_name: familyName }),
    });
    const data = await res.json();
    if (!res.ok) return setMsg(errorText(data.detail, 'Register fehlgeschlagen'));
    setLoggedIn(true);
    setMsg('Registrierung erfolgreich');
  }

  async function login(e) {
    e.preventDefault();
    setMsg('');
    const res = await fetch(`${apiBase}/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) return setMsg(errorText(data.detail, 'Login fehlgeschlagen'));
    setLoggedIn(true);
  }

  async function loadDashboard(fid = familyId) {
    const res = await fetch(`${apiBase}/dashboard/summary?family_id=${fid}`, { credentials: 'include' });
    const data = await res.json();
    if (res.ok) setSummary(data);
  }

  async function loadEvents(fid = familyId) {
    const res = await fetch(`${apiBase}/calendar/events?family_id=${fid}`, { credentials: 'include' });
    const data = await res.json();
    if (!res.ok) return setCalendarMsg(errorText(data.detail, 'Events konnten nicht geladen werden'));
    setEvents(data);
  }

  async function loadMembers(fid = familyId) {
    const res = await fetch(`${apiBase}/families/${fid}/members`, { credentials: 'include' });
    const data = await res.json();
    if (res.ok) setMembers(data);
  }

  async function loadContacts(fid = familyId) {
    const res = await fetch(`${apiBase}/contacts?family_id=${fid}`, { credentials: 'include' });
    const data = await res.json();
    if (res.ok) setContacts(data);
  }

  async function loadTasks(fid = familyId) {
    const res = await fetch(`${apiBase}/tasks?family_id=${fid}`, { credentials: 'include' });
    const data = await res.json();
    if (res.ok) setTasks(data);
  }

  async function createTask(e) {
    e.preventDefault();
    setTaskMsg('');
    const payload = {
      family_id: Number(familyId),
      title: taskTitle,
      description: taskDesc || null,
      priority: taskPriority,
      due_date: toIsoOrNull(taskDueDate),
      recurrence: taskRecurrence || null,
      assigned_to_user_id: taskAssignee ? Number(taskAssignee) : null,
    };
    const res = await fetch(`${apiBase}/tasks`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) return setTaskMsg(errorText(data.detail, 'Aufgabe erstellen fehlgeschlagen'));
    setTaskTitle(''); setTaskDesc(''); setTaskDueDate(''); setTaskPriority('normal'); setTaskRecurrence(''); setTaskAssignee('');
    await loadTasks();
    setTaskMsg(t(messages, 'module.tasks.created'));
  }

  async function toggleTask(id, currentStatus) {
    const newStatus = currentStatus === 'done' ? 'open' : 'done';
    await fetch(`${apiBase}/tasks/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ status: newStatus }),
    });
    await loadTasks();
  }

  async function deleteTask(id) {
    await fetch(`${apiBase}/tasks/${id}`, { method: 'DELETE', credentials: 'include' });
    await loadTasks();
  }

  async function createEvent(e) {
    e.preventDefault();
    const payload = {
      family_id: Number(familyId), title, description: description || null,
      starts_at: toIsoOrNull(startsAt), ends_at: toIsoOrNull(endsAt), all_day: allDay,
    };
    const res = await fetch(`${apiBase}/calendar/events`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) return setCalendarMsg(errorText(data.detail, 'Event erstellen fehlgeschlagen'));
    setTitle(''); setDescription(''); setStartsAt(''); setEndsAt(''); setAllDay(false);
    await Promise.all([loadEvents(), loadDashboard()]);
    setCalendarMsg('Event erstellt');
  }

  async function addBirthday(e) {
    e.preventDefault();
    const res = await fetch(`${apiBase}/birthdays`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ family_id: Number(familyId), person_name: birthdayName, month: Number(birthdayMonth), day: Number(birthdayDay) }),
    });
    const data = await res.json();
    if (!res.ok) return setCalendarMsg(errorText(data.detail, 'Geburtstag konnte nicht gespeichert werden'));
    setBirthdayName(''); setBirthdayMonth(''); setBirthdayDay('');
    await loadDashboard();
  }

  async function importContactsCsv(e) {
    e.preventDefault();
    const res = await fetch(`${apiBase}/contacts/import-csv`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ family_id: Number(familyId), csv_text: contactsCsv }),
    });
    const data = await res.json();
    if (!res.ok) return setCalendarMsg(errorText(data.detail, 'Kontakte konnten nicht importiert werden'));
    setContactsCsv('');
    await Promise.all([loadContacts(), loadDashboard()]);
    setCalendarMsg(`Kontakte importiert: ${data.created}`);
  }

  async function setAdult(userId, isAdult) {
    await fetch(`${apiBase}/families/${familyId}/members/${userId}/adult`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ is_adult: isAdult }),
    });
    await loadMembers();
  }

  async function setRole(userId, role) {
    const res = await fetch(`${apiBase}/families/${familyId}/members/${userId}/role`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ role }),
    });
    if (!res.ok) {
      const d = await res.json();
      setCalendarMsg(errorText(d.detail, 'Rolle konnte nicht gesetzt werden'));
      return;
    }
    await loadMembers();
  }

  function onProfileImage(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const value = String(reader.result || '');
      setProfileImage(value);
      if (loggedIn) {
        await fetch(`${apiBase}/auth/me/profile-image`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ profile_image: value }),
        });
      }
    };
    reader.readAsDataURL(file);
  }

  async function logout() {
    await fetch(`${apiBase}/auth/logout`, { method: 'POST', credentials: 'include' });
    setLoggedIn(false); setMe(null); setEvents([]); setSummary({ next_events: [], upcoming_birthdays: [] }); setMembers([]); setContacts([]); setTasks([]);
  }

  const isAdmin = myFamilyRole === 'admin' || myFamilyRole === 'owner';

  const ui = {
    card: { ...styles.card, background: tokens.surface, borderColor: tokens.border, color: tokens.text },
    smallCard: { ...styles.smallCard, background: tokens.surface, borderColor: tokens.border, color: tokens.text },
    input: { ...styles.input, background: tokens.surface, borderColor: tokens.border, color: tokens.text },
    secondaryBtn: { ...styles.secondaryBtn, background: tokens.surface, borderColor: tokens.border, color: tokens.text },
    primaryBtn: { ...styles.primaryBtn, background: tokens.primary, color: tokens.primaryText },
  };

  if (!loggedIn) {
    return (
      <main style={{ ...styles.page, background: '#f5f7fb' }}>
        <div style={styles.hero}><h1 style={{ margin: 0 }}>{t(messages, 'app_name')}</h1><p style={{ marginTop: 8 }}>{t(messages, 'tagline')}</p></div>
        <section style={styles.cardNarrow}>
          <h2>{authMode === 'login' ? t(messages, 'auth_login') : t(messages, 'auth_register')}</h2>
          {authMode === 'login' ? (
            <form onSubmit={login} style={styles.formGrid}>
              <input style={ui.input} placeholder={t(messages, 'email')} value={email} onChange={(e) => setEmail(e.target.value)} required />
              <input style={ui.input} type="password" placeholder={t(messages, 'password')} value={password} onChange={(e) => setPassword(e.target.value)} required />
              <button style={{ ...ui.primaryBtn, minHeight: 46, width: '100%' }} type="submit">{t(messages, 'login')}</button>
            </form>
          ) : (
            <form onSubmit={register} style={styles.formGrid}>
              <input style={ui.input} placeholder={t(messages, 'email')} value={email} onChange={(e) => setEmail(e.target.value)} required />
              <input style={ui.input} type="password" placeholder={t(messages, 'password')} value={password} onChange={(e) => setPassword(e.target.value)} required />
              <input style={ui.input} placeholder={t(messages, 'your_name')} value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
              <input style={ui.input} placeholder={t(messages, 'family_name')} value={familyName} onChange={(e) => setFamilyName(e.target.value)} required />
              <button style={{ ...ui.primaryBtn, minHeight: 46, width: '100%' }} type="submit">{t(messages, 'register')}</button>
            </form>
          )}
          <button style={{ ...ui.secondaryBtn, marginTop: 8, minHeight: 44, width: '100%' }} onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}>
            {authMode === 'login' ? t(messages, 'switch_to_register') : t(messages, 'switch_to_login')}
          </button>
          {msg && <p>{msg}</p>}
        </section>
      </main>
    );
  }

  return (
    <main style={{ ...styles.page, background: tokens.bg, color: tokens.text }}>
      <div style={{ ...styles.layout, gridTemplateColumns: isMobile ? '1fr' : '240px 1fr' }}>
        {!isMobile && (
          <aside style={{ ...styles.sidebar, background: tokens.sidebar, borderColor: tokens.border, color: tokens.text }}>
            <h2 style={{ marginTop: 0 }}>{t(messages, 'app_name')}</h2>
            <button style={navBtn(activeView === 'dashboard', tokens)} onClick={() => setActiveView('dashboard')}><LayoutDashboard size={16} /> {t(messages, 'dashboard')}</button>
            <button style={navBtn(activeView === 'calendar', tokens)} onClick={() => setActiveView('calendar')}><CalendarDays size={16} /> {t(messages, 'calendar')}</button>
            <button style={navBtn(activeView === 'contacts', tokens)} onClick={() => setActiveView('contacts')}><BookUser size={16} /> {t(messages, 'contacts')}</button>
            <button style={navBtn(activeView === 'tasks', tokens)} onClick={() => setActiveView('tasks')}><CheckSquare size={16} /> {t(messages, 'module.tasks.name')}</button>
            <button style={navBtn(activeView === 'settings', tokens)} onClick={() => setActiveView('settings')}><Settings size={16} /> {t(messages, 'settings')}</button>
            {isAdmin && <button style={navBtn(activeView === 'admin', tokens)} onClick={() => setActiveView('admin')}><Shield size={16} /> {t(messages, 'admin')}</button>}
            <div style={{ marginTop: 'auto' }}><button style={ui.secondaryBtn} onClick={logout}>{t(messages, 'logout')}</button></div>
          </aside>
        )}

        <section style={{ ...styles.content, paddingBottom: isMobile ? 86 : 0 }}>
          {isMobile && (
            <div style={{ ...ui.card, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <img src={profileImage || 'https://placehold.co/40x40?text=U'} alt="Profil" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover' }} />
                <div>
                  <strong>{t(messages, 'app_name')}</strong>
                  <div style={{ fontSize: 12, color: tokens.muted }}>{me?.display_name || ''}</div>
                </div>
              </div>
              <button style={ui.secondaryBtn} onClick={logout}>{t(messages, 'logout')}</button>
            </div>
          )}

          {activeView === 'dashboard' && (
            <div>
              <div style={ui.card}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <img src={profileImage || 'https://placehold.co/64x64?text=U'} alt="profile" style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover' }} />
                  <div>
                    <h2 style={{ margin: 0 }}>{t(messages, 'welcome')}{me?.display_name ? `, ${me.display_name}` : ''}</h2>
                    <p style={{ margin: '6px 0 0', color: '#6b7280' }}>{t(messages, 'important_first')}</p>
                  </div>
                </div>
              </div>

              <div style={{ ...styles.grid2, gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr' }}>
                <div style={ui.card}><h3>{t(messages, 'next_events')}</h3>{summary.next_events?.length ? summary.next_events.map(e => <p key={e.id}><strong>{e.title}</strong><br /><small>{prettyDate(e.starts_at)}</small></p>) : <p>{t(messages, 'no_upcoming_events')}</p>}</div>
                <div style={ui.card}><h3>{t(messages, 'upcoming_birthdays_4w')}</h3>{summary.upcoming_birthdays?.length ? summary.upcoming_birthdays.map((b, i) => <p key={i}><strong>{b.person_name}</strong><br /><small>{b.occurs_on} in {b.days_until} Tagen</small></p>) : <p>{t(messages, 'no_upcoming_birthdays')}</p>}</div>
              </div>
            </div>
          )}

          {activeView === 'calendar' && (
            <div style={ui.card}>
              <h2>{t(messages, 'calendar')}</h2>
              <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                <select
                  style={{ ...ui.input, maxWidth: 220 }}
                  value={familyId}
                  onChange={async (e) => {
                    const fid = e.target.value;
                    setFamilyId(fid);
                    const selected = families.find((f) => String(f.family_id) === String(fid));
                    if (selected) setMyFamilyRole(selected.role);
                    await Promise.all([loadDashboard(fid), loadEvents(fid), loadMembers(fid), loadContacts(fid), loadTasks(fid)]);
                  }}
                >
                  {families.map((f) => (
                    <option key={f.family_id} value={String(f.family_id)}>{f.family_name}</option>
                  ))}
                </select>
                <button style={ui.secondaryBtn} onClick={() => { loadEvents(); loadDashboard(); }}>{t(messages, 'reload')}</button>
              </div>

              <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                <button style={navBtn(calendarView === 'month', tokens)} onClick={() => setCalendarView('month')}>Monat</button>
                <button style={navBtn(calendarView === 'week', tokens)} onClick={() => setCalendarView('week')}>Woche</button>
                {calendarView === 'month' && (
                  <>
                    <button style={ui.secondaryBtn} onClick={() => { setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1)); setSelectedDate(null); }}>◀</button>
                    <span style={{ alignSelf: 'center', fontWeight: 600 }}>{monthLabel}</span>
                    <button style={ui.secondaryBtn} onClick={() => { setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1)); setSelectedDate(null); }}>▶</button>
                  </>
                )}
              </div>

              {calendarMsg && <p>{calendarMsg}</p>}

              {calendarView === 'month' ? (
                <div style={{ marginTop: 12 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6, marginBottom: 6, fontSize: 12, color: tokens.muted }}>
                    {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((d) => <div key={d}>{d}</div>)}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
                    {monthCells.map((c, idx) => {
                      const isSelected = !c.empty && selectedDate && selectedDate.getFullYear() === calendarMonth.getFullYear() && selectedDate.getMonth() === calendarMonth.getMonth() && selectedDate.getDate() === c.day;
                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            if (c.empty) return;
                            const picked = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), c.day);
                            setSelectedDate(picked);
                            if (!startsAt) {
                              const local = new Date(picked.getFullYear(), picked.getMonth(), picked.getDate(), 9, 0);
                              const offset = local.getTimezoneOffset();
                              const localIso = new Date(local.getTime() - offset * 60000).toISOString().slice(0, 16);
                              setStartsAt(localIso);
                            }
                          }}
                          style={{
                            ...ui.smallCard,
                            minHeight: isMobile ? 52 : 72,
                            padding: 8,
                            opacity: c.empty ? 0.35 : 1,
                            textAlign: 'left',
                            cursor: c.empty ? 'default' : 'pointer',
                            borderColor: isSelected ? tokens.primary : ui.smallCard.borderColor,
                          }}
                        >
                          {!c.empty && (
                            <>
                              <div style={{ fontWeight: 600 }}>{c.day}</div>
                              {c.count > 0 && <div style={{ fontSize: 12, color: tokens.muted }}>{c.count} Termine</div>}
                            </>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div style={{ display: 'grid', gap: 10 }}>
                  <div style={{ ...ui.smallCard, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong>KW {weekInfo.weekNumber}</strong>
                    <small style={{ color: tokens.muted }}>
                      {weekInfo.weekStart.toLocaleDateString('de-DE')} bis {new Date(weekInfo.weekEnd.getTime() - 1).toLocaleDateString('de-DE')}
                    </small>
                  </div>

                  {weekInfo.weekEvents.length === 0 && (
                    <div style={ui.smallCard}>Keine Termine in der aktuellen Woche</div>
                  )}

                  {weekInfo.weekEvents.map((e) => (
                    <div key={e.id} style={ui.smallCard}>
                      <strong>{e.title}</strong>
                      <small>{prettyDate(e.starts_at)}</small>
                    </div>
                  ))}
                </div>
              )}

              {calendarView === 'month' && selectedDate && (
                <div style={{ marginTop: 14, borderTop: `1px solid ${tokens.border}`, paddingTop: 12 }}>
                  <h3 style={{ margin: '0 0 8px' }}>
                    {selectedDate.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })}
                  </h3>

                  <div style={{ display: 'grid', gap: 8, marginBottom: 10 }}>
                    {selectedDayEvents.length === 0 && <small style={{ color: tokens.muted }}>Keine Termine an diesem Tag</small>}
                    {selectedDayEvents.map((ev) => (
                      <div key={ev.id} style={ui.smallCard}>
                        <strong>{ev.title}</strong>
                        <small>{prettyDate(ev.starts_at)}</small>
                      </div>
                    ))}
                  </div>

                  <form onSubmit={createEvent} style={styles.formGrid}>
                    <input style={ui.input} placeholder={t(messages, 'title')} value={title} onChange={(e) => setTitle(e.target.value)} required />
                    <textarea style={ui.input} placeholder={t(messages, 'description')} value={description} onChange={(e) => setDescription(e.target.value)} />
                    <input style={ui.input} type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} required />
                    <input style={ui.input} type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
                    <label><input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} /> Ganztägig</label>
                    <button style={ui.primaryBtn} type="submit">Termin für diesen Tag erstellen</button>
                  </form>
                </div>
              )}

              {calendarView === 'week' && (
                <div style={{ marginTop: 14, borderTop: `1px solid ${tokens.border}`, paddingTop: 12 }}>
                  <form onSubmit={addBirthday} style={{ ...styles.formGrid }}>
                    <h3 style={{ marginBottom: 0 }}>Geburtstag anlegen</h3>
                    <input style={ui.input} placeholder="Name" value={birthdayName} onChange={(e) => setBirthdayName(e.target.value)} required />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <input style={ui.input} type="number" min="1" max="12" placeholder="Monat" value={birthdayMonth} onChange={(e) => setBirthdayMonth(e.target.value)} required />
                      <input style={ui.input} type="number" min="1" max="31" placeholder="Tag" value={birthdayDay} onChange={(e) => setBirthdayDay(e.target.value)} required />
                    </div>
                    <button style={ui.secondaryBtn} type="submit">Geburtstag speichern</button>
                  </form>
                </div>
              )}
            </div>
          )}

          {activeView === 'contacts' && (
            <div style={ui.card}>
              <h2>{t(messages, 'contacts')}</h2>
              <form onSubmit={importContactsCsv} style={styles.formGrid}>
                <label style={{ color: tokens.muted, fontSize: 13 }}>{t(messages, 'contacts_csv_hint')}</label>
                <textarea style={{ ...ui.input, minHeight: 140 }} value={contactsCsv} onChange={(e) => setContactsCsv(e.target.value)} placeholder={t(messages, 'contacts_csv_hint')} />
                <button style={ui.primaryBtn} type="submit">{t(messages, 'contacts_import')}</button>
              </form>

              <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
                {contacts.map((c) => (
                  <div key={c.id} style={ui.smallCard}>
                    <strong>{c.full_name}</strong>
                    <small>{c.email || c.phone || '-'}</small>
                    {(c.birthday_month && c.birthday_day) && <small>🎂 {c.birthday_day}.{c.birthday_month}.</small>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeView === 'tasks' && (
            <div style={ui.card}>
              <h2>{t(messages, 'module.tasks.name')}</h2>
              <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                <select
                  style={{ ...ui.input, maxWidth: 220 }}
                  value={familyId}
                  onChange={async (e) => {
                    const fid = e.target.value;
                    setFamilyId(fid);
                    const selected = families.find((f) => String(f.family_id) === String(fid));
                    if (selected) setMyFamilyRole(selected.role);
                    await Promise.all([loadDashboard(fid), loadEvents(fid), loadMembers(fid), loadContacts(fid), loadTasks(fid)]);
                  }}
                >
                  {families.map((f) => (
                    <option key={f.family_id} value={String(f.family_id)}>{f.family_name}</option>
                  ))}
                </select>
                <button style={navBtn(taskFilter === 'all', tokens)} onClick={() => setTaskFilter('all')}>{t(messages, 'module.tasks.all')}</button>
                <button style={navBtn(taskFilter === 'open', tokens)} onClick={() => setTaskFilter('open')}>{t(messages, 'module.tasks.open')}</button>
                <button style={navBtn(taskFilter === 'done', tokens)} onClick={() => setTaskFilter('done')}>{t(messages, 'module.tasks.done')}</button>
              </div>

              {taskMsg && <p>{taskMsg}</p>}

              <form onSubmit={createTask} style={{ ...styles.formGrid, marginBottom: 14 }}>
                <input style={ui.input} placeholder={t(messages, 'module.tasks.title')} value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} required />
                <textarea style={ui.input} placeholder={t(messages, 'module.tasks.description')} value={taskDesc} onChange={(e) => setTaskDesc(e.target.value)} />
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: 8 }}>
                  <input style={ui.input} type="datetime-local" value={taskDueDate} onChange={(e) => setTaskDueDate(e.target.value)} />
                  <select style={ui.input} value={taskPriority} onChange={(e) => setTaskPriority(e.target.value)}>
                    <option value="low">{t(messages, 'module.tasks.priority.low')}</option>
                    <option value="normal">{t(messages, 'module.tasks.priority.normal')}</option>
                    <option value="high">{t(messages, 'module.tasks.priority.high')}</option>
                  </select>
                  <select style={ui.input} value={taskRecurrence} onChange={(e) => setTaskRecurrence(e.target.value)}>
                    <option value="">{t(messages, 'module.tasks.recurrence.none')}</option>
                    <option value="daily">{t(messages, 'module.tasks.recurrence.daily')}</option>
                    <option value="weekly">{t(messages, 'module.tasks.recurrence.weekly')}</option>
                    <option value="monthly">{t(messages, 'module.tasks.recurrence.monthly')}</option>
                    <option value="yearly">{t(messages, 'module.tasks.recurrence.yearly')}</option>
                  </select>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8 }}>
                  <select style={ui.input} value={taskAssignee} onChange={(e) => setTaskAssignee(e.target.value)}>
                    <option value="">{t(messages, 'module.tasks.unassigned')}</option>
                    {members.map((m) => (
                      <option key={m.user_id} value={String(m.user_id)}>{m.display_name}</option>
                    ))}
                  </select>
                  <button style={ui.primaryBtn} type="submit">{t(messages, 'module.tasks.add')}</button>
                </div>
              </form>

              <div style={{ display: 'grid', gap: 8 }}>
                {tasks
                  .filter((tk) => taskFilter === 'all' || tk.status === taskFilter)
                  .length === 0 && <p style={{ color: tokens.muted }}>{t(messages, 'module.tasks.no_tasks')}</p>}
                {tasks
                  .filter((tk) => taskFilter === 'all' || tk.status === taskFilter)
                  .map((tk) => {
                    const isOverdue = tk.due_date && tk.status === 'open' && new Date(tk.due_date) < new Date();
                    const assignee = members.find((m) => m.user_id === tk.assigned_to_user_id);
                    return (
                      <div key={tk.id} style={{ ...ui.smallCard, opacity: tk.status === 'done' ? 0.6 : 1, display: 'grid', gridTemplateColumns: 'auto 1fr auto', alignItems: 'center', gap: 10 }}>
                        <input
                          type="checkbox"
                          checked={tk.status === 'done'}
                          onChange={() => toggleTask(tk.id, tk.status)}
                          style={{ width: 20, height: 20, cursor: 'pointer' }}
                        />
                        <div>
                          <strong style={{ textDecoration: tk.status === 'done' ? 'line-through' : 'none' }}>{tk.title}</strong>
                          {tk.description && <div style={{ fontSize: 13, color: tokens.muted }}>{tk.description}</div>}
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                            {tk.due_date && (
                              <span style={{
                                fontSize: 11, padding: '2px 6px', borderRadius: 6,
                                background: isOverdue ? '#fecaca' : tokens.surface,
                                color: isOverdue ? '#991b1b' : tokens.muted,
                                border: `1px solid ${isOverdue ? '#f87171' : tokens.border}`,
                              }}>
                                {isOverdue && `${t(messages, 'module.tasks.overdue')} `}{prettyDate(tk.due_date)}
                              </span>
                            )}
                            <span style={{
                              fontSize: 11, padding: '2px 6px', borderRadius: 6,
                              background: tk.priority === 'high' ? '#fef3c7' : tk.priority === 'low' ? '#e0f2fe' : tokens.surface,
                              color: tk.priority === 'high' ? '#92400e' : tk.priority === 'low' ? '#075985' : tokens.muted,
                              border: `1px solid ${tokens.border}`,
                            }}>
                              {t(messages, `module.tasks.priority.${tk.priority}`)}
                            </span>
                            {tk.recurrence && (
                              <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 6, background: tokens.surface, color: tokens.muted, border: `1px solid ${tokens.border}` }}>
                                {t(messages, `module.tasks.recurrence.${tk.recurrence}`)}
                              </span>
                            )}
                            {assignee && (
                              <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 6, background: tokens.surface, color: tokens.muted, border: `1px solid ${tokens.border}` }}>
                                {assignee.display_name}
                              </span>
                            )}
                          </div>
                        </div>
                        <button
                          style={{ ...ui.secondaryBtn, padding: '6px 10px', fontSize: 13, color: '#ef4444' }}
                          onClick={() => deleteTask(tk.id)}
                        >
                          &times;
                        </button>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {activeView === 'settings' && (
            <div style={ui.card}>
              <h2>{t(messages, 'settings')}</h2>
              <label style={{ display: 'block', marginBottom: 8 }}>{t(messages, 'theme')}</label>
              <div style={{ display: 'grid', gap: 8 }}>
                <select style={ui.input} value={theme} onChange={(e) => setTheme(e.target.value)}>
                  {availableThemes.map((th) => (
                    <option key={th.id} value={th.key}>{th.name}</option>
                  ))}
                </select>
                <button style={{ ...ui.secondaryBtn, display: 'inline-flex', alignItems: 'center', gap: 8 }} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
                  {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
                  {theme === 'dark' ? t(messages, 'switch_to_light') : t(messages, 'switch_to_dark')}
                </button>
              </div>
              <div style={{ marginTop: 14 }}>
                <label style={{ display: 'block', marginBottom: 8 }}>{t(messages, 'language')}</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button style={ui.secondaryBtn} onClick={() => setLang('de')}><Languages size={16} /> DE</button>
                  <button style={ui.secondaryBtn} onClick={() => setLang('en')}><Languages size={16} /> EN</button>
                </div>
              </div>
              <div style={{ marginTop: 14 }}>
                <label>{t(messages, 'profile_image')}</label>
                <input type="file" accept="image/*" onChange={onProfileImage} />
              </div>
            </div>
          )}

          {activeView === 'admin' && isAdmin && (
            <div style={ui.card}>
              <h2>Admin: Mitglieder</h2>
              {members.map((m) => (
                <div key={m.user_id} style={{ ...ui.smallCard, marginBottom: 8 }}>
                  <strong>{m.display_name}</strong> <small>({m.email})</small><br />
                  <small>Rolle: {m.role} | {m.is_adult ? 'Erwachsen' : 'Kind'}</small>
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <button style={ui.secondaryBtn} onClick={() => setAdult(m.user_id, !m.is_adult)}>{m.is_adult ? 'Als Kind markieren' : 'Als Erwachsen markieren'}</button>
                    <button style={ui.secondaryBtn} onClick={() => setRole(m.user_id, 'admin')}>Zu Admin machen</button>
                    <button style={ui.secondaryBtn} onClick={() => setRole(m.user_id, 'member')}>Zu Member machen</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {isMobile && (
        <nav style={{
          position: 'fixed',
          left: 10,
          right: 10,
          bottom: 10,
          display: 'grid',
          gridTemplateColumns: isAdmin ? 'repeat(6, 1fr)' : 'repeat(5, 1fr)',
          gap: 8,
          background: tokens.surface,
          border: `1px solid ${tokens.border}`,
          borderRadius: 14,
          padding: 8,
          zIndex: 50,
        }}>
          <button style={navBtn(activeView === 'dashboard', tokens)} onClick={() => setActiveView('dashboard')}><LayoutDashboard size={16} /></button>
          <button style={navBtn(activeView === 'calendar', tokens)} onClick={() => setActiveView('calendar')}><CalendarDays size={16} /></button>
          <button style={navBtn(activeView === 'contacts', tokens)} onClick={() => setActiveView('contacts')}><BookUser size={16} /></button>
          <button style={navBtn(activeView === 'tasks', tokens)} onClick={() => setActiveView('tasks')}><CheckSquare size={16} /></button>
          <button style={navBtn(activeView === 'settings', tokens)} onClick={() => setActiveView('settings')}><Settings size={16} /></button>
          {isAdmin && <button style={navBtn(activeView === 'admin', tokens)} onClick={() => setActiveView('admin')}><Shield size={16} /></button>}
        </nav>
      )}
    </main>
  );
}

const styles = {
  page: { minHeight: '100vh', padding: 12 },
  hero: { background: 'linear-gradient(135deg, #111827 0%, #4c1d95 100%)', color: '#fff', padding: 20, borderRadius: 14, maxWidth: 900, margin: '0 auto' },
  cardNarrow: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: 14, maxWidth: 420, width: '100%', boxSizing: 'border-box', margin: '12px auto' },
  layout: { display: 'grid', gridTemplateColumns: '240px 1fr', gap: 16, maxWidth: 1280, margin: '0 auto' },
  sidebar: { border: '1px solid #e5e7eb', borderRadius: 14, padding: 14, minHeight: '80vh', display: 'flex', flexDirection: 'column', gap: 8 },
  content: { display: 'grid', gap: 12 },
  card: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: 16, color: '#111827' },
  smallCard: { border: '1px solid #e5e7eb', borderRadius: 10, padding: 10, display: 'grid', gap: 4 },
  input: { border: '1px solid #d1d5db', borderRadius: 10, padding: '10px 12px', fontSize: 16, minHeight: 44, width: '100%', maxWidth: '100%', boxSizing: 'border-box' },
  formGrid: { display: 'grid', gap: 8 },
  primaryBtn: { border: 'none', borderRadius: 10, padding: '10px 14px', background: '#4f46e5', color: '#fff', cursor: 'pointer', boxSizing: 'border-box' },
  secondaryBtn: { border: '1px solid #d1d5db', borderRadius: 10, padding: '9px 12px', background: '#fff', cursor: 'pointer', boxSizing: 'border-box' },
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 },
};

function navBtn(active, tokens) {
  return {
    border: active ? `1px solid ${tokens.primary}` : `1px solid ${tokens.border}`,
    background: active ? tokens.sidebarActive : tokens.sidebar,
    color: tokens.text,
    borderRadius: 10,
    padding: '10px 12px',
    cursor: 'pointer',
    textAlign: 'left',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
  };
}
