import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { useApp } from './AppContext';
import { announce } from '../lib/announce';
import { t } from '../lib/i18n';
import { UNDO_WINDOW_MS } from '../lib/undo';

const ToastContext = createContext(null);

let nextId = 1;
const MAX_VISIBLE = 3;
const AUTO_DISMISS_MS = 5000;
const ACTION_DISMISS_MS = UNDO_WINDOW_MS;
const EXIT_ANIMATION_MS = 300;

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

export function ToastProvider({ children }) {
  // A ref, so toast() keeps its identity for the callers' effect dependencies.
  const messagesRef = useRef({});
  messagesRef.current = useApp()?.messages || {};
  const [toasts, setToasts] = useState([]);
  // id -> { timer, remaining, startedAt, pausable }; plain toasts wait while hovered or focused.
  const timersRef = useRef({});
  const pausedRef = useRef(false);

  const clearTimer = (id) => {
    clearTimeout(timersRef.current[id]?.timer);
    delete timersRef.current[id];
  };

  const dismiss = useCallback((id) => {
    clearTimer(id);
    // Start exit animation
    setToasts((prev) => prev.map((t) => t.id === id ? { ...t, exiting: true } : t));
    // Remove from DOM after animation
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, EXIT_ANIMATION_MS);
  }, []);

  const startTimer = useCallback((id, remaining, pausable) => {
    const timer = pausable && pausedRef.current ? null : setTimeout(() => dismiss(id), remaining);
    timersRef.current[id] = { timer, remaining, startedAt: Date.now(), pausable };
  }, [dismiss]);

  const setPaused = useCallback((paused) => {
    if (pausedRef.current === paused) return;
    pausedRef.current = paused;
    for (const [id, entry] of Object.entries(timersRef.current)) {
      // An Undo toast keeps to the undo window: its action does nothing afterwards.
      if (!entry.pausable) continue;
      if (paused) {
        clearTimeout(entry.timer);
        entry.timer = null;
        entry.remaining -= Date.now() - entry.startedAt;
      } else {
        startTimer(Number(id), Math.max(entry.remaining, 1000), true);
      }
    }
  }, [startTimer]);

  const dismissAll = useCallback(() => {
    setToasts((prev) => prev.map((t) => ({ ...t, exiting: true })));
    setTimeout(() => {
      setToasts([]);
      Object.values(timersRef.current).forEach((entry) => clearTimeout(entry.timer));
      timersRef.current = {};
    }, EXIT_ANIMATION_MS);
  }, []);

  const toast = useCallback(({ message, type = 'info', action = null }) => {
    const id = nextId++;

    setToasts((prev) => {
      const next = [...prev, { id, message, type, action, exiting: false }];
      // If over max, dismiss the oldest non-exiting toast
      if (next.filter((t) => !t.exiting).length > MAX_VISIBLE) {
        const oldest = next.find((t) => !t.exiting);
        if (oldest) {
          clearTimer(oldest.id);
          return next.filter((t) => t.id !== oldest.id);
        }
      }
      return next;
    });

    startTimer(id, action ? ACTION_DISMISS_MS : AUTO_DISMISS_MS, !action);
    // Only the visible text is announced; an Undo button is mentioned, not read out.
    announce(action ? `${message} ${t(messagesRef.current, 'toast.actions_available')}` : message);
    return id;
  }, [startTimer]);

  const success = useCallback((message, action) => toast({ message, type: 'success', action }), [toast]);
  const error = useCallback((message, action) => toast({ message, type: 'error', action }), [toast]);
  const info = useCallback((message, action) => toast({ message, type: 'info', action }), [toast]);

  return (
    <ToastContext.Provider value={{ toast, success, error, info, dismiss, dismissAll, setPaused, toasts }}>
      {children}
    </ToastContext.Provider>
  );
}
