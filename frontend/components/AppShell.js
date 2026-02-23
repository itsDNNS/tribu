import { CalendarDays, CheckSquare, LayoutDashboard, Settings, Shield, BookUser, LogOut, ChevronDown, Users } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { t } from '../lib/i18n';
import DashboardView from './DashboardView';
import CalendarView from './CalendarView';
import ContactsView from './ContactsView';
import TasksView from './TasksView';
import SettingsView from './SettingsView';
import AdminView from './AdminView';

const views = {
  dashboard: DashboardView,
  calendar: CalendarView,
  contacts: ContactsView,
  tasks: TasksView,
  settings: SettingsView,
  admin: AdminView,
};

const MEMBER_COLORS = ['var(--member-1)', 'var(--member-2)', 'var(--member-3)', 'var(--member-4)'];

export default function AppShell() {
  const { activeView, setActiveView, isMobile, isAdmin, messages, me, members, families, familyId, tasks, logout, demoMode } = useApp();

  const ActiveComponent = views[activeView] || DashboardView;
  const currentFamily = families.find((f) => String(f.family_id) === String(familyId));
  const openTaskCount = tasks.filter((t) => t.status === 'open').length;
  const initials = (me?.display_name || 'U').charAt(0).toUpperCase();

  const navItems = [
    { key: 'dashboard', icon: LayoutDashboard, label: t(messages, 'dashboard'), mobileLabel: 'Home' },
    { key: 'calendar', icon: CalendarDays, label: t(messages, 'calendar'), mobileLabel: t(messages, 'calendar') },
    { key: 'tasks', icon: CheckSquare, label: t(messages, 'module.tasks.name'), mobileLabel: t(messages, 'module.tasks.name'), badge: openTaskCount || null },
    { key: 'contacts', icon: BookUser, label: t(messages, 'contacts'), mobileLabel: t(messages, 'contacts') },
  ];

  const systemItems = [
    { key: 'settings', icon: Settings, label: t(messages, 'settings'), mobileLabel: 'Mehr' },
    ...(isAdmin ? [{ key: 'admin', icon: Shield, label: t(messages, 'admin') }] : []),
  ];

  return (
    <div style={{ display: 'flex', minHeight: '100vh', position: 'relative', zIndex: 2 }}>
      {demoMode && (
        <div className="demo-banner">
          Demo-Modus — Daten werden nicht gespeichert
        </div>
      )}
      {!isMobile && (
        <aside className="sidebar">
          <div className="sidebar-brand">
            <div className="sidebar-logo">
              <Users size={20} color="white" />
            </div>
            <div className="sidebar-brand-text">
              <h2>Tribu</h2>
              <span>Family OS</span>
            </div>
          </div>

          {currentFamily && (
            <div className="family-switcher">
              <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>{currentFamily.family_name}</span>
              <div className="family-avatars">
                {members.slice(0, 4).map((m, i) => (
                  <div key={m.user_id} className="family-avatar-mini" style={{ background: MEMBER_COLORS[i % MEMBER_COLORS.length] }}>
                    {(m.display_name || '?').charAt(0).toUpperCase()}
                  </div>
                ))}
              </div>
              <ChevronDown size={16} style={{ color: 'var(--text-muted)', marginLeft: 4 }} />
            </div>
          )}

          <nav className="nav-section">
            {navItems.map((item) => (
              <button
                key={item.key}
                className={`nav-item${activeView === item.key ? ' active' : ''}`}
                onClick={() => setActiveView(item.key)}
              >
                <item.icon size={20} />
                {item.label}
                {item.badge && <span className="nav-badge">{item.badge}</span>}
              </button>
            ))}
            <div className="nav-section-label">System</div>
            {systemItems.map((item) => (
              <button
                key={item.key}
                className={`nav-item${activeView === item.key ? ' active' : ''}`}
                onClick={() => setActiveView(item.key)}
              >
                <item.icon size={20} />
                {item.label}
              </button>
            ))}
          </nav>

          <div className="sidebar-user">
            <div className="sidebar-user-avatar">{initials}</div>
            <div className="sidebar-user-info">
              <div className="sidebar-user-name">{me?.display_name || 'User'}</div>
              <div className="sidebar-user-role">{isAdmin ? 'Admin' : 'Mitglied'}</div>
            </div>
            <button className="sidebar-logout" onClick={logout} title={t(messages, 'logout')}>
              <LogOut size={18} />
            </button>
          </div>
        </aside>
      )}

      <main className="main-content" style={isMobile ? { marginLeft: 0, width: '100%' } : undefined}>
        {isMobile && (
          <div className="mobile-header" style={{ display: 'flex' }}>
            <div className="mobile-header-user">
              <div className="mobile-header-avatar">{initials}</div>
              <div className="mobile-header-text">
                <h3>Tribu</h3>
                <span>{currentFamily?.family_name || ''}</span>
              </div>
            </div>
            <button className="sidebar-logout" onClick={logout}>
              <LogOut size={18} />
            </button>
          </div>
        )}

        <div className="view-enter">
          <ActiveComponent />
        </div>
      </main>

      {isMobile && (
        <nav className="bottom-nav" style={{ display: 'block' }}>
          <div className="bottom-nav-inner">
            {[...navItems.filter((n) => n.mobileLabel), ...systemItems.filter((n) => n.mobileLabel)].map((item) => (
              <button
                key={item.key}
                className={`bottom-nav-item${activeView === item.key ? ' active' : ''}`}
                onClick={() => setActiveView(item.key)}
              >
                <item.icon size={22} />
                <span>{item.mobileLabel}</span>
              </button>
            ))}
          </div>
        </nav>
      )}
    </div>
  );
}
