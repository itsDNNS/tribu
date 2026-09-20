import { useState } from 'react';
import {
  Users,
  Search,
  Menu,
  Plus,
  LayoutGrid,
  CalendarDays,
  ShoppingCart,
  ListChecks,
  Utensils,
  Sun,
  Bell,
} from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { useCurrentMinute } from '../../hooks/useCurrentMinute';
import { useVisualViewport } from '../../hooks/useResponsiveUI';
import { t } from '../../lib/i18n';
import { plannerText } from './PlannerUI';
import CalendarDialog from '../calendar/CalendarDialog';
import QuickCaptureCard from '../QuickCaptureCard';

export function MobileHeader({ onSearch, onMore, onHome }) {
  const { me, messages } = useApp();
  const now = useCurrentMinute();
  const greeting = t(
    messages,
    `module.dashboard.greeting_${now.getHours() < 12 ? 'morning' : now.getHours() < 18 ? 'afternoon' : 'evening'}`,
  );
  return (
    <div className="mobile-header ui-mobile-header">
      <button
        className="ui-mobile-logo sidebar-logo"
        aria-label={t(messages, 'dashboard')}
        onClick={onHome}
      >
        <Users size={23} />
      </button>
      <div className="ui-welcome">
        <small>Tribu · Family OS</small>
        <strong>
          {greeting}, {me?.display_name?.split(' ')[0]}
        </strong>
      </div>
      <button
        className="ui-shell-icon"
        onClick={onSearch}
        aria-label={t(messages, 'search.placeholder')}
      >
        <Search size={22} />
      </button>
      <button
        className="ui-shell-icon"
        onClick={onMore}
        aria-label={t(messages, 'aria.open_menu')}
      >
        <Menu size={22} />
      </button>
    </div>
  );
}
export default function ResponsiveUI({
  items,
  navigate,
  onCreate,
  onNotifications,
  onLayout,
  sheet,
  setSheet,
}) {
  const app = useApp();
  const { activeView, messages, isChild, theme, setTheme, demoMode } = app;
  useVisualViewport();
  const routes = [
    ['dashboard', LayoutGrid, 'home'],
    ['calendar', CalendarDays, 'calendar'],
    ['new', Plus, 'new'],
    ['shopping', ShoppingCart, 'shopping'],
    ['more', Menu, 'more'],
  ];
  return (
    <>
      <nav
        hidden={!app.isMobile}
        className="bottom-nav ui-bottom-nav"
        aria-label={t(messages, 'aria.bottom_navigation')}
      >
        {routes.map(([key, Icon, label]) => (
          <button
            type="button"
            key={key}
            disabled={key === 'new' && isChild}
            className={`ui-nav-button ${activeView === key ? 'active' : ''} ${key === 'new' ? 'ui-nav-new' : ''}`}
            aria-current={activeView === key ? 'page' : undefined}
            onClick={() =>
              key === 'more' || key === 'new' ? setSheet(key) : navigate(key)
            }
          >
            <span className={key === 'new' ? 'ui-nav-plus' : ''}>
              <Icon size={21} />
            </span>
            <span>{plannerText(messages, label)}</span>
          </button>
        ))}
      </nav>
      {sheet && (
        <CalendarDialog
          title={plannerText(
            messages,
            sheet === 'more' ? 'all_areas' : 'capture_title',
          )}
          messages={messages}
          subtitle={null}
          onClose={() => setSheet(null)}
        >
          <div className="ui-menu-grid">
            {sheet === 'more'
              ? Object.values(items).map((item) => (
                  <button
                    key={item.key}
                    aria-current={activeView === item.key ? 'page' : undefined}
                    className="ui-menu-item"
                    onClick={() => {
                      setSheet(null);
                      navigate(item.key);
                    }}
                  >
                    <item.icon size={22} />
                    <strong>{item.label}</strong>
                  </button>
                ))
              : !isChild &&
                [
                  ['event', CalendarDays, 'calendar'],
                  ['task', ListChecks, 'module.tasks.name'],
                  ['shopping', ShoppingCart, 'module.shopping.name'],
                  ['meal', Utensils, 'module.meal_plans.name'],
                ].map(([kind, Icon, label]) => (
                  <button
                    key={kind}
                    className="ui-menu-item"
                    onClick={() => {
                      setSheet(null);
                      onCreate(kind);
                    }}
                  >
                    <Icon size={22} />
                    <strong>{t(messages, label)}</strong>
                  </button>
                ))}
          </div>
          {sheet === 'more' ? (
            <div className="ui-menu-foot">
              {onLayout && (
                <button
                  className="tc-btn mobile-dashboard-layout-btn"
                  onClick={() => {
                    setSheet(null);
                    onLayout.onClick();
                  }}
                >
                  {onLayout.label}
                </button>
              )}
              {app.families?.length > 1 && (
                <select
                  aria-label={plannerText(messages, 'family_filter')}
                  value={app.familyId}
                  onChange={(e) => app.switchFamily(e.target.value)}
                >
                  {app.families.map((f) => (
                    <option key={f.family_id} value={f.family_id}>
                      {f.family_name}
                    </option>
                  ))}
                </select>
              )}
              <button
                className="tc-btn"
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              >
                <Sun size={18} />
                {plannerText(messages, 'theme')}
              </button>
              <button
                className="tc-btn"
                onClick={() => {
                  setSheet(null);
                  onNotifications();
                }}
              >
                <Bell size={18} />
                {t(messages, 'notifications')}
              </button>
              <button
                className="tc-btn"
                onClick={app.logout}
                aria-label={t(messages, 'aria.logout')}
              >
                {t(messages, 'aria.logout')}
              </button>
            </div>
          ) : (
            !isChild &&
            !demoMode && (
              <QuickCaptureCard
                {...app}
                inbox={[]}
                setActiveView={(view) => {
                  setSheet(null);
                  navigate(view);
                }}
              />
            )
          )}
        </CalendarDialog>
      )}
    </>
  );
}
