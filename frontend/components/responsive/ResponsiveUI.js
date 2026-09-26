import {
  Users,
  Search,
  Menu,
  Plus,
  LayoutGrid,
  CalendarDays,
  ShoppingCart,
} from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { useCurrentMinute } from '../../hooks/useCurrentMinute';
import { useVisualViewport } from '../../hooks/useResponsiveUI';
import { t } from '../../lib/i18n';
import { plannerText } from './PlannerUI';
import MoreSheet from './MoreSheet';
import NewSheet from './NewSheet';

function MobileBadge({ count }) {
  return count > 0 ? (
    <span className="ui-count-badge" aria-hidden="true">
      {count > 99 ? '99+' : count}
    </span>
  ) : null;
}

export function MobileHeader({ onSearch, onMore, onHome, moreOpen }) {
  const { me, messages, unreadCount, showNotificationBadge = true } = useApp();
  const notificationCount = showNotificationBadge ? unreadCount : 0;
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
        aria-haspopup="dialog"
        aria-expanded={moreOpen}
        aria-description={notificationCount > 0 ? `${notificationCount} ${t(messages, 'notifications_unread')}` : undefined}
      >
        <Menu size={22} />
        <MobileBadge count={notificationCount} />
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
  onSearchAll,
  sheet,
  setSheet,
}) {
  const app = useApp();
  const { activeView, messages, isChild, unreadCount, showNotificationBadge = true } = app;
  const notificationCount = showNotificationBadge ? unreadCount : 0;
  const unreadDescription = notificationCount > 0 ? `${notificationCount} ${t(messages, 'notifications_unread')}` : undefined;
  const activeInMore = items.some(item => item.key === activeView && !['dashboard', 'calendar', 'shopping'].includes(item.key));
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
        {routes.map(([key, Icon, label]) => {
          const current = activeView === key || (key === 'more' && activeInMore);
          const count = key === 'more' ? notificationCount : items.find(item => item.key === key)?.badge;
          const name = plannerText(messages, label);
          const opensSheet = key === 'more' || key === 'new';
          return (
            <button
              type="button"
              key={key}
              disabled={key === 'new' && isChild}
              className={`ui-nav-button ${current || sheet === key ? 'active' : ''} ${key === 'new' ? 'ui-nav-new' : ''}`}
              aria-current={current ? 'page' : undefined}
              aria-haspopup={opensSheet ? 'dialog' : undefined}
              aria-expanded={opensSheet ? sheet === key : undefined}
              aria-description={key === 'more' ? unreadDescription : count > 0 ? `${name}: ${count}` : undefined}
              onClick={() =>
                key === 'more' || key === 'new' ? setSheet(key) : navigate(key)
              }
            >
              <span className={key === 'new' ? 'ui-nav-plus' : 'ui-nav-icon'}>
                <Icon size={21} />
                <MobileBadge count={count} />
              </span>
              <span>{name}</span>
            </button>
          );
        })}
      </nav>
      {sheet === 'more' && (
        <MoreSheet
          items={items}
          activeView={activeView}
          navigate={navigate}
          onClose={() => setSheet(null)}
          onNotifications={onNotifications}
          onLayout={onLayout}
          onSearchAll={(query) => {
            setSheet(null);
            onSearchAll(query);
          }}
        />
      )}
      {sheet === 'new' && !isChild && (
        <NewSheet onClose={() => setSheet(null)} onCreate={onCreate} />
      )}
    </>
  );
}
