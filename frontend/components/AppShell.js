import ResponsiveUI from './responsive/ResponsiveUI';
import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Users } from 'lucide-react';
import SearchOverlay from './SearchOverlay';
import { useApp } from '../contexts/AppContext';
import { t } from '../lib/i18n';
import { announce } from '../lib/announce';
import { resolveLaunchAction, resolveSharedText } from '../lib/navigationState';
import { ACCOUNT_NAV_KEYS, isNavItemVisible, NAV_GROUPS, NAV_ITEM_META, navGroupOf, navKeyOf, NO_HIDDEN_AREAS } from '../lib/navigation';
import AppHeader from './shell/AppHeader';
import SubNav from './shell/SubNav';
import TodayView from './today/TodayView';
import FamilyHub from './family/FamilyHub';
import ActivityView from './ActivityView';
import CalendarView from './calendar';
import ContactsView from './ContactsView';
import TasksView from './TasksView';
import TemplatesView from './TemplatesView';
import RewardsView from './RewardsView';
import GiftsView from './GiftsView';
import MealPlansView from './MealPlansView';
import SchoolTimetablesView from './SchoolTimetablesView';
import RecipesView from './RecipesView';
import ShoppingView from './ShoppingView';
import SettingsView from './settings';
import AdminView from './admin';
import WeeklyPlanView from './WeeklyPlanView';
import NotificationCenter from './NotificationCenter';
import ForcePasswordChange from './ForcePasswordChange';
import OnboardingWizard from './OnboardingWizard';

const views = {
  dashboard: TodayView,
  family: FamilyHub,
  activity: ActivityView,
  calendar: CalendarView,
  shopping: ShoppingView,
  contacts: ContactsView,
  tasks: TasksView,
  templates: TemplatesView,
  rewards: RewardsView,
  gifts: GiftsView,
  meal_plans: MealPlansView,
  school_timetables: SchoolTimetablesView,
  recipes: RecipesView,
  notifications: NotificationCenter,
  settings: SettingsView,
  admin: AdminView,
  weekly_plan: WeeklyPlanView,
};

// While the family loads: the shape of Today, a title and the timeline.
function TodaySkeleton({ messages }) {
  return (
    <div className="today-page" role="status" aria-label={t(messages, 'module.today.loading')} aria-busy="true">
      <div className="today-head">
        <div>
          <div className="skeleton skeleton-text lg" />
          <div className="skeleton skeleton-text sm" />
        </div>
      </div>
      <div className="today-main">
        <div className="skeleton today-skeleton-chips" />
        <div className="today-list">
          {[0, 1, 2, 3, 4].map((row) => <div key={row} className="today-row"><div className="skeleton skeleton-text" /></div>)}
        </div>
      </div>
    </div>
  );
}

export default function AppShell() {
  const { activeView, setActiveView, isMobile, isAdmin, isChild, messages, me, familyId, tasks, shoppingLists, demoMode, loading, navOrder, hiddenAreas = NO_HIDDEN_AREAS } = useApp();
  const [mobileSheet,setMobileSheet] = useState(null);
  const [createRequest,setCreateRequest] = useState(null);
  const [createKind, setCreateKind] = useState(null);
  const [sharedText, setSharedText] = useState('');
  useEffect(()=>{setMobileSheet(null);setCreateRequest(null);},[familyId]);

  // Home screen shortcuts (Tribu 2.0, N-3): start shopping or open "+" on
  // a kind, once the family has loaded.
  const launchHandled = useRef(false);
  useEffect(() => {
    if (launchHandled.current || loading || !me) return;
    launchHandled.current = true;
    const action = resolveLaunchAction(window.location.search);
    const shared = resolveSharedText(window.location.search);
    if (!action && !shared) return;
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.hash}`);
    // Shared from another app (Tribu 2.0, N-5): "+" opens with the text.
    if (shared) {
      setSharedText(shared);
      setMobileSheet('new');
      return;
    }
    if (action === 'shopping-trip') {
      try { sessionStorage.setItem('tribu_shopping_trip', '1'); } catch { /* private mode */ }
      setActiveView('shopping');
    } else if (!isChild) {
      setCreateKind(action === 'new-event' ? 'event' : 'shopping');
      setMobileSheet('new');
    }
  }, [loading, me, isChild, setActiveView]);
  useEffect(() => {
    if (mobileSheet === 'new') return;
    setCreateKind(null);
    setSharedText('');
  }, [mobileSheet]);
  const [collapsed, setCollapsed] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [notifPanelOpen, setNotifPanelOpen] = useState(false);
  const bellBtnRef = useRef(null);
  const notifPanelRef = useRef(null);

  // Ctrl+K / Cmd+K keyboard shortcut for search
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchQuery('');
        setSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(()=>{
    // Tasks open their own dialog from createRequest; shopping focuses its field.
    if(!createRequest || createRequest.kind!=='shopping')return;
    const frame=requestAnimationFrame(()=>{
      document.querySelector('#main-content .shop-add-form input, #main-content .shopping-item-suggest-field .quick-add-input')?.focus();
      setCreateRequest(null);
    });
    return ()=>cancelAnimationFrame(frame);
  },[activeView,createRequest]);
  const ActiveComponent = views[activeView] || TodayView;
  const openTaskCount = tasks.filter((tk) => tk.status === 'open').length;
  const totalUnchecked = shoppingLists.reduce((sum, l) => sum + (l.item_count - l.checked_count), 0);


  // Item registry: all possible nav items keyed by their route key
  const itemRegistry = useMemo(() => {
    const registry = {};
    for (const [key, meta] of Object.entries(NAV_ITEM_META)) {
      if (!isNavItemVisible(key, { isAdmin, isChild, demoMode, hiddenAreas })) continue;
      const item = { key, icon: meta.icon, label: t(messages, meta.labelKey) };
      if (key === 'shopping') item.badge = totalUnchecked || null;
      if (key === 'tasks') item.badge = openTaskCount || null;
      registry[key] = item;
    }
    return registry;
  }, [messages, totalUnchecked, openTaskCount, isAdmin, isChild, demoMode, hiddenAreas]);

  // A hidden area (a bookmark, another device) opens Today instead.
  useEffect(() => {
    if (hiddenAreas.includes(activeView)) setActiveView('dashboard');
  }, [hiddenAreas, activeView, setActiveView]);

  const accountItems = useMemo(
    () => ACCOUNT_NAV_KEYS.map((key) => itemRegistry[key]).filter(Boolean),
    [itemRegistry],
  );

  const navIndex = useMemo(() => {
    return new Map(navOrder.map((key, index) => [key, index]));
  }, [navOrder]);

  // Areas within a group follow the saved navigation order.
  const navGroups = useMemo(() => {
    return NAV_GROUPS
      .map((group) => ({
        ...group,
        label: t(messages, group.labelKey, group.fallback),
        items: group.itemKeys
          .filter((key) => key in itemRegistry)
          // A group's own overview stays first; its pages follow the order.
          .sort((a, b) => (b === group.pinned) - (a === group.pinned) || (navIndex.get(a) ?? 999) - (navIndex.get(b) ?? 999))
          .map((key) => itemRegistry[key]),
      }))
      .filter((group) => group.items.length > 0);
  }, [itemRegistry, messages, navIndex]);

  const navigate = useCallback((key) => {
    setActiveView(key);
    const item = itemRegistry[key];
    if (item) announce(item.label);
  }, [setActiveView, itemRegistry]);

  // A group opens the page used last in it.
  const lastInGroup = useRef({});
  useEffect(() => {
    const group = navGroupOf(activeView);
    if (group) lastInGroup.current[group.key] = activeView;
  }, [activeView]);
  const openGroup = useCallback((group) => {
    const last = lastInGroup.current[group.key];
    navigate(group.items.some((item) => item.key === last) ? last : group.items[0].key);
  }, [navigate]);

  // Escape closes the notification panel.
  useEffect(() => {
    if (!notifPanelOpen) return;
    function handleKeyDown(e) {
      if (e.key === 'Escape') closeNotifPanel();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [notifPanelOpen]);

  function closeNotifPanel() {
    setNotifPanelOpen(false);
    bellBtnRef.current?.focus();
  }

  // Pages opened from another page count as that page.
  const navKey = navKeyOf(activeView);
  const activeGroup = navGroups.find((group) => group.items.some((item) => item.key === navKey)) || null;
  const greetingKey = `module.dashboard.greeting_${new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'}`;
  const firstName = me?.display_name?.split(' ')[0] || '';
  // Children are greeted as on their Today (Tribu 2.0, F5).
  const headerTitle = activeView === 'dashboard'
    ? isChild && firstName
      ? t(messages, 'module.kids.hello').replace('{name}', firstName)
      : `${t(messages, greetingKey)}${firstName ? `, ${firstName}` : ''}`
    : activeGroup?.label || itemRegistry[activeView === 'admin' ? 'settings' : activeView]?.label || '';
  const sidebarClass = `sidebar${collapsed && !isMobile ? ' collapsed' : ''}`;

  return (
    <div className="app-shell">
      {demoMode && (
        <div className="demo-banner">
          {t(messages, 'demo_banner')}
        </div>
      )}

      {/* Sidebar: the same four areas with their pages (R6). */}
      <aside className={sidebarClass} aria-label="Tribu">
        <div className="sidebar-header">
          <div className="sidebar-brand">
            <div className="sidebar-logo">
              <Users size={20} color="white" aria-hidden="true" />
            </div>
            {!collapsed && (
              <div className="sidebar-brand-text">
                <h2>Tribu</h2>
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
          <nav className="nav-groups" aria-label={t(messages, 'aria.main_navigation')}>
            {navGroups.map((group) => (
              <section className={`nav-section nav-section-${group.key}`} aria-label={group.label} key={group.key}>
                {!collapsed && group.items.length > 1 && <div className="nav-section-label">{group.label}</div>}
                {group.items.map((item) => (
                  <button
                    key={item.key}
                    className={`nav-item${navKey === item.key ? ' active' : ''}`}
                    onClick={() => navigate(item.key)}
                    data-tooltip={item.label}
                    aria-current={navKey === item.key ? 'page' : undefined}
                  >
                    <span className="nav-icon" aria-hidden="true"><item.icon size={20} /></span>
                    {!collapsed && <span className="nav-label">{item.label}</span>}
                    {!collapsed && item.badge && <span className="nav-badge">{item.badge}</span>}
                  </button>
                ))}
              </section>
            ))}

          </nav>
        </div>
      </aside>

      {/* Main */}
      <main id="main-content" className="main-content" style={isMobile ? { marginLeft: 0, width: '100%' } : collapsed ? { marginLeft: 70, width: 'calc(100% - 70px)' } : undefined}>
        {!loading && (
          <AppHeader
            title={headerTitle}
            onSearch={() => setSearchOpen(true)}
            onNotifications={() => setNotifPanelOpen(true)}
            onAccount={() => setMobileSheet('account')}
            onCreate={() => setMobileSheet('new')}
            accountOpen={mobileSheet === 'account'}
            notificationButtonRef={bellBtnRef}
          />
        )}
        {isMobile && !loading && <SubNav group={activeGroup} items={activeGroup?.items || []} activeView={navKey} navigate={navigate} />}

        <div className="view-enter">
          {loading ? <TodaySkeleton messages={messages} /> : me?.must_change_password ? <ForcePasswordChange /> : !me?.has_completed_onboarding ? <OnboardingWizard /> : (
            <ActiveComponent
              onOpenCapture={() => setMobileSheet('new')}
              createRequest={createRequest}
              onCreateHandled={()=>setCreateRequest(null)}
            />
          )}
        </div>
      </main>

      <ResponsiveUI
        groups={navGroups}
        openGroup={openGroup}
        accountItems={accountItems}
        navigate={navigate}
        sheet={mobileSheet}
        setSheet={setMobileSheet}
        createKind={createKind}
        sharedText={sharedText}
        onCreate={(kind) => {
          const route = { event: 'calendar', task: 'tasks', shopping: 'shopping', meal: 'meal_plans' }[kind];
          navigate(route);
          setCreateRequest({ kind, id: Date.now() });
        }}
      />

      {/* Notification panel */}
      {notifPanelOpen && (
        <>
          <div className="notif-panel-backdrop" onClick={closeNotifPanel} />
          <div ref={notifPanelRef} className="notif-panel" role="dialog" aria-modal="true" aria-label={t(messages, 'notifications')}
            onKeyDown={(e) => {
              if (e.key !== 'Tab' || !notifPanelRef.current) return;
              const focusable = notifPanelRef.current.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
              if (focusable.length === 0) return;
              const first = focusable[0];
              const last = focusable[focusable.length - 1];
              if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
              else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
            }}
          >
            <NotificationCenter onClose={closeNotifPanel} />
          </div>
        </>
      )}

      {/* Live region for screen reader announcements */}
      <div id="a11y-announcer" className="sr-only" aria-live="polite" aria-atomic="true" />
      <SearchOverlay open={searchOpen} areas={[...navGroups.flatMap((group) => group.items), ...accountItems]} initialQuery={searchQuery} onClose={() => { setSearchOpen(false); setSearchQuery(''); }} />
    </div>
  );
}
