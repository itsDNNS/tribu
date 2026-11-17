import { useEffect, useState } from 'react';
import { isNotificationExpired, nextNotificationExpiry } from '../lib/notificationExpiry';

// Longest single wait; setTimeout cannot wait much longer than 24 days.
const MAX_WAIT_MS = 6 * 60 * 60 * 1000;

/**
 * Drops notifications from the list (and their unread ones from the badge)
 * the moment they expire, also while nothing else re-renders the app.
 */
export function useNotificationExpiry(notifications, setNotifications, setUnreadCount) {
  const [wakeUps, setWakeUps] = useState(0);

  useEffect(() => {
    const prune = () => {
      const now = Date.now();
      const expired = notifications.filter((n) => isNotificationExpired(n, now));
      if (!expired.length) return false;
      const ids = new Set(expired.map((n) => n.id));
      setNotifications((prev) => prev.filter((n) => !ids.has(n.id)));
      const unread = expired.filter((n) => !n.read).length;
      if (unread) setUnreadCount((count) => Math.max(0, count - unread));
      return true;
    };
    if (prune()) return undefined;
    const next = nextNotificationExpiry(notifications);
    if (next === null) return undefined;
    const timer = setTimeout(() => {
      // Nothing expired yet after a capped wait: look again.
      if (!prune()) setWakeUps((n) => n + 1);
    }, Math.min(Math.max(next - Date.now(), 0) + 50, MAX_WAIT_MS));
    return () => clearTimeout(timer);
  }, [notifications, setNotifications, setUnreadCount, wakeUps]);
}
