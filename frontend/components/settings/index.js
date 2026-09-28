import { useCallback, useState, useEffect, useRef } from 'react';
import { ChevronRight, ArrowLeft } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { t, tc } from '../../lib/i18n';
import AccountTab from './AccountTab';
import NavigationTab from './NavigationTab';
import NotificationsTab from './NotificationsTab';
import DataTab from './DataTab';
import ApiTokensTab from './ApiTokensTab';
import WebhooksTab from './WebhooksTab';
import NotificationDestinationsTab from './NotificationDestinationsTab';
import StoreLinksTab from './StoreLinksTab';
import PhoneSyncTab from './PhoneSyncTab';
import AboutTab from './AboutTab';
import AreasTab from './AreasTab';

const TABS = [
  { key: 'account',       labelKey: 'settings_tab_account',  component: AccountTab,       visible: () => true },
  { key: 'notifications', labelKey: 'notification_settings', component: NotificationsTab, visible: ({ demoMode }) => !demoMode },
  { key: 'navigation',    labelKey: 'nav_order_title',       component: NavigationTab,    visible: () => true },
  { key: 'phone_sync',    labelKey: 'phone_sync_title',      component: PhoneSyncTab,     visible: ({ isChild, demoMode }) => !isChild && !demoMode },
  { key: 'tokens',        labelKey: 'api_tokens',            component: ApiTokensTab,     visible: ({ isChild, demoMode }) => !isChild && !demoMode },
  { key: 'areas',         labelKey: 'settings.areas',        component: AreasTab,         visible: ({ isAdmin, isChild, demoMode }) => isAdmin && !isChild && !demoMode },
  { key: 'data',          labelKey: 'data_management',       component: DataTab,          visible: ({ isChild, demoMode }) => !isChild && !demoMode },
  { key: 'store_links', labelKey: 'store_links_title', component: StoreLinksTab, visible: ({ isChild, demoMode }) => !isChild && !demoMode },
  { key: 'webhooks',      labelKey: 'automation_webhooks',   component: WebhooksTab,      visible: ({ isChild, demoMode }) => !isChild && !demoMode },
  { key: 'notification_destinations', labelKey: 'household_notifications', component: NotificationDestinationsTab, visible: ({ isAdmin, isChild, demoMode }) => isAdmin && !isChild && !demoMode },
  { key: 'about',         labelKey: 'about_support',         component: AboutTab,         visible: () => true },
];

// Family administration opens on the matching admin tab.
const ADMIN_ROWS = [
  ['members', 'admin_tab_members'],
  ['displays', 'display_title'],
  ['sso', 'sso.title'],
  ['backups', 'backup_title'],
  ['system', 'system_title'],
  ['audit', 'audit_log_title'],
];

export const APPEARANCES = ['system', 'light', 'dark', 'midnight-glass'];

function SettingRow({ title, description, children }) {
  return <div className="ms-row"><div><strong>{title}</strong>{description && <div className="ms-small">{description}</div>}</div>{children}</div>;
}

// Settings on three levels (Tribu 2.0, X1): this device, my account and the
// family. Each row says what it changes; details open in place.
export default function SettingsView() {
  const { messages, isChild, isAdmin, demoMode, theme, setTheme, lang, setLang,
    availableLanguages = [], availableThemes = [], weekStart, setWeekStart, members = [], setActiveView,
    families = [], familyId,
    compactDashboard = false, setCompactDashboard, showNotificationBadge = true, setShowNotificationBadge } = useApp();
  const visibleTabs = TABS.filter(tab => tab.visible({ isAdmin, isChild, demoMode }));
  const [activeTab, setActiveTabState] = useState(() => {
    const requested = typeof window !== 'undefined' ? sessionStorage.getItem('tribu_settings_tab') : null;
    return visibleTabs.some(tab => tab.key === requested) ? requested : null;
  });
  const headingRef = useRef(null);
  const shouldFocus = useRef(false);
  const setActiveTab = useCallback((key) => {
    if (typeof window !== 'undefined') {
      if (key) sessionStorage.setItem('tribu_settings_tab', key);
      else sessionStorage.removeItem('tribu_settings_tab');
    }
    shouldFocus.current = true;
    setActiveTabState(key);
  }, []);
  const activeTabConfig = visibleTabs.find(tab => tab.key === activeTab);
  const ActiveComponent = activeTabConfig?.component;
  useEffect(() => {
    if (activeTab && !activeTabConfig) setActiveTab(null);
  }, [activeTab, activeTabConfig, setActiveTab]);
  useEffect(() => {
    if (shouldFocus.current) {
      headingRef.current?.focus();
      shouldFocus.current = false;
    }
  }, [activeTab]);
  const copy = key => t(messages, `settings_mockup_${key}`);
  const level = key => t(messages, `settings.${key}`);
  const familyName = families.find(family => String(family.family_id) === String(familyId))?.family_name;
  const openButton = (label, onClick) => (
    <button className="ms-button" aria-label={label} onClick={onClick}>{copy('open')}<ChevronRight size={13}/></button>
  );
  const tabRow = key => {
    const tab = visibleTabs.find(item => item.key === key);
    if (!tab) return null;
    const label = t(messages, tab.labelKey);
    const description = key === 'areas' ? level('areas_desc') : copy(`${key}_desc`);
    return <SettingRow key={key} title={label} description={description}>
      {openButton(label, () => setActiveTab(key))}
    </SettingRow>;
  };
  const adminRow = ([key, labelKey]) => {
    const label = t(messages, labelKey);
    return <SettingRow key={key} title={label} description={level(`admin_${key}_desc`)}>
      {openButton(label, () => {
        sessionStorage.setItem('tribu_admin_tab', key);
        setActiveView('admin');
      })}
    </SettingRow>;
  };
  const themeName = key => {
    if (key === 'system') return level('appearance_system');
    if (key === 'light' || key === 'dark') return copy(key);
    return availableThemes.find(item => item.key === key)?.name || key;
  };
  const appearances = APPEARANCES.filter(key => key === 'system' || availableThemes.length === 0 || availableThemes.some(item => item.key === key));

  const device = <section className="ms-card" aria-labelledby="ms-device" key="device">
    <h2 id="ms-device">{level('device_title')}</h2><p>{level('device_intro')}</p>
    <SettingRow title={level('appearance')} description={level('appearance_desc')}>
      <select aria-label={level('appearance')} value={appearances.includes(theme) ? theme : 'light'} onChange={event => setTheme(event.target.value)}>
        {appearances.map(key => <option key={key} value={key}>{themeName(key)}</option>)}
      </select>
    </SettingRow>
    <SettingRow title={t(messages, 'language')} description={copy('language_desc')}>
      <select aria-label={t(messages, 'language')} value={lang} onChange={event => setLang(event.target.value)}>
        {availableLanguages.map(item => <option key={item.key} value={item.key}>{item.nativeName}</option>)}
      </select>
    </SettingRow>
    <SettingRow title={t(messages, 'week_start_title')} description={t(messages, 'week_start_desc')}>
      <select aria-label={t(messages, 'week_start_title')} value={weekStart} onChange={event => setWeekStart(event.target.value)}>
        {['monday', 'sunday'].map(day => <option key={day} value={day}>{t(messages, `week_start_${day}`)}</option>)}
      </select>
    </SettingRow>
    <SettingRow title={copy('compact')} description={level('compact_desc')}>
      <button className="ms-switch" role="switch" aria-label={copy('compact')} aria-checked={compactDashboard} onClick={() => setCompactDashboard(!compactDashboard)}><span/></button>
    </SettingRow>
    <SettingRow title={copy('badge')} description={copy('badge_desc')}>
      <button className="ms-switch" role="switch" aria-label={copy('badge')} aria-checked={showNotificationBadge} onClick={() => setShowNotificationBadge(!showNotificationBadge)}><span/></button>
    </SettingRow>
  </section>;

  const account = <section className="ms-card" aria-labelledby="ms-account" key="account">
    <h2 id="ms-account">{level('account_title')}</h2><p>{level('account_intro')}</p>
    {tabRow('account')}{tabRow('notifications')}{tabRow('navigation')}{tabRow('phone_sync')}{tabRow('tokens')}
  </section>;

  const family = <section className="ms-card" aria-labelledby="ms-family" key="family">
    <h2 id="ms-family">{level('family_title')}</h2>
    <p>{familyName ? level('family_intro').replace('{family}', familyName) : level('family_intro_plain')}</p>
    {isAdmin && !demoMode ? ADMIN_ROWS.slice(0, 1).map(adminRow) : (
      <SettingRow title={copy('family')} description={tc(messages, 'settings_mockup_family_count', members.length)}>
        {openButton(copy('family'), () => setActiveView('contacts'))}
      </SettingRow>
    )}
    {tabRow('areas')}{tabRow('data')}{tabRow('store_links')}
    {isAdmin && !demoMode && ADMIN_ROWS.slice(1, 5).map(adminRow)}
    {tabRow('webhooks')}{tabRow('notification_destinations')}
    {isAdmin && !demoMode && ADMIN_ROWS.slice(5).map(adminRow)}
    {(demoMode || isChild) && <SettingRow title={copy('data_limited')} description={copy(demoMode ? 'demo_desc' : 'child_desc')}><span className="ms-heart" aria-hidden="true">♡</span></SettingRow>}
  </section>;

  const about = <section className="ms-card ms-card-about" aria-label={t(messages, 'about_support')} key="about">
    {tabRow('about')}
  </section>;

  return <div className="settings-page dashboard-today-page mockup-settings-page">
    <header className={`list-header ms-list-header${activeTabConfig ? '' : ' ms-overview-header'}`}>
      <h1 ref={headingRef} tabIndex={-1}>{activeTabConfig ? t(messages, activeTabConfig.labelKey) : t(messages, 'settings')}</h1>
    </header>
    {ActiveComponent ? <>
      <div className="ms-detail-navigation">
        <button className="ms-button settings-mobile-back" onClick={() => setActiveTab(null)}><ArrowLeft size={14}/>{copy('overview')}</button>
        <select aria-label={copy('section')} value={activeTab} onChange={event => setActiveTab(event.target.value)}>
          {visibleTabs.map(tab => <option key={tab.key} value={tab.key}>{t(messages, tab.labelKey)}</option>)}
        </select>
      </div>
      <div className="ms-detail"><ActiveComponent/></div>
    </> : <div className="ms-grid">
      <div className="ms-column">{device}{account}</div>
      <div className="ms-column">{family}{about}</div>
    </div>}
  </div>;
}
