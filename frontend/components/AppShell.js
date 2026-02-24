import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Bell, CalendarDays, CheckSquare, LayoutDashboard, Settings, Shield, BookUser, LogOut, ChevronDown, ChevronLeft, ChevronRight, Users, Menu, ShoppingCart, MoreHorizontal } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { t } from '../lib/i18n';
import DashboardView from './DashboardView';
import CalendarView from './CalendarView';
import ContactsView from './ContactsView';
import TasksView from './TasksView';
import ShoppingView from './ShoppingView';
import SettingsView from './SettingsView';
import AdminView from './AdminView';
import NotificationCenter from './NotificationCenter';

const views = {
  dashboard: DashboardView,
  calendar: CalendarView,
  shopping: ShoppingView,
  contacts: ContactsView,
  tasks: TasksView,
  notifications: NotificationCenter,
  settings: SettingsView,
  admin: AdminView,
};

const SYSTEM_KEYS = new Set(['notifications', 'settings', 'admin']);
const MEMBER_COLORS = ['var(--member-1)', 'var(--member-2)', 'var(--member-3)', 'var(--member-4)'];
const MAX_BOTTOM_NAV = 5;

function DashboardSkeleton() {
  return (
    <div role="status" aria-label="Loading" aria-busy="true">
      <div className="view-header">
        <div>
          <div className="skeleton skeleton-text lg" />
          <div className="skeleton skeleton-text sm" />
        </div>
      </div>
      <div className="bento-grid">
        <div className="bento-welcome glass skeleton skeleton-card" style={{ minHeight: 140 }} />
        <div className="bento-stats glass skeleton skeleton-card" style={{ minHeight: 140 }} />
        <div className="bento-events glass skeleton skeleton-card" style={{ minHeight: 180 }} />
        <div className="bento-tasks glass skeleton skeleton-card" style={{ minHeight: 180 }} />
        <div className="bento-birthdays glass skeleton skeleton-card" style={{ minHeight: 180 }} />
      </div>
    </div>
  );
}

export default function AppShell() {
  const { activeView, setActiveView, isMobile, isAdmin, messages, me, members, families, familyId, tasks, shoppingLists, unreadCount, logout, demoMode, loading, navOrder } = useApp();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const overflowRef = useRef(null);

  const ActiveComponent = views[activeView] || DashboardView;
  const currentFamily = families.find((f) => String(f.family_id) === String(familyId));
  const openTaskCount = tasks.filter((tk) => tk.status === 'open').length;
  const totalUnchecked = shoppingLists.reduce((sum, l) => sum + (l.item_count - l.checked_count), 0);
  const initials = (me?.display_name || 'U').charAt(0).toUpperCase();

  // Item registry: all possible nav items keyed by their route key
  const itemRegistry = useMemo(() => ({
    dashboard: { key: 'dashboard', icon: LayoutDashboard, label: t(messages, 'dashboard'), mobileLabel: 'Home' },
    calendar: { key: 'calendar', icon: CalendarDays, label: t(messages, 'calendar'), mobileLabel: t(messages, 'calendar') },
    shopping: { key: 'shopping', icon: ShoppingCart, label: t(messages, 'module.shopping.name'), mobileLabel: t(messages, 'module.shopping.name'), badge: totalUnchecked || null },
    tasks: { key: 'tasks', icon: CheckSquare, label: t(messages, 'module.tasks.name'), mobileLabel: t(messages, 'module.tasks.name'), badge: openTaskCount || null },
    contacts: { key: 'contacts', icon: BookUser, label: t(messages, 'contacts'), mobileLabel: t(messages, 'contacts') },
    notifications: { key: 'notifications', icon: Bell, label: t(messages, 'notifications'), mobileLabel: t(messages, 'notifications'), badge: unreadCount || null },
    settings: { key: 'settings', icon: Settings, label: t(messages, 'settings'), mobileLabel: t(messages, 'settings') },
    admin: { key: 'admin', icon: Shield, label: t(messages, 'admin'), mobileLabel: t(messages, 'admin') },
  }), [messages, totalUnchecked, openTaskCount, unreadCount]);

  // Ordered items based on custom nav order, filtering admin for non-admins and unknown keys
  const orderedItems = useMemo(() => {
    return navOrder
      .filter((key) => key in itemRegistry && (key !== 'admin' || isAdmin))
      .map((key) => itemRegistry[key]);
  }, [navOrder, itemRegistry, isAdmin]);

  // Mobile bottom nav: max 5 items, with overflow
  const hasOverflow = orderedItems.length > MAX_BOTTOM_NAV;
  const visibleItems = hasOverflow ? orderedItems.slice(0, MAX_BOTTOM_NAV - 1) : orderedItems.slice(0, MAX_BOTTOM_NAV);
  const overflowItems = hasOverflow ? orderedItems.slice(MAX_BOTTOM_NAV - 1) : [];
  const activeInOverflow = overflowItems.some((item) => item.key === activeView);

  const navigate = useCallback((key) => {
    setActiveView(key);
    setOverflowOpen(false);
    if (isMobile) setMobileOpen(false);
  }, [setActiveView, isMobile]);

  // Close overflow popover on outside click
  useEffect(() => {
    if (!overflowOpen) return;
    function handleClick(e) {
      if (overflowRef.current && !overflowRef.current.contains(e.target)) {
        setOverflowOpen(false);
      }
    }
    document.addEventListener('pointerdown', handleClick);
    return () => document.removeEventListener('pointerdown', handleClick);
  }, [overflowOpen]);

  // Escape key closes mobile sidebar and overflow
  useEffect(() => {
    if (!isMobile) return;
    if (!mobileOpen && !overflowOpen) return;
    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        setMobileOpen(false);
        setOverflowOpen(false);
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isMobile, mobileOpen, overflowOpen]);

  const sidebarClass = `sidebar${collapsed && !isMobile ? ' collapsed' : ''}${isMobile && mobileOpen ? ' mobile-open' : ''}`;

  // Sidebar: find index of first system key to insert divider
  const firstSystemIndex = orderedItems.findIndex((item) => SYSTEM_KEYS.has(item.key));

  return (
    <div style={{ display: 'flex', minHeight: '100vh', position: 'relative', zIndex: 2 }}>
      {demoMode && (
        <div className="demo-banner">
          {t(messages, 'demo_banner')}
        </div>
      )}

      {/* Sidebar */}
      <aside className={sidebarClass} aria-label="Tribu">
        <div className="sidebar-header">
          <div className="sidebar-brand">
            <div className="sidebar-logo">
              <Users size={20} color="white" aria-hidden="true" />
            </div>
            {!collapsed && (
              <div className="sidebar-brand-text">
                <h2>Tribu</h2>
                <span>Family OS</span>
              </div>
            )}
          </div>
          {!isMobile && (
            <button
              className="sidebar-toggle"
              onClick={() => setCollapsed((c) => !c)}
              aria-label={collapsed ? t(messages, 'aria.expand_sidebar') : t(messages, 'aria.collapse_sidebar')}
              aria-expanded={!collapsed}
            >
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
              <ChevronDown size={16} style={{ color: 'var(--text-muted)', marginLeft: 4 }} aria-hidden="true" />
            </div>
          )}

          <nav className="nav-section" aria-label={t(messages, 'aria.main_navigation')}>
            {orderedItems.map((item, i) => {
              const btn = (
                <button
                  key={item.key}
                  className={`nav-item${activeView === item.key ? ' active' : ''}`}
                  onClick={() => navigate(item.key)}
                  data-tooltip={item.label}
                  aria-current={activeView === item.key ? 'page' : undefined}
                >
                  <span className="nav-icon" aria-hidden="true"><item.icon size={20} /></span>
                  {!collapsed && <span className="nav-label">{item.label}</span>}
                  {!collapsed && item.badge && <span className="nav-badge">{item.badge}</span>}
                </button>
              );
              if (i === firstSystemIndex && firstSystemIndex > 0) {
                return [
                  <div key="__system-divider" className="nav-section-label">{!collapsed ? 'System' : ''}</div>,
                  btn,
                ];
              }
              return btn;
            })}
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
            <button className="sidebar-logout" onClick={logout} aria-label={t(messages, 'aria.logout')}>
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile backdrop */}
      {isMobile && mobileOpen && (
        <div className="sidebar-backdrop active" onClick={() => setMobileOpen(false)} role="presentation" aria-hidden="true" />
      )}

      {/* Main */}
      <main id="main-content" className="main-content" style={isMobile ? { marginLeft: 0, width: '100%' } : collapsed ? { marginLeft: 70, width: 'calc(100% - 70px)' } : undefined}>
        {isMobile && (
          <div className="mobile-header" style={{ display: 'flex' }}>
            <div className="mobile-header-user">
              <button
                className="mobile-hamburger"
                onClick={() => setMobileOpen(true)}
                aria-label={t(messages, 'aria.open_menu')}
                aria-expanded={mobileOpen}
              >
                <Menu size={22} />
              </button>
              <div className="mobile-header-text">
                <h3>Tribu</h3>
                <span>{currentFamily?.family_name || ''}</span>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                className="sidebar-logout"
                onClick={() => navigate('notifications')}
                aria-label={t(messages, 'notifications')}
                style={{ position: 'relative' }}
              >
                <Bell size={18} />
                {unreadCount > 0 && (
                  <span className="bottom-nav-badge" style={{ position: 'absolute', top: -4, right: -4 }}>
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </button>
              <button className="sidebar-logout" onClick={logout} aria-label={t(messages, 'aria.logout')}>
                <LogOut size={18} />
              </button>
            </div>
          </div>
        )}

        <div className="view-enter">
          {loading ? <DashboardSkeleton /> : <ActiveComponent />}
        </div>
      </main>

      {/* Mobile bottom nav */}
      {isMobile && (
        <nav className="bottom-nav" style={{ display: 'block' }} aria-label={t(messages, 'aria.bottom_navigation')}>
          {/* Overflow popover */}
          {overflowOpen && overflowItems.length > 0 && (
            <div className="bottom-nav-overflow" ref={overflowRef}>
              {overflowItems.map((item) => (
                <button
                  key={item.key}
                  className={`bottom-nav-overflow-item${activeView === item.key ? ' active' : ''}`}
                  onClick={() => navigate(item.key)}
                >
                  <item.icon size={20} aria-hidden="true" />
                  <span>{item.mobileLabel || item.label}</span>
                  {item.badge && <span className="nav-badge">{item.badge > 99 ? '99+' : item.badge}</span>}
                </button>
              ))}
            </div>
          )}
          <div className="bottom-nav-inner">
            {visibleItems.map((item) => (
              <button
                key={item.key}
                className={`bottom-nav-item${activeView === item.key ? ' active' : ''}`}
                onClick={() => navigate(item.key)}
                aria-current={activeView === item.key ? 'page' : undefined}
              >
                <item.icon size={22} aria-hidden="true" />
                {item.badge && <span className="bottom-nav-badge">{item.badge > 99 ? '99+' : item.badge}</span>}
                <span>{item.mobileLabel || item.label}</span>
              </button>
            ))}
            {hasOverflow && (
              <button
                className={`bottom-nav-item${activeInOverflow || overflowOpen ? ' active' : ''}`}
                onClick={() => setOverflowOpen((o) => !o)}
                aria-expanded={overflowOpen}
                aria-haspopup="true"
              >
                <MoreHorizontal size={22} aria-hidden="true" />
                <span>{t(messages, 'nav_more')}</span>
              </button>
            )}
          </div>
        </nav>
      )}

      {/* Live region for screen reader announcements */}
      <div id="a11y-announcer" className="sr-only" aria-live="polite" aria-atomic="true" />
    </div>
  );
}
