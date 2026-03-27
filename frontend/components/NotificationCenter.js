import { useEffect } from 'react';
import { Bell, CalendarDays, CheckSquare, Cake, Trash2, CheckCheck } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { t } from '../lib/i18n';
import * as api from '../lib/api';

const TYPE_ICONS = {
  event_reminder: CalendarDays,
  task_due: CheckSquare,
  birthday: Cake,
  system: Bell,
};

function timeAgo(dateStr, lang) {
  const now = new Date();
  const date = new Date(dateStr);
  const diff = Math.floor((now - date) / 1000);
  if (diff < 60) return lang === 'de' ? 'Gerade eben' : 'Just now';
  if (diff < 3600) {
    const m = Math.floor(diff / 60);
    return lang === 'de' ? `vor ${m} Min.` : `${m}m ago`;
  }
  if (diff < 86400) {
    const h = Math.floor(diff / 3600);
    return lang === 'de' ? `vor ${h} Std.` : `${h}h ago`;
  }
  const d = Math.floor(diff / 86400);
  return lang === 'de' ? `vor ${d} Tag${d > 1 ? 'en' : ''}` : `${d}d ago`;
}

export default function NotificationCenter() {
  const { messages, lang, notifications, setNotifications, unreadCount, setUnreadCount, loadNotifications, setActiveView } = useApp();

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  async function handleMarkRead(notif) {
    if (notif.read) return;
    const { ok } = await api.apiMarkNotificationRead(notif.id);
    if (ok) {
      setNotifications((prev) => prev.map((n) => n.id === notif.id ? { ...n, read: true } : n));
      setUnreadCount((c) => Math.max(0, c - 1));
    }
  }

  async function handleMarkAllRead() {
    const { ok } = await api.apiMarkAllNotificationsRead();
    if (ok) {
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    }
  }

  async function handleDelete(id) {
    const notif = notifications.find((n) => n.id === id);
    const { ok } = await api.apiDeleteNotification(id);
    if (ok) {
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      if (notif && !notif.read) setUnreadCount((c) => Math.max(0, c - 1));
    }
  }

  function handleClick(notif) {
    handleMarkRead(notif);
    if (notif.link) setActiveView(notif.link);
  }

  return (
    <div>
      <div className="view-header">
        <div>
          <h1 className="view-title">{t(messages, 'notifications')}</h1>
          <div className="view-subtitle">
            {unreadCount > 0
              ? `${unreadCount} ${t(messages, 'notifications_unread')}`
              : t(messages, 'notifications_all_read')}
          </div>
        </div>
        {unreadCount > 0 && (
          <button className="btn-ghost" onClick={handleMarkAllRead}>
            <CheckCheck size={16} /> {t(messages, 'notifications_mark_all_read')}
          </button>
        )}
      </div>

      <div className="stagger notif-list">
        {notifications.length === 0 && (
          <div className="notif-empty">
            <Bell size={32} className="notif-empty-icon" />
            <p>{t(messages, 'notifications_empty')}</p>
          </div>
        )}

        {notifications.map((notif) => {
          const Icon = TYPE_ICONS[notif.type] || Bell;
          return (
            <div
              key={notif.id}
              className={`notif-item${notif.read ? ' notif-item-read' : ' notif-item-unread'}`}
              onClick={() => handleClick(notif)}
            >
              <div className={`notif-icon${!notif.read ? ' notif-icon-unread' : ''}`}>
                <Icon size={18} />
              </div>
              <div className="notif-content">
                <div className="notif-header">
                  <div className={`notif-title${!notif.read ? ' notif-title-unread' : ''}`}>
                    {notif.title}
                  </div>
                  <span className="notif-time">
                    {timeAgo(notif.created_at, lang)}
                  </span>
                </div>
                {notif.body && (
                  <div className="notif-body">
                    {notif.body}
                  </div>
                )}
              </div>
              <button
                className="btn-ghost notif-delete"
                onClick={(e) => { e.stopPropagation(); handleDelete(notif.id); }}
                aria-label={t(messages, 'aria.delete_notification')}
              >
                <Trash2 size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
