import { parseServerInstant } from './helpers';

// A reminder whose moment has passed (the event started, the birthday is
// over) is no longer true. The server stops listing it; the app drops it
// from an open list at that moment too.
export function notificationExpiry(notif) {
  const expiresAt = parseServerInstant(notif?.expires_at);
  if (!expiresAt || Number.isNaN(expiresAt.getTime())) return null;
  return expiresAt.getTime();
}

export function isNotificationExpired(notif, now = Date.now()) {
  const expiry = notificationExpiry(notif);
  return expiry !== null && expiry <= now;
}

// The soonest expiry still ahead, or null.
export function nextNotificationExpiry(notifications, now = Date.now()) {
  let next = null;
  for (const notif of notifications) {
    const expiry = notificationExpiry(notif);
    if (expiry !== null && expiry > now && (next === null || expiry < next)) next = expiry;
  }
  return next;
}
