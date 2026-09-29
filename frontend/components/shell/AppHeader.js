import { useEffect, useState } from 'react';
import { Bell, Plus, Search } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { t } from '../../lib/i18n';
import { plannerText } from '../responsive/PlannerUI';
import MemberAvatar from '../MemberAvatar';

// The one header of every page (Tribu 2.0, R5): where you are on phones,
// search, the global "+" on wide screens (phones have it in the tab bar),
// alerts and the account menu. It tightens once the page scrolls.
export default function AppHeader({ title, onSearch, onNotifications, onAccount, onCreate, accountOpen = false, notificationButtonRef = null }) {
  const { me, members = [], profileImage, messages, unreadCount, showNotificationBadge = true } = useApp();
  const [scrolled, setScrolled] = useState(false);
  const count = showNotificationBadge ? unreadCount : 0;
  const own = members.find((member) => member.user_id === me?.user_id)
    || { display_name: me?.display_name, profile_image: profileImage };

  useEffect(() => {
    const onScroll = (event) => {
      const target = event.target === document ? document.scrollingElement : event.target;
      if (target && typeof target.scrollTop === 'number') setScrolled(target.scrollTop > 8);
    };
    document.addEventListener('scroll', onScroll, { capture: true, passive: true });
    return () => document.removeEventListener('scroll', onScroll, { capture: true });
  }, []);

  return (
    <header className={`app-header${scrolled ? ' scrolled' : ''}`}>
      <div className="app-header-title">{title}</div>
      <button type="button" className="app-header-search" onClick={onSearch} aria-label={t(messages, 'search.placeholder')}>
        <Search size={18} aria-hidden="true" />
        <span className="app-header-search-text" aria-hidden="true">{t(messages, 'search.placeholder')}</span>
        <kbd aria-hidden="true">⌘K</kbd>
      </button>
      {typeof onCreate === 'function' && (
        <button type="button" className="app-header-new" onClick={onCreate} aria-haspopup="dialog">
          <Plus size={18} aria-hidden="true" />
          {plannerText(messages, 'new')}
        </button>
      )}
      <button
        ref={notificationButtonRef}
        type="button"
        className="app-header-icon"
        onClick={onNotifications}
        aria-label={t(messages, 'notifications')}
        aria-description={count > 0 ? `${count} ${t(messages, 'notifications_unread')}` : undefined}
      >
        <Bell size={20} aria-hidden="true" />
        {count > 0 && <span className="app-header-badge" aria-hidden="true">{count > 99 ? '99+' : count}</span>}
      </button>
      <button
        type="button"
        className="app-header-avatar"
        onClick={onAccount}
        aria-label={t(messages, 'nav.account_menu')}
        aria-haspopup="dialog"
        aria-expanded={accountOpen}
      >
        <MemberAvatar member={own} size={34} />
      </button>
    </header>
  );
}
