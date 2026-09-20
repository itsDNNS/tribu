import { useCallback, useState, useEffect, useRef } from 'react';
import { Sun, Moon, Users, ChevronRight, ArrowLeft } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { t } from '../../lib/i18n';
import FamilyTopbar from '../FamilyTopbar';
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

const TABS = [
  { key: 'account',       labelKey: 'settings_tab_account',  component: AccountTab,       visible: () => true },
  { key: 'navigation',    labelKey: 'nav_order_title',       component: NavigationTab,    visible: () => true },
  { key: 'notifications', labelKey: 'notification_settings', component: NotificationsTab, visible: ({ demoMode }) => !demoMode },
  { key: 'phone_sync',    labelKey: 'phone_sync_title',      component: PhoneSyncTab,     visible: ({ isChild, demoMode }) => !isChild && !demoMode },
  { key: 'data',          labelKey: 'data_management',       component: DataTab,          visible: ({ isChild, demoMode }) => !isChild && !demoMode },
  { key: 'tokens',        labelKey: 'api_tokens',            component: ApiTokensTab,     visible: ({ isChild, demoMode }) => !isChild && !demoMode },
  { key: 'webhooks',      labelKey: 'automation_webhooks',   component: WebhooksTab,      visible: ({ isChild, demoMode }) => !isChild && !demoMode },
  { key: 'notification_destinations', labelKey: 'household_notifications', component: NotificationDestinationsTab, visible: ({ isAdmin, isChild, demoMode }) => isAdmin && !isChild && !demoMode },
  { key: 'store_links', labelKey: 'store_links_title', component: StoreLinksTab, visible: ({ isChild, demoMode }) => !isChild && !demoMode },
  { key: 'about',         labelKey: 'about_support',         component: AboutTab,         visible: () => true },
];

function SettingRow({ title, description, children }) {
  return <div className="ms-row"><div><strong>{title}</strong>{description && <div className="ms-small">{description}</div>}</div>{children}</div>;
}

export default function SettingsView(props) {
  const { messages, isChild, isAdmin, demoMode, theme, setTheme, lang, setLang,
    availableLanguages = [], weekStart, setWeekStart, members = [], setActiveView,
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
  const tabRow = key => {
    const tab = visibleTabs.find(item => item.key === key);
    if (!tab) return null;
    const label = t(messages, tab.labelKey);
    return <SettingRow key={key} title={label} description={copy(`${key}_desc`)}>
      <button className="ms-button" aria-label={label} onClick={() => setActiveTab(key)}>{copy('open')}<ChevronRight size={13}/></button>
    </SettingRow>;
  };
  return <div className="settings-page dashboard-today-page mockup-settings-page">
    <FamilyTopbar {...props}/>
    <header className="ms-header">
      <div className="ms-eyebrow">{t(messages, 'settings')}</div>
      <h1 ref={headingRef} tabIndex={-1}>{activeTabConfig ? t(messages, activeTabConfig.labelKey) : copy('title')}</h1>
      <p>{activeTabConfig ? copy(`${activeTab}_desc`) : copy('subtitle')}</p>
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
      <section className="ms-card" aria-labelledby="ms-family">
        <h2 id="ms-family">{copy('family_title')}</h2><p>{copy('family_intro')}</p>
        <SettingRow title={copy('theme')} description={copy('theme_desc')}>
          <button className="ms-button" aria-label={copy('theme')} onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>
            {theme === 'light' ? <Sun size={14}/> : <Moon size={14}/>}{copy(theme === 'light' ? 'light' : 'dark')}
          </button>
        </SettingRow>
        <SettingRow title={copy('compact')} description={copy('compact_desc')}>
          <button className="ms-switch" role="switch" aria-label={copy('compact')} aria-checked={compactDashboard} onClick={() => setCompactDashboard(!compactDashboard)}><span/></button>
        </SettingRow>
        <SettingRow title={copy('badge')} description={copy('badge_desc')}>
          <button className="ms-switch" role="switch" aria-label={copy('badge')} aria-checked={showNotificationBadge} onClick={() => setShowNotificationBadge(!showNotificationBadge)}><span/></button>
        </SettingRow>
        <SettingRow title={copy('family')} description={copy('family_count').replace('{count}', members.length)}>
          <button className="ms-button" onClick={() => setActiveView('contacts')}><Users size={13}/>{copy('manage')}</button>
        </SettingRow>
      </section>
      <section className="ms-card" aria-labelledby="ms-display">
        <h2 id="ms-display">{copy('display_title')}</h2><p>{copy('display_intro')}</p>
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
        {tabRow('navigation')}{tabRow('account')}
      </section>
      <section className="ms-card" aria-labelledby="ms-data">
        <h2 id="ms-data">{copy('data_title')}</h2><p>{copy(demoMode ? 'demo_intro' : 'data_intro')}</p>
        {tabRow('data')}{tabRow('phone_sync')}{tabRow('tokens')}
        {(demoMode || isChild) && <SettingRow title={copy('data_limited')} description={copy(demoMode ? 'demo_desc' : 'child_desc')}><span className="ms-heart" aria-hidden="true">♡</span></SettingRow>}
      </section>
      <section className="ms-card" aria-labelledby="ms-more">
        <h2 id="ms-more">{copy('more_title')}</h2><p>{copy('more_intro')}</p>
        {tabRow('notifications')}{tabRow('webhooks')}{tabRow('notification_destinations')}{tabRow('store_links')}{tabRow('about')}
      </section>
    </div>}
  </div>;
}
