import { useState, useEffect } from 'react';
import { User, Navigation, Bell, Database, Key, Heart, Smartphone, ChevronRight, ArrowLeft } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { t } from '../../lib/i18n';
import AccountTab from './AccountTab';
import NavigationTab from './NavigationTab';
import NotificationsTab from './NotificationsTab';
import DataTab from './DataTab';
import ApiTokensTab from './ApiTokensTab';
import PhoneSyncTab from './PhoneSyncTab';
import AboutTab from './AboutTab';

const TABS = [
  { key: 'account',       labelKey: 'settings_tab_account',  icon: User,       component: AccountTab,       visible: () => true,                              group: 'personal' },
  { key: 'navigation',    labelKey: 'nav_order_title',       icon: Navigation, component: NavigationTab,    visible: () => true,                              group: 'personal' },
  { key: 'notifications', labelKey: 'notification_settings', icon: Bell,       component: NotificationsTab, visible: ({ demoMode }) => !demoMode,             group: 'personal' },
  { key: 'phone_sync',    labelKey: 'phone_sync_title',      icon: Smartphone, component: PhoneSyncTab,     visible: ({ demoMode }) => !demoMode,             group: 'personal' },
  { key: 'data',          labelKey: 'data_management',       icon: Database,   component: DataTab,          visible: ({ isChild, demoMode }) => !isChild && !demoMode, group: 'personal' },
  { key: 'tokens',        labelKey: 'api_tokens',            icon: Key,        component: ApiTokensTab,     visible: ({ isChild, demoMode }) => !isChild && !demoMode, group: 'system' },
  { key: 'about',         labelKey: 'about_support',         icon: Heart,      component: AboutTab,         visible: () => true,                              group: 'system' },
];

export default function SettingsView() {
  const { messages, isMobile, isChild, demoMode } = useApp();
  const visibleTabs = TABS.filter(tab => tab.visible({ isChild, demoMode }));
  const [activeTab, setActiveTab] = useState(isMobile ? null : visibleTabs[0]?.key || 'account');

  // When switching from mobile to desktop, ensure a tab is selected
  useEffect(() => {
    if (!isMobile && activeTab === null) {
      setActiveTab(visibleTabs[0]?.key || 'account');
    }
  }, [isMobile, activeTab, visibleTabs]);

  const activeTabConfig = visibleTabs.find(tab => tab.key === activeTab);
  const ActiveComponent = activeTabConfig?.component;

  // Group tabs for sidebar rendering
  const groups = [];
  let lastGroup = null;
  for (const tab of visibleTabs) {
    if (tab.group !== lastGroup) {
      groups.push({ label: tab.group, tabs: [] });
      lastGroup = tab.group;
    }
    groups[groups.length - 1].tabs.push(tab);
  }

  // Mobile: list view when no tab selected
  if (isMobile && activeTab === null) {
    return (
      <div>
        <div className="view-header">
          <div>
            <h1 className="view-title">{t(messages, 'settings')}</h1>
            <div className="view-subtitle">{t(messages, 'settings_subtitle')}</div>
          </div>
        </div>
        <div className="settings-mobile-list">
          {groups.map((group, gi) => (
            <div key={group.label}>
              {gi > 0 && <div className="settings-divider" />}
              <div className="settings-mobile-group">
                {t(messages, `settings_group_${group.label}`)}
              </div>
              {group.tabs.map(tab => {
                const Icon = tab.icon;
                return (
                  <button key={tab.key} className="settings-mobile-item" onClick={() => setActiveTab(tab.key)}>
                    <Icon size={20} />
                    <span>{t(messages, tab.labelKey)}</span>
                    <ChevronRight size={16} />
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Mobile: detail view with back button
  if (isMobile) {
    return (
      <div>
        <button className="settings-mobile-back" onClick={() => setActiveTab(null)}>
          <ArrowLeft size={16} /> {t(messages, 'settings_back')}
        </button>
        {ActiveComponent && <ActiveComponent />}
      </div>
    );
  }

  // Desktop: sidebar + content
  return (
    <div>
      <div className="view-header">
        <div>
          <h1 className="view-title">{t(messages, 'settings')}</h1>
          <div className="view-subtitle">{t(messages, 'settings_subtitle')}</div>
        </div>
      </div>
      <div className="settings-layout">
        <nav className="settings-sidebar">
          {groups.map((group, gi) => (
            <div key={group.label}>
              {gi > 0 && <div className="settings-divider" />}
              <div className="settings-sidebar-group">
                {t(messages, `settings_group_${group.label}`)}
              </div>
              {group.tabs.map(tab => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.key}
                    className={`settings-sidebar-item${activeTab === tab.key ? ' active' : ''}`}
                    onClick={() => setActiveTab(tab.key)}
                  >
                    <Icon size={18} />
                    {t(messages, tab.labelKey)}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="settings-content">
          {ActiveComponent && <ActiveComponent />}
        </div>
      </div>
    </div>
  );
}
