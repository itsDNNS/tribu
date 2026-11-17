// "Delete all" in the notification panel waits for the undo window before
// it reaches the server, like deleting tasks or shopping items. The waiting
// delete lives here, outside the panel, so closing the panel or switching
// apps keeps its Undo; it is sent once the window is over, or right away
// when the page is unloaded.
import * as api from './api';
import { UNDO_WINDOW_MS } from './undo';

let pending = null;
let nextToken = 1;
let unloadHooked = false;

// Notifications up to this id are waiting to be deleted, or null.
export function pendingClearCutoff() {
  return pending ? pending.upToId : null;
}

// The list without what is waiting to be deleted.
export function withoutPendingClear(notifications) {
  const cutoff = pendingClearCutoff();
  return cutoff === null ? notifications : notifications.filter((n) => n.id > cutoff);
}

function sendOnUnload() {
  // keepalive lets the request outlive the page.
  commitPendingClear({ keepalive: true });
}

function hookUnload() {
  if (unloadHooked || typeof window === 'undefined') return;
  unloadHooked = true;
  window.addEventListener('pagehide', sendOnUnload);
  // A frozen background page may be discarded without another event.
  document.addEventListener('freeze', sendOnUnload);
}

/**
 * Starts waiting to delete everything up to ``upToId``. A second "delete
 * all" inside the window takes the first one over, with one Undo for both.
 * Returns the token its Undo has to present.
 */
export function startPendingClear({ upToId, removed = [], dismissToast, onCommitted, onFailed }) {
  let carried = [];
  if (pending) {
    clearTimeout(pending.timer);
    pending.dismissToast?.(pending.toastId);
    carried = pending.removed;
    upToId = Math.max(upToId, pending.upToId);
  }
  const token = nextToken++;
  pending = {
    token,
    upToId,
    removed: [...removed, ...carried.filter((old) => !removed.some((n) => n.id === old.id))],
    dismissToast,
    onCommitted,
    onFailed,
    toastId: null,
    timer: setTimeout(() => commitPendingClear(), UNDO_WINDOW_MS),
  };
  hookUnload();
  return token;
}

export function setPendingClearToast(token, toastId) {
  if (pending?.token === token) pending.toastId = toastId;
}

export async function commitPendingClear({ keepalive = false } = {}) {
  const current = pending;
  if (!current) return;
  pending = null;
  clearTimeout(current.timer);
  current.dismissToast?.(current.toastId);
  let ok = false;
  try {
    ({ ok } = await api.apiDeleteAllNotifications(current.upToId, { keepalive }));
  } catch {
    ok = false;
  }
  if (keepalive) return;
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
  const current = pending;
  pending = null;
  clearTimeout(current.timer);
  current.dismissToast?.(current.toastId);
  return current;
}

// Tests only: forget a waiting delete without sending it.
export function resetPendingClearForTests() {
  if (pending) clearTimeout(pending.timer);
  pending = null;
}
