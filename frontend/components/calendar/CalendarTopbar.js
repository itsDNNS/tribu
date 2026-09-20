import { Bell, Search, Sun, Moon } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { useCurrentMinute } from '../../hooks/useCurrentMinute';
import { DashboardWelcome } from '../DashboardDetails';
import { t } from '../../lib/i18n';

export default function CalendarTopbar({ onOpenSearch, onOpenNotifications, notificationButtonRef, unreadCount = 0 }) {
  const { me, lang, messages, timeFormat, theme, setTheme } = useApp();
  const now = useCurrentMinute();
  const locale = lang === 'de' ? 'de-DE' : 'en-US';
  const hour = now.getHours();
  const greeting = t(messages, `module.dashboard.greeting_${hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'}`);
  return <div className="today-command-header tc-topbar">
    <div><div className="today-command-title">{greeting}, <span>{me?.display_name}</span></div><p className="today-command-family"><span>{now.toLocaleDateString(locale,{weekday:'long',day:'numeric',month:'long',year:'numeric'})}</span><span aria-hidden="true"> · </span><time className="today-command-clock" dateTime={now.toISOString()}>{now.toLocaleTimeString(locale,{hour:timeFormat==='12h'?'numeric':'2-digit',minute:'2-digit',hour12:timeFormat==='12h'})}</time><DashboardWelcome messages={messages} /></p></div>
    <div className="dashboard-header-actions">{onOpenSearch && <button className="dashboard-search-btn" onClick={onOpenSearch}><Search size={16} /><span className="dashboard-search-placeholder">{t(messages,'search.placeholder')}</span><kbd className="dashboard-search-kbd">⌘K</kbd></button>}{onOpenNotifications && <button ref={notificationButtonRef} className="dashboard-icon-action" aria-label={t(messages,'notifications')} onClick={onOpenNotifications}><Bell size={17} />{unreadCount > 0 && <span className="dashboard-action-badge">{unreadCount}</span>}</button>}{setTheme && <button className="dashboard-icon-action" aria-label={t(messages,'module.dashboard.toggle_theme')} onClick={()=>setTheme(theme==='light'?'dark':'light')}>{theme==='light'?<Sun size={20}/>:<Moon size={20}/>}</button>}<span className="tc-topbar-note">{t(messages,'module.dashboard.family_note')} <span>♥</span></span></div>
  </div>;
}
