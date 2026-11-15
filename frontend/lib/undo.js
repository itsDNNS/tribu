// How long a deletion or completion can be undone before it reaches the
// server. A toast with an action stays exactly this long
// (contexts/ToastContext.js) and does not pause, so its Undo never outlives it.
export const UNDO_WINDOW_MS = 10000;
