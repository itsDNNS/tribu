import { useState, useCallback } from 'react';
import { CalendarDays, CheckSquare, LayoutDashboard, Settings, Shield, BookUser, LogOut, ChevronDown, ChevronLeft, ChevronRight, Users, Menu } from 'lucide-react';
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
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

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
    { key: 'settings', icon: Settings, label: t(messages, 'settings'), mobileLabel: t(messages, 'settings') },
    ...(isAdmin ? [{ key: 'admin', icon: Shield, label: t(messages, 'admin') }] : []),
  ];

  const navigate = useCallback((key) => {
    setActiveView(key);
    if (isMobile) setMobileOpen(false);
  }, [setActiveView, isMobile]);

  const sidebarClass = `sidebar${collapsed && !isMobile ? ' collapsed' : ''}${isMobile && mobileOpen ? ' mobile-open' : ''}`;

  return (
    <div style={{ display: 'flex', minHeight: '100vh', position: 'relative', zIndex: 2 }}>
      {demoMode && (
        <div className="demo-banner">
          {t(messages, 'demo_banner')}
        </div>
      )}

      {/* Sidebar */}
      <aside className={sidebarClass}>
        <div className="sidebar-header">
          <div className="sidebar-brand">
            <div className="sidebar-logo">
              <Users size={20} color="white" />
            </div>
            {!collapsed && (
              <div className="sidebar-brand-text">
                <h2>Tribu</h2>
                <span>Family OS</span>
              </div>
            )}
          </div>
          {!isMobile && (
            <button className="sidebar-toggle" onClick={() => setCollapsed((c) => !c)} title={collapsed ? 'Expand' : 'Collapse'}>
              {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
            </button>
          )}
        </div>

        <div className="sidebar-content">
          {!collapsed && currentFamily && (
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
                onClick={() => navigate(item.key)}
                data-tooltip={item.label}
              >
                <span className="nav-icon"><item.icon size={20} /></span>
                {!collapsed && <span className="nav-label">{item.label}</span>}
                {!collapsed && item.badge && <span className="nav-badge">{item.badge}</span>}
              </button>
            ))}

            <div className="nav-section-label">{!collapsed ? 'System' : ''}</div>

            {systemItems.map((item) => (
              <button
                key={item.key}
                className={`nav-item${activeView === item.key ? ' active' : ''}`}
                onClick={() => navigate(item.key)}
                data-tooltip={item.label}
              >
                <span className="nav-icon"><item.icon size={20} /></span>
                {!collapsed && <span className="nav-label">{item.label}</span>}
              </button>
            ))}
          </nav>

          <div style={{ flex: 1 }} />

          <div className="sidebar-divider" />

          <div className="sidebar-user">
            <div className="sidebar-user-avatar">{initials}</div>
            {!collapsed && (
              <div className="sidebar-user-info">
                <div className="sidebar-user-name">{me?.display_name || 'User'}</div>
                <div className="sidebar-user-role">{isAdmin ? 'Admin' : t(messages, 'member')}</div>
              </div>
            )}
            <button className="sidebar-logout" onClick={logout} title={t(messages, 'logout')}>
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile backdrop */}
      {isMobile && mobileOpen && (
        <div className="sidebar-backdrop active" onClick={() => setMobileOpen(false)} />
      )}

      {/* Main */}
      <main className="main-content" style={isMobile ? { marginLeft: 0, width: '100%' } : collapsed ? { marginLeft: 70, width: 'calc(100% - 70px)' } : undefined}>
        {isMobile && (
          <div className="mobile-header" style={{ display: 'flex' }}>
            <div className="mobile-header-user">
              <button className="mobile-hamburger" onClick={() => setMobileOpen(true)}>
                <Menu size={22} />
              </button>
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

      {/* Mobile bottom nav */}
      {isMobile && (
        <nav className="bottom-nav" style={{ display: 'block' }}>
          <div className="bottom-nav-inner">
            {[...navItems.filter((n) => n.mobileLabel), ...systemItems.filter((n) => n.mobileLabel)].map((item) => (
              <button
                key={item.key}
                className={`bottom-nav-item${activeView === item.key ? ' active' : ''}`}
                onClick={() => navigate(item.key)}
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
