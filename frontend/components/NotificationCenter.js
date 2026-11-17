import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, CalendarClock, CalendarDays, CheckSquare, Cake, Trash2, CheckCheck, Utensils, X } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { useToast } from '../contexts/ToastContext';
import { t, tc } from '../lib/i18n';
import * as api from '../lib/api';
import { parseServerInstant, serverTimeAgo } from '../lib/helpers';
import { notificationLinkView } from '../lib/notificationLinks';
import { UNDO_WINDOW_MS } from '../lib/undo';

const TYPE_ICONS = {
  event_reminder: CalendarDays,
  task_due: CheckSquare,
  birthday: Cake,
  meal_reminder: Utensils,
  duty_week: CalendarClock,
  system: Bell,
};

// Server-generated system notifications arrive in English; show them in the UI language.
export function renderNotificationTitle(notif, messages) {
  if (notif?.type === 'system' && notif.title === 'Tribu restarted unexpectedly') {
    return t(messages, 'notification_title_backend_crashes');
  }
  return notif?.title;
}

export function renderNotificationBody(notif, messages) {
  if (!notif?.body) return null;

  if (notif.type === 'system') {
    const match = notif.body.match(/^The server stopped unexpectedly (\d+) times in the last hour\.$/);
    if (match) {
      return tc(messages, 'notification_body_backend_crashes', Number(match[1]));
    }
  }

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

// A reminder whose moment has passed (the event started, the birthday is
// over) is no longer true; the server stops listing it, and an open panel
// should not keep showing it either.
export function isNotificationExpired(notif, now = Date.now()) {
  const expiresAt = parseServerInstant(notif?.expires_at);
  return Boolean(expiresAt) && !Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() <= now;
}

export default function NotificationCenter({ onClose } = {}) {
  const { messages, lang, notifications, setNotifications, setUnreadCount, loadNotifications, setActiveView, isAdmin, isChild, demoMode } = useApp();
  const { success: toastSuccess, error: toastError, dismiss: dismissToast } = useToast();
  const closeBtnRef = useRef(null);
  const headingRef = useRef(null);

  // "Delete all" waits for the undo window before it is sent, like deleting
  // tasks or shopping items. Until then the list hides what it will delete.
  const pendingClearRef = useRef(null);
  const [clearedUpTo, setClearedUpTo] = useState(null);

  const runPendingClear = useCallback(async () => {
    const pending = pendingClearRef.current;
    if (!pending) return;
    pendingClearRef.current = null;
    clearTimeout(pending.timer);
    // Sent early when the panel closes or the page hides: its Undo could no longer take it back.
    dismissToast(pending.toastId);
    let ok = false;
    try {
      ({ ok } = await api.apiDeleteAllNotifications(pending.upToId));
    } catch {
      ok = false;
    }
    if (ok) {
      setNotifications((prev) => prev.filter((n) => n.id > pending.upToId));
    } else {
      toastError(t(messages, 'toast.error'));
      setUnreadCount((c) => c + pending.unread);
    }
    setClearedUpTo(null);
  }, [dismissToast, messages, setNotifications, setUnreadCount, toastError]);

  // Closing the panel, leaving the page or hiding it sends what is still
  // waiting. The ref keeps the listeners stable across re-renders.
  const runPendingClearRef = useRef(runPendingClear);
  runPendingClearRef.current = runPendingClear;

  useEffect(() => {
    const flush = () => runPendingClearRef.current();
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, []);

  const now = Date.now();
  const shown = notifications.filter((n) => (clearedUpTo === null || n.id > clearedUpTo) && !isNotificationExpired(n, now));
  const hasUnreadShown = shown.some((n) => !n.read);

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

  function handleDeleteAll() {
    if (pendingClearRef.current || shown.length === 0) return;
    const upToId = Math.max(...shown.map((n) => n.id));
    const unread = shown.filter((n) => !n.read).length;
    setClearedUpTo(upToId);
    setUnreadCount((c) => Math.max(0, c - unread));
    const pending = { upToId, unread, timer: setTimeout(() => runPendingClearRef.current(), UNDO_WINDOW_MS) };
    pendingClearRef.current = pending;
    pending.toastId = toastSuccess(t(messages, 'notifications_deleted_all'), {
      label: t(messages, 'module.shopping.undo'),
      onClick: () => {
        const waiting = pendingClearRef.current;
        if (!waiting) return;
        clearTimeout(waiting.timer);
        pendingClearRef.current = null;
        setClearedUpTo(null);
        setUnreadCount((c) => c + waiting.unread);
      },
    });
    // The pressed button goes away with the list; keep focus in the panel.
    (closeBtnRef.current || headingRef.current)?.focus();
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

    shown.forEach(n => {
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
        <>
          <div className="notif-panel-header">
            <h2 className="notif-panel-title">{t(messages, 'notifications')}</h2>
            <button type="button" ref={closeBtnRef} className="btn-ghost notif-delete" onClick={onClose} aria-label={t(messages, 'close')}>
              <X size={16} />
            </button>
          </div>
          {shown.length > 0 && (
            <div className="notif-panel-actions">
              {hasUnreadShown && (
                <button type="button" className="bento-empty-action" onClick={handleMarkAllRead}>
                  <CheckCheck size={14} aria-hidden="true" /> {t(messages, 'notifications_mark_all_read')}
                </button>
              )}
              <button type="button" className="bento-empty-action notif-delete-all" onClick={handleDeleteAll}>
                <Trash2 size={14} aria-hidden="true" /> {t(messages, 'notifications_delete_all')}
              </button>
            </div>
          )}
        </>
      ) : (
        <header className="list-header notifications-list-header">
          <h1 ref={headingRef} tabIndex={-1}>{t(messages, 'notifications')}</h1>
          {hasUnreadShown && (
            <button type="button" className="list-header-action" onClick={handleMarkAllRead}>
              <CheckCheck size={16} aria-hidden="true" /> {t(messages, 'notifications_mark_all_read')}
            </button>
          )}
          {shown.length > 0 && (
            <button type="button" className="list-header-action notif-delete-all" onClick={handleDeleteAll}>
              <Trash2 size={16} aria-hidden="true" /> {t(messages, 'notifications_delete_all')}
            </button>
          )}
        </header>
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
        {shown.length === 0 && (
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
                        {renderNotificationTitle(notif, messages)}
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

        {shown.length > 0 && (
          <p className="notif-cleanup-hint">{t(messages, 'notifications_read_cleanup_hint')}</p>
        )}
      </div>
    </div>
  );
}
