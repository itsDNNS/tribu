import { useEffect, useRef } from 'react';
import { Bell, CalendarDays, CheckSquare, Cake, Trash2, CheckCheck, X } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { t } from '../lib/i18n';
import * as api from '../lib/api';
import { parseServerInstant, serverTimeAgo } from '../lib/helpers';
import { notificationLinkView } from '../lib/notificationLinks';

const TYPE_ICONS = {
  event_reminder: CalendarDays,
  task_due: CheckSquare,
  birthday: Cake,
  system: Bell,
};

function renderNotificationBody(notif, messages) {
  if (!notif?.body) return null;

  if (notif.type === 'event_reminder') {
    const match = notif.body.match(/^Starts in (\d+) minutes$/);
    if (match) {
      return t(messages, 'notification_body_event_starts_in').replace('{count}', match[1]);
    }
  }

  if (notif.type === 'task_due' && notif.body === 'Task is overdue') {
    return t(messages, 'notification_body_task_overdue');
  }

  if (notif.type === 'birthday') {
    const match = notif.body.match(/^Birthday tomorrow \((.+)\)$/);
    if (match) {
      return t(messages, 'notification_body_birthday_tomorrow').replace('{date}', match[1]);
    }
  }

  return notif.body;
}

export default function NotificationCenter({ onClose } = {}) {
  const { messages, lang, notifications, setNotifications, unreadCount, setUnreadCount, loadNotifications, setActiveView, isAdmin, isChild, demoMode } = useApp();
  const closeBtnRef = useRef(null);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  // Focus close button once when panel opens (empty deps to avoid re-steal)
  useEffect(() => {
    if (onClose) closeBtnRef.current?.focus();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
    if (notif.link) {
      if (onClose) onClose();
      setActiveView(notificationLinkView(notif.link));
    }
  }

  function handleConfigureHouseholdNotifications() {
    if (typeof window !== 'undefined') sessionStorage.setItem('tribu_settings_tab', 'notification_destinations');
    if (onClose) onClose();
    setActiveView('settings');
  }

  const canManageHouseholdDestinations = !onClose && isAdmin && !isChild && !demoMode;

  // Group notifications by time period
  const groups = (() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterdayStart = new Date(todayStart.getTime() - 86400000);

    const today = [];
    const yesterday = [];
    const older = [];

    notifications.forEach(n => {
      const d = parseServerInstant(n.created_at);
      if (d >= todayStart) today.push(n);
      else if (d >= yesterdayStart) yesterday.push(n);
      else older.push(n);
    });

    const result = [];
    if (today.length) result.push({ label: t(messages, 'notifications_group_today'), items: today });
    if (yesterday.length) result.push({ label: t(messages, 'notifications_group_yesterday'), items: yesterday });
    if (older.length) result.push({ label: t(messages, 'notifications_group_older'), items: older });
    return result;
  })();

  return (
    <div className={onClose ? 'notifications-panel-content' : 'notifications-page'}>
      {onClose ? (
        <div className="notif-panel-header">
          <h2 className="notif-panel-title">{t(messages, 'notifications')}</h2>
          {unreadCount > 0 && (
            <button className="bento-empty-action" onClick={handleMarkAllRead}>
              <CheckCheck size={14} /> {t(messages, 'notifications_mark_all_read')}
            </button>
          )}
          <button ref={closeBtnRef} className="btn-ghost notif-delete" onClick={onClose} aria-label={t(messages, 'close')}>
            <X size={16} />
          </button>
        </div>
      ) : (
        <div className="view-header notifications-header">
          <div className="notifications-title-block">
            <span className="notifications-page-icon" aria-hidden="true">
              <Bell size={22} />
            </span>
            <div>
              <h1 className="view-title">{t(messages, 'notifications')}</h1>
              <div className="view-subtitle">
                {unreadCount > 0
                  ? `${unreadCount} ${t(messages, 'notifications_unread')}`
                  : t(messages, 'notifications_all_read')}
              </div>
            </div>
          </div>
          {unreadCount > 0 && (
            <button className="btn-ghost" onClick={handleMarkAllRead}>
              <CheckCheck size={16} /> {t(messages, 'notifications_mark_all_read')}
            </button>
          )}
        </div>
      )}

      {canManageHouseholdDestinations && (
        <div className="notif-empty notification-destination-callout">
          <Bell size={24} className="notif-empty-icon" />
          <p><strong>{t(messages, 'notifications_external_destinations_title')}</strong></p>
          <p>{t(messages, 'notifications_external_destinations_help')}</p>
          <button type="button" className="bento-empty-action" onClick={handleConfigureHouseholdNotifications}>
            {t(messages, 'notifications_external_destinations_action')}
          </button>
        </div>
      )}

      <div className="stagger notif-list">
        {notifications.length === 0 && (
          <div className="notif-empty">
            <Bell size={32} className="notif-empty-icon" />
            <p>{t(messages, 'notifications_empty')}</p>
          </div>
        )}

        {groups.map(group => (
          <div key={group.label}>
            <div className="notif-group-header">{group.label}</div>
            {group.items.map(notif => {
              const Icon = TYPE_ICONS[notif.type] || Bell;
              const body = renderNotificationBody(notif, messages);
              return (
                <div
                  key={notif.id}
                  className={`notif-item${notif.read ? ' notif-item-read' : ' notif-item-unread'}`}
                  onClick={() => handleClick(notif)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); handleClick(notif); } }}
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
                        {serverTimeAgo(notif.created_at, lang)}
                      </span>
                    </div>
                    {body && (
                      <div className="notif-body">
                        {body}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
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
        ))}
      </div>
    </div>
  );
}
