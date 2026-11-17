// "Delete all" in the notification panel waits for the undo window before
// it reaches the server, like deleting tasks or shopping items. The waiting
// delete lives here, outside the panel, so closing the panel or switching
// apps keeps its Undo. It belongs to the account that started it: signing
// out or another account signing in drops it without sending.
import * as api from './api';
import { UNDO_WINDOW_MS } from './undo';

let pending = null;
let nextToken = 1;
let currentUserId = null;
let lifecycleHooked = false;

function stopTimer(current) {
  clearTimeout(current.timer);
  current.timer = null;
}

function startTimer(current, ms) {
  current.deadline = Date.now() + ms;
  current.timer = setTimeout(() => commitPendingClear(), ms);
}

// Drops the waiting delete without sending it.
function drop() {
  const current = pending;
  if (!current) return null;
  pending = null;
  stopTimer(current);
  current.dismissToast?.(current.toastId);
  return current;
}

// A page kept for "back" or frozen in the background keeps its countdown
// where it was; only a real unload sends what is waiting. A tab that is
// killed while frozen simply does not delete, and the person can delete again.
function pause() {
  if (!pending || pending.timer === null) return;
  pending.remaining = Math.max(0, pending.deadline - Date.now());
  stopTimer(pending);
}

function resume() {
  if (!pending || pending.timer !== null) return;
  startTimer(pending, pending.remaining ?? 0);
}

function onPageHide(event) {
  if (event.persisted) pause();
  // keepalive lets the request outlive the page.
  else commitPendingClear({ keepalive: true });
}

function onPageShow(event) {
  if (event.persisted) resume();
}

function hookLifecycle() {
  if (lifecycleHooked || typeof window === 'undefined') return;
  lifecycleHooked = true;
  window.addEventListener('pagehide', onPageHide);
  window.addEventListener('pageshow', onPageShow);
  document.addEventListener('freeze', pause);
  document.addEventListener('resume', resume);
}

// The signed-in account; null when signed out. A waiting delete of another
// account is dropped.
export function setPendingClearUser(userId) {
  currentUserId = userId ?? null;
  if (pending && pending.userId !== currentUserId) drop();
}

// Signing out: drop what is waiting, never send it.
export function cancelPendingClear() {
  drop();
}

// The list of ``userId`` without what that account is about to delete.
export function withoutPendingClear(notifications, userId) {
  if (!pending || pending.userId !== userId) return notifications;
  return notifications.filter((n) => n.id > pending.upToId);
}

/**
 * Starts waiting to delete everything of ``userId`` up to ``upToId``. A
 * second "delete all" inside the window takes the first one over, with one
 * Undo for both. Returns the token its Undo has to present.
 */
export function startPendingClear({ userId, upToId, removed = [], dismissToast, onCommitted, onFailed }) {
  let carried = [];
  if (pending && pending.userId === userId) {
    carried = pending.removed;
    upToId = Math.max(upToId, pending.upToId);
  }
  drop();
  const token = nextToken++;
  pending = {
    token,
    userId,
    upToId,
    removed: [...removed, ...carried.filter((old) => !removed.some((n) => n.id === old.id))],
    dismissToast,
    onCommitted,
    onFailed,
    toastId: null,
    timer: null,
  };
  startTimer(pending, UNDO_WINDOW_MS);
  hookLifecycle();
  return token;
}

export function setPendingClearToast(token, toastId) {
  if (pending?.token === token) pending.toastId = toastId;
}

export async function commitPendingClear({ keepalive = false } = {}) {
  const current = drop();
  if (!current || current.userId !== currentUserId) return;
  let ok = false;
  try {
    ({ ok } = await api.apiDeleteAllNotifications(current.upToId, { keepalive, userId: current.userId }));
  } catch {
    ok = false;
  }
  if (keepalive) return;
  // Another account may have signed in while the request was on its way;
  // its list must not get the previous account's rows back.
  if (current.userId !== currentUserId) return;
  if (ok) current.onCommitted?.(current);
  else current.onFailed?.(current);
}

/**
 * Cancels the waiting delete if ``token`` is still the current one and
 * returns it; an Undo button of an earlier, already replaced or finished
 * delete gets null and does nothing.
 */
export function undoPendingClear(token) {
  if (!pending || pending.token !== token) return null;
  return drop();
}

// Tests only: forget a waiting delete without sending it.
export function resetPendingClearForTests() {
  if (pending) stopTimer(pending);
  pending = null;
}
