import { useState, useEffect, useCallback } from 'react';
import { User, Palette, Globe, ShieldCheck, Bell, Database, Key, Plus, Trash2, Copy, Check, X, Download, Upload, ChevronDown, ChevronUp, Navigation, CalendarDays, CheckSquare, LayoutDashboard, Settings, Shield, BookUser, ShoppingCart } from 'lucide-react';
import { useApp, DEFAULT_NAV_ORDER } from '../contexts/AppContext';
import { downloadBlob } from '../lib/helpers';
import { t, languageCompleteness } from '../lib/i18n';
import * as api from '../lib/api';

const THEME_DESCS = {
  en: { light: 'Warm and inviting', dark: 'Subtle and dark', 'midnight-glass': 'Glassmorphism, deep violet' },
  de: { light: 'Warm und einladend', dark: 'Dezent und dunkel', 'midnight-glass': 'Glassmorphism, tiefes Violett' },
};
const THEME_PREVIEWS = {
  light: { bg: '#f8f6f3', surface: '#ffffff', accent: '#7c3aed' },
  dark: { bg: '#0f172a', surface: '#1e293b', accent: '#7c3aed' },
  'midnight-glass': { bg: '#06080f', surface: '#111628', accent: '#7c3aed' },
};

const SCOPE_MODULES = [
  { key: 'calendar', label: 'Calendar' },
  { key: 'tasks', label: 'Tasks' },
  { key: 'contacts', label: 'Contacts' },
  { key: 'birthdays', label: 'Birthdays' },
  { key: 'families', label: 'Families' },
  { key: 'profile', label: 'Profile' },
];

const NAV_ITEM_META = {
  dashboard: { icon: LayoutDashboard, labelKey: 'dashboard' },
  calendar: { icon: CalendarDays, labelKey: 'calendar' },
  shopping: { icon: ShoppingCart, labelKey: 'module.shopping.name' },
  tasks: { icon: CheckSquare, labelKey: 'module.tasks.name' },
  contacts: { icon: BookUser, labelKey: 'contacts' },
  notifications: { icon: Bell, labelKey: 'notifications' },
  settings: { icon: Settings, labelKey: 'settings' },
  admin: { icon: Shield, labelKey: 'admin' },
};

export default function SettingsView() {
  const { theme, setTheme, lang, setLang, availableThemes, availableLanguages, messages, me, isAdmin, isChild, loggedIn, demoMode, profileImage, setProfileImage, familyId, loadContacts, loadDashboard, navOrder, setNavOrder, loadNavOrder } = useApp();

  // Profile image feedback state
  const [imageSaved, setImageSaved] = useState(false);

  // Notification preferences state
  const [notifPrefs, setNotifPrefs] = useState({ reminders_enabled: true, reminder_minutes: 30, quiet_start: '', quiet_end: '' });
  const [notifSaved, setNotifSaved] = useState(false);

  const initials = (me?.display_name || 'U').charAt(0).toUpperCase();

  // Token state
  const [tokens, setTokens] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newScopes, setNewScopes] = useState(['*']);
  const [newExpiry, setNewExpiry] = useState('');
  const [createdToken, setCreatedToken] = useState(null);
  const [copied, setCopied] = useState(false);

  // Nav order state
  const [localNavOrder, setLocalNavOrder] = useState(navOrder);
  const [navSaved, setNavSaved] = useState(false);

  useEffect(() => { setLocalNavOrder(navOrder); }, [navOrder]);

  function moveNavItem(index, direction) {
    const newOrder = [...localNavOrder];
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= newOrder.length) return;
    [newOrder[index], newOrder[targetIndex]] = [newOrder[targetIndex], newOrder[index]];
    setLocalNavOrder(newOrder);
  }

  async function handleSaveNavOrder() {
    if (demoMode) {
      setNavOrder(localNavOrder);
    } else {
      const res = await api.apiUpdateNavOrder(localNavOrder);
      if (!res.ok) return;
      setNavOrder(localNavOrder);
    }
    setNavSaved(true);
    setTimeout(() => setNavSaved(false), 2000);
  }

  function handleResetNavOrder() {
    setLocalNavOrder(DEFAULT_NAV_ORDER);
    if (demoMode) {
      setNavOrder(DEFAULT_NAV_ORDER);
    }
  }

  // Data management state
  const [showCalImport, setShowCalImport] = useState(false);
  const [icsText, setIcsText] = useState('');
  const [calMsg, setCalMsg] = useState('');
  const [calErrors, setCalErrors] = useState([]);
  const [showContactsImport, setShowContactsImport] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [contactsMsg, setContactsMsg] = useState('');
  const [rowErrors, setRowErrors] = useState([]);

  const loadTokens = useCallback(async () => {
    if (!loggedIn || demoMode) return;
    const res = await api.apiGetTokens();
    if (res.ok) setTokens(res.data);
  }, [loggedIn, demoMode]);

  useEffect(() => { loadTokens(); }, [loadTokens]);

  const loadNotifPrefs = useCallback(async () => {
    if (!loggedIn || demoMode) return;
    const res = await api.apiGetNotificationPreferences();
    if (res.ok) setNotifPrefs({
      reminders_enabled: res.data.reminders_enabled,
      reminder_minutes: res.data.reminder_minutes,
      quiet_start: res.data.quiet_start || '',
      quiet_end: res.data.quiet_end || '',
    });
  }, [loggedIn, demoMode]);

  useEffect(() => { loadNotifPrefs(); }, [loadNotifPrefs]);

  async function handleSaveNotifPrefs() {
    const payload = {
      ...notifPrefs,
      quiet_start: notifPrefs.quiet_start || null,
      quiet_end: notifPrefs.quiet_end || null,
    };
    const res = await api.apiUpdateNotificationPreferences(payload);
    if (res.ok) {
      setNotifSaved(true);
      setTimeout(() => setNotifSaved(false), 2000);
    }
  }

  function onProfileImage(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const value = String(reader.result || '');
      setProfileImage(value);
      if (loggedIn) {
        await api.apiUpdateProfileImage(value);
      }
      setImageSaved(true);
      setTimeout(() => setImageSaved(false), 2000);
    };
    reader.readAsDataURL(file);
  }

  function toggleFullAccess(checked) {
    setNewScopes(checked ? ['*'] : []);
  }

  function toggleModuleScope(mod, action, checked) {
    const scope = `${mod}:${action}`;
    setNewScopes(prev => {
      const filtered = prev.filter(s => s !== '*');
      if (checked) return [...filtered, scope];
      return filtered.filter(s => s !== scope);
    });
  }

  async function handleCreateToken(e) {
    e.preventDefault();
    const payload = {
      name: newName.trim(),
      scopes: newScopes.length ? newScopes : ['*'],
    };
    if (newExpiry) payload.expires_at = new Date(newExpiry).toISOString();

    const res = await api.apiCreateToken(payload);
    if (res.ok) {
      setCreatedToken(res.data.token);
      setShowCreate(false);
      setNewName('');
      setNewScopes(['*']);
      setNewExpiry('');
      loadTokens();
    }
  }

  async function handleRevoke(tokenId) {
    if (!confirm(t(messages, 'token_revoke_confirm'))) return;
    const res = await api.apiRevokeToken(tokenId);
    if (res.ok) {
      setTokens(prev => prev.filter(tk => tk.id !== tokenId));
    }
  }

  function handleCopy() {
    if (!createdToken) return;
    navigator.clipboard.writeText(createdToken);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function formatDate(iso) {
    if (!iso) return null;
    return new Date(iso).toLocaleDateString(lang === 'de' ? 'de-DE' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function formatScopes(scopeStr) {
    if (!scopeStr || scopeStr === '*') return t(messages, 'token_full_access');
    return scopeStr.split(',').join(', ');
  }

  // Data management handlers
  async function handleExportIcs() {
    try {
      const res = await api.apiExportCalendarIcs(familyId);
      if (!res.ok) return setCalMsg(t(messages, 'module.calendar.export_error') || 'Export failed');
      const blob = await res.blob();
      downloadBlob(blob, 'tribu-calendar.ics');
    } catch {
      setCalMsg(t(messages, 'module.calendar.export_error') || 'Export failed');
    }
  }

  async function handleImportIcs(e) {
    e.preventDefault();
    setCalMsg('');
    setCalErrors([]);
    const { ok, data } = await api.apiImportCalendarIcs(Number(familyId), icsText);
    if (!ok) return setCalMsg(t(messages, 'module.calendar.import_error') || 'Import failed');
    setCalMsg(t(messages, 'module.calendar.import_success').replace('{count}', data.created));
    if (data.errors?.length) setCalErrors(data.errors);
    setIcsText('');
  }

  function handleIcsFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setIcsText(ev.target.result);
    reader.readAsText(file);
  }

  async function handleExportCsv() {
    try {
      const res = await api.apiExportContactsCsv(familyId);
      if (!res.ok) return setContactsMsg(t(messages, 'module.contacts.export_error') || 'Export failed');
      const blob = await res.blob();
      downloadBlob(blob, 'tribu-contacts.csv');
    } catch {
      setContactsMsg(t(messages, 'module.contacts.export_error') || 'Export failed');
    }
  }

  async function handleImportCsv(e) {
    e.preventDefault();
    setRowErrors([]);
    setContactsMsg('');
    const { ok, data } = await api.apiImportContactsCsv(Number(familyId), csvText);
    if (!ok) return setContactsMsg(t(messages, 'module.contacts.import_error') || 'Import failed');
    setCsvText('');
    await Promise.all([loadContacts(), loadDashboard()]);
    setContactsMsg(`${t(messages, 'module.contacts.import_success')} ${data.created}`);
    if (data.row_errors?.length) setRowErrors(data.row_errors);
  }

  const isFullAccess = newScopes.includes('*');

  return (
    <div>
      <div className="view-header">
        <div>
          <h1 className="view-title">{t(messages, 'settings')}</h1>
          <div className="view-subtitle">{t(messages, 'settings_subtitle')}</div>
        </div>
      </div>

      <div className="settings-grid stagger">
        {/* Profile Section */}
        <div className="settings-section glass">
          <div className="settings-section-title"><User size={16} /> {t(messages, 'profile')}</div>
          <div className="profile-row">
            {profileImage ? (
              <img src={profileImage} alt="" className="profile-avatar" style={{ objectFit: 'cover' }} />
            ) : (
              <div className="profile-avatar">{initials}</div>
            )}
            <div className="profile-info">
              <div className="profile-name">{me?.display_name || 'User'}</div>
              <div className="profile-email">{me?.email || ''}</div>
              <div className="profile-role">{isAdmin ? 'Admin' : isChild ? t(messages, 'child') : t(messages, 'member')}</div>
            </div>
          </div>
          <div style={{ marginTop: 'var(--space-md)' }}>
            <label style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', display: 'block', marginBottom: 'var(--space-sm)' }}>
              {t(messages, 'profile_image')}
            </label>
            <input type="file" accept="image/*" onChange={onProfileImage} style={{ fontSize: '0.88rem' }} />
            {imageSaved && (
              <span style={{ marginLeft: 'var(--space-sm)', fontSize: '0.82rem', color: 'var(--success)' }}>
                <Check size={14} style={{ verticalAlign: 'middle' }} /> Saved!
              </span>
            )}
          </div>
        </div>

        {/* Theme Section */}
        <div className="settings-section glass">
          <div className="settings-section-title"><Palette size={16} /> {t(messages, 'theme')}</div>
          <div className="theme-grid">
            {availableThemes.map((th) => {
              const preview = THEME_PREVIEWS[th.key] || {};
              const isActive = theme === th.key;
              return (
                <div
                  key={th.key}
                  className={`theme-item${isActive ? ' active' : ' theme-item-inactive'}`}
                  onClick={() => setTheme(th.key)}
                >
                  <div
                    className="theme-preview"
                    style={{
                      background: `linear-gradient(135deg, ${preview.bg || '#111'} 50%, ${preview.surface || '#222'} 50%)`,
                      boxShadow: isActive ? `0 0 0 2px ${preview.accent || 'var(--amethyst)'}` : undefined,
                    }}
                  />
                  <div className="theme-item-info">
                    <div className="theme-item-name">{th.name}</div>
                    <div className="theme-item-desc">{(THEME_DESCS[lang] || THEME_DESCS.en)[th.key] || ''}</div>
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: 'var(--space-md)' }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 'var(--space-sm)' }}>
              {t(messages, 'installed_themes')}
            </div>
            <div className="pack-list">
              {availableThemes.map((th) => (
                <div key={th.key} className="pack-card glass-sm">
                  <div className="pack-card-header">
                    <span className="pack-card-name">{th.name}</span>
                    {theme === th.key && <span className="pack-badge">{t(messages, 'pack_active')}</span>}
                  </div>
                  <div className="pack-meta">
                    <span>{t(messages, 'pack_version')} {th.version}</span>
                    <span>{t(messages, 'pack_author')}: {th.author}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Language Section */}
        <div className="settings-section glass">
          <div className="settings-section-title"><Globe size={16} /> {t(messages, 'language')}</div>
          <div className="lang-toggle">
            <button className={`lang-btn${lang === 'de' ? ' active' : ''}`} onClick={() => setLang('de')}>Deutsch</button>
            <button className={`lang-btn${lang === 'en' ? ' active' : ''}`} onClick={() => setLang('en')}>English</button>
          </div>
          <div style={{ marginTop: 'var(--space-md)' }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 'var(--space-sm)' }}>
              {t(messages, 'installed_languages')}
            </div>
            <div className="pack-list">
              {availableLanguages.map((l) => {
                const comp = languageCompleteness(l.key);
                return (
                  <div key={l.key} className="pack-card glass-sm">
                    <div className="pack-card-header">
                      <span className="pack-card-name">{l.nativeName}</span>
                      {lang === l.key && <span className="pack-badge">{t(messages, 'pack_active')}</span>}
                    </div>
                    <div className="pack-meta">
                      <span>{t(messages, 'pack_version')} {l.version}</span>
                      <span>{t(messages, 'pack_author')}: {l.author}</span>
                    </div>
                    <div className="pack-progress-row">
                      <span className="pack-progress-label">{t(messages, 'pack_completeness')}</span>
                      <div className="pack-progress">
                        <div className="pack-progress-fill" style={{ width: `${comp.percent}%` }} />
                      </div>
                      <span className="pack-progress-value">{comp.percent}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Navigation Order Section */}
        <div className="settings-section glass">
          <div className="settings-section-title"><Navigation size={16} /> {t(messages, 'nav_order_title')}</div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: 1.5, marginBottom: 'var(--space-md)' }}>
            {t(messages, 'nav_order_desc')}
          </p>
          <div style={{ display: 'grid', gap: '2px' }}>
            {localNavOrder.map((key, i) => {
              const meta = NAV_ITEM_META[key];
              if (!meta) return null;
              if (key === 'admin' && !isAdmin) return null;
              const Icon = meta.icon;
              const isVisible = localNavOrder.length > 5 ? i < 4 : i < 5;
              return (
                <div
                  key={key}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-sm)',
                    borderLeft: `3px solid ${isVisible ? 'var(--amethyst)' : 'transparent'}`,
                    background: isVisible ? 'rgba(124, 58, 237, 0.04)' : 'transparent',
                    transition: 'all 0.15s',
                  }}
                >
                  <Icon size={18} style={{ color: 'var(--text-muted)', flexShrink: 0 }} aria-hidden="true" />
                  <span style={{ flex: 1, fontSize: '0.9rem', fontWeight: 500 }}>{t(messages, meta.labelKey)}</span>
                  <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontFamily: "'JetBrains Mono', monospace", flexShrink: 0 }}>
                    {isVisible ? t(messages, 'nav_visible') : t(messages, 'nav_overflow')}
                  </span>
                  <button
                    className="btn-ghost"
                    style={{ padding: '4px 6px', minHeight: 32, border: 'none', background: 'none' }}
                    onClick={() => moveNavItem(i, -1)}
                    disabled={i === 0}
                    aria-label={`Move ${t(messages, meta.labelKey)} up`}
                  >
                    <ChevronUp size={16} />
                  </button>
                  <button
                    className="btn-ghost"
                    style={{ padding: '4px 6px', minHeight: 32, border: 'none', background: 'none' }}
                    onClick={() => moveNavItem(i, 1)}
                    disabled={i === localNavOrder.length - 1}
                    aria-label={`Move ${t(messages, meta.labelKey)} down`}
                  >
                    <ChevronDown size={16} />
                  </button>
                </div>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-sm)', marginTop: 'var(--space-md)' }}>
            <button className="btn-sm" onClick={handleSaveNavOrder}>
              {navSaved ? <><Check size={14} /> {t(messages, 'nav_saved')}</> : t(messages, 'nav_save')}
            </button>
            <button className="btn-ghost" onClick={handleResetNavOrder}>
              {t(messages, 'nav_reset')}
            </button>
          </div>
        </div>

        {/* Notification Settings */}
        {!demoMode && (
          <div className="settings-section glass">
            <div className="settings-section-title"><Bell size={16} /> {t(messages, 'notification_settings')}</div>
            <div style={{ display: 'grid', gap: 'var(--space-md)' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.88rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={notifPrefs.reminders_enabled}
                  onChange={(e) => setNotifPrefs((p) => ({ ...p, reminders_enabled: e.target.checked }))}
                />
                {t(messages, 'notification_reminders_enabled')}
              </label>

              <div className="form-field">
                <label style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{t(messages, 'notification_reminder_minutes')}</label>
                <select
                  className="form-input"
                  value={notifPrefs.reminder_minutes}
                  onChange={(e) => setNotifPrefs((p) => ({ ...p, reminder_minutes: Number(e.target.value) }))}
                  style={{ maxWidth: 200 }}
                >
                  <option value={15}>{t(messages, 'notification_minutes_15')}</option>
                  <option value={30}>{t(messages, 'notification_minutes_30')}</option>
                  <option value={60}>{t(messages, 'notification_minutes_60')}</option>
                </select>
              </div>

              <div className="form-field">
                <label style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{t(messages, 'notification_quiet_hours')}</label>
                <div style={{ display: 'flex', gap: 'var(--space-sm)', alignItems: 'center' }}>
                  <input
                    type="time"
                    className="form-input"
                    value={notifPrefs.quiet_start}
                    onChange={(e) => setNotifPrefs((p) => ({ ...p, quiet_start: e.target.value }))}
                    style={{ maxWidth: 140 }}
                    placeholder={t(messages, 'notification_quiet_start')}
                  />
                  <span style={{ color: 'var(--text-muted)' }}>&ndash;</span>
                  <input
                    type="time"
                    className="form-input"
                    value={notifPrefs.quiet_end}
                    onChange={(e) => setNotifPrefs((p) => ({ ...p, quiet_end: e.target.value }))}
                    style={{ maxWidth: 140 }}
                    placeholder={t(messages, 'notification_quiet_end')}
                  />
                </div>
              </div>

              <button className="btn-sm" onClick={handleSaveNotifPrefs} style={{ justifySelf: 'start' }}>
                {notifSaved ? <><Check size={14} /> {t(messages, 'notification_saved')}</> : t(messages, 'notification_save')}
              </button>
            </div>
          </div>
        )}

        {/* Data Management Section */}
        {!demoMode && !isChild && (
          <div className="settings-section glass">
            <div className="settings-section-title"><Database size={16} /> {t(messages, 'data_management')}</div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: 1.5, marginBottom: 'var(--space-md)' }}>
              {t(messages, 'data_management_desc')}
            </p>

            {/* Calendar (ICS) */}
            <div style={{ marginBottom: 'var(--space-lg)' }}>
              <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 'var(--space-sm)' }}>
                {t(messages, 'calendar')} (ICS)
              </div>
              <div style={{ display: 'flex', gap: 'var(--space-sm)', marginBottom: 'var(--space-sm)' }}>
                <button className="btn-ghost" onClick={handleExportIcs}>
                  <Download size={15} /> {t(messages, 'module.calendar.export')}
                </button>
                <button className="btn-ghost" onClick={() => setShowCalImport(!showCalImport)}>
                  {showCalImport ? <ChevronUp size={15} /> : <Upload size={15} />}
                  {showCalImport ? t(messages, 'module.calendar.close_import') : t(messages, 'module.calendar.import')}
                </button>
              </div>
              {showCalImport && (
                <div className="glass-sm" style={{ padding: 'var(--space-md)' }}>
                  {calMsg && (
                    <p style={{ marginBottom: 'var(--space-sm)', fontSize: '0.88rem', color: calErrors.length === 0 && calMsg.includes(t(messages, 'module.calendar.import_success').split('{')[0]) ? 'var(--success)' : 'var(--danger)' }}>
                      {calMsg}
                    </p>
                  )}
                  {calErrors.length > 0 && (
                    <div style={{ marginBottom: 'var(--space-sm)', fontSize: '0.82rem', color: 'var(--warning, #f6ad55)' }}>
                      <strong>{t(messages, 'module.calendar.import_warnings')}:</strong>
                      <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
                        {calErrors.map((err, i) => (
                          <li key={i}>#{err.index} {err.summary ? `"${err.summary}"` : ''}: {err.error}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <form onSubmit={handleImportIcs} className="quick-add-form">
                    <label style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>{t(messages, 'module.calendar.import_hint')}</label>
                    <input type="file" accept=".ics" onChange={handleIcsFile} className="form-input" style={{ padding: '10px 12px' }} />
                    <textarea
                      className="form-input"
                      style={{ minHeight: 100 }}
                      value={icsText}
                      onChange={(e) => setIcsText(e.target.value)}
                      placeholder={t(messages, 'module.calendar.import_placeholder')}
                    />
                    <button className="btn-primary" type="submit" disabled={!icsText.trim()}>
                      {t(messages, 'module.calendar.import_submit')}
                    </button>
                  </form>
                </div>
              )}
            </div>

            {/* Contacts (CSV) */}
            <div>
              <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 'var(--space-sm)' }}>
                {t(messages, 'contacts')} (CSV)
              </div>
              <div style={{ display: 'flex', gap: 'var(--space-sm)', marginBottom: 'var(--space-sm)' }}>
                <button className="btn-ghost" onClick={handleExportCsv}>
                  <Download size={15} /> {t(messages, 'module.contacts.export')}
                </button>
                <button className="btn-ghost" onClick={() => setShowContactsImport(!showContactsImport)}>
                  {showContactsImport ? <ChevronUp size={15} /> : <Upload size={15} />}
                  {showContactsImport ? t(messages, 'module.contacts.close') : t(messages, 'module.contacts.import')}
                </button>
              </div>
              {showContactsImport && (
                <div className="glass-sm" style={{ padding: 'var(--space-md)' }}>
                  {contactsMsg && (
                    <p style={{ marginBottom: 'var(--space-sm)', fontSize: '0.88rem', color: contactsMsg.includes(t(messages, 'module.contacts.import_success')) ? 'var(--success)' : 'var(--danger)' }}>
                      {contactsMsg}
                    </p>
                  )}
                  {rowErrors.length > 0 && (
                    <div style={{ marginBottom: 'var(--space-sm)', fontSize: '0.82rem', color: 'var(--warning, #f6ad55)' }}>
                      <strong>{t(messages, 'module.contacts.import_warnings')}:</strong>
                      <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
                        {rowErrors.map((re, i) => (
                          <li key={i}>{t(messages, 'module.contacts.row')} {re.row} ({re.name}): {re.errors.join(', ')}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <form onSubmit={handleImportCsv} className="quick-add-form">
                    <label style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>{t(messages, 'contacts_csv_hint')}</label>
                    <textarea
                      className="form-input"
                      style={{ minHeight: 120 }}
                      value={csvText}
                      onChange={(e) => setCsvText(e.target.value)}
                      placeholder={t(messages, 'contacts_csv_hint')}
                    />
                    <button className="btn-primary" type="submit" disabled={!csvText.trim()}>
                      {t(messages, 'contacts_import')}
                    </button>
                  </form>
                </div>
              )}
            </div>
          </div>
        )}

        {/* API Tokens Section */}
        {!demoMode && !isChild && (
          <div className="settings-section glass">
            <div className="settings-section-title"><Key size={16} /> {t(messages, 'api_tokens')}</div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: 1.5, marginBottom: 'var(--space-md)' }}>
              {t(messages, 'api_tokens_desc')}
            </p>

            {/* Token Created Banner */}
            {createdToken && (
              <div style={{
                background: 'rgba(16, 185, 129, 0.1)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                borderRadius: 'var(--radius-sm)',
                padding: 'var(--space-md)',
                marginBottom: 'var(--space-md)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: 'var(--space-sm)' }}>
                  <Check size={16} style={{ color: 'var(--success)' }} />
                  <span style={{ fontWeight: 600, fontSize: '0.88rem' }}>{t(messages, 'token_created')}</span>
                </div>
                <p style={{ color: 'var(--warning)', fontSize: '0.82rem', marginBottom: 'var(--space-sm)' }}>
                  {t(messages, 'token_created_warning')}
                </p>
                <div style={{ display: 'flex', gap: 'var(--space-sm)', alignItems: 'center' }}>
                  <code className="token-display">{createdToken}</code>
                  <button className="btn-ghost" onClick={handleCopy} style={{ flexShrink: 0 }}>
                    {copied ? <><Check size={14} /> {t(messages, 'token_copied')}</> : <><Copy size={14} /> {t(messages, 'token_copy')}</>}
                  </button>
                </div>
                <button
                  onClick={() => { setCreatedToken(null); setCopied(false); }}
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', marginTop: 'var(--space-sm)', fontSize: '0.78rem' }}
                >
                  <X size={12} style={{ verticalAlign: 'middle' }} /> Dismiss
                </button>
              </div>
            )}

            {/* Token List */}
            {tokens.length === 0 && !showCreate && (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontStyle: 'italic' }}>
                {t(messages, 'token_no_tokens')}
              </p>
            )}

            {tokens.map((tk) => (
              <div key={tk.id} className="glass-sm" style={{ padding: 'var(--space-md)', marginBottom: 'var(--space-sm)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.92rem' }}>{tk.name}</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                      {formatScopes(tk.scopes)}
                    </div>
                    <div style={{ display: 'flex', gap: 'var(--space-md)', marginTop: '6px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      <span>{t(messages, 'token_last_used')}: {tk.last_used_at ? formatDate(tk.last_used_at) : t(messages, 'token_never_used')}</span>
                      {tk.expires_at && <span>{t(messages, 'token_expires')}: {formatDate(tk.expires_at)}</span>}
                    </div>
                  </div>
                  <button
                    className="btn-ghost"
                    style={{ color: 'var(--danger)', flexShrink: 0 }}
                    onClick={() => handleRevoke(tk.id)}
                  >
                    <Trash2 size={14} /> {t(messages, 'token_revoke')}
                  </button>
                </div>
              </div>
            ))}

            {/* Create Form */}
            {showCreate ? (
              <form onSubmit={handleCreateToken} style={{ marginTop: 'var(--space-md)' }}>
                <div className="glass-sm" style={{ padding: 'var(--space-md)', display: 'grid', gap: 'var(--space-md)' }}>
                  <div className="form-field">
                    <label>{t(messages, 'token_name')}</label>
                    <input
                      className="form-input"
                      value={newName}
                      onChange={e => setNewName(e.target.value)}
                      placeholder={t(messages, 'token_name_placeholder')}
                      required
                      maxLength={100}
                    />
                  </div>

                  <div className="form-field">
                    <label>{t(messages, 'token_scopes')}</label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.88rem', cursor: 'pointer', marginBottom: '8px' }}>
                      <input type="checkbox" checked={isFullAccess} onChange={e => toggleFullAccess(e.target.checked)} />
                      {t(messages, 'token_full_access')}
                    </label>
                    {!isFullAccess && (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '6px' }}>
                        {SCOPE_MODULES.map(mod => (
                          <div key={mod.key} style={{ fontSize: '0.82rem' }}>
                            <div style={{ fontWeight: 500, marginBottom: '4px', color: 'var(--text-secondary)' }}>{mod.label}</div>
                            {['read', 'write'].map(action => (
                              <label key={action} style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', marginBottom: '2px' }}>
                                <input
                                  type="checkbox"
                                  checked={newScopes.includes(`${mod.key}:${action}`)}
                                  onChange={e => toggleModuleScope(mod.key, action, e.target.checked)}
                                />
                                {action}
                              </label>
                            ))}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="form-field">
                    <label>{t(messages, 'token_expiry')}</label>
                    <div style={{ display: 'flex', gap: 'var(--space-sm)', alignItems: 'center' }}>
                      <input
                        className="form-input"
                        type="date"
                        value={newExpiry}
                        onChange={e => setNewExpiry(e.target.value)}
                        min={new Date().toISOString().split('T')[0]}
                        style={{ flex: 1 }}
                      />
                      {newExpiry && (
                        <button type="button" className="btn-ghost" onClick={() => setNewExpiry('')}>
                          {t(messages, 'token_no_expiry')}
                        </button>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
                    <button type="submit" className="btn-sm" disabled={!newName.trim()}>
                      <Plus size={14} /> {t(messages, 'create_token')}
                    </button>
                    <button type="button" className="btn-ghost" onClick={() => setShowCreate(false)}>
                      Cancel
                    </button>
                  </div>
                </div>
              </form>
            ) : (
              <button
                className="btn-ghost"
                onClick={() => setShowCreate(true)}
                disabled={tokens.length >= 25}
                style={{ marginTop: 'var(--space-sm)' }}
              >
                <Plus size={14} /> {tokens.length >= 25 ? t(messages, 'token_limit_reached') : t(messages, 'create_token')}
              </button>
            )}
          </div>
        )}

        {/* Privacy Section */}
        <div className="settings-section glass">
          <div className="settings-section-title"><ShieldCheck size={16} /> {t(messages, 'privacy')}</div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', lineHeight: 1.6 }}>
            {t(messages, 'privacy_note')}
          </p>
        </div>
      </div>
    </div>
  );
}
