import { createContext, useCallback, useContext, useRef, useState } from 'react';

const ToastContext = createContext(null);

let nextId = 1;
const MAX_VISIBLE = 3;
const AUTO_DISMISS_MS = 3500;
const ACTION_DISMISS_MS = 6000;
const EXIT_ANIMATION_MS = 300;

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timersRef = useRef({});

  const dismiss = useCallback((id) => {
    // Start exit animation
    setToasts((prev) => prev.map((t) => t.id === id ? { ...t, exiting: true } : t));
    // Remove from DOM after animation
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
      clearTimeout(timersRef.current[id]);
      delete timersRef.current[id];
    }, EXIT_ANIMATION_MS);
  }, []);

  const dismissAll = useCallback(() => {
    setToasts((prev) => prev.map((t) => ({ ...t, exiting: true })));
    setTimeout(() => {
      setToasts([]);
      Object.values(timersRef.current).forEach(clearTimeout);
      timersRef.current = {};
    }, EXIT_ANIMATION_MS);
  }, []);

  const toast = useCallback(({ message, type = 'info', action = null }) => {
    const id = nextId++;
    const duration = action ? ACTION_DISMISS_MS : AUTO_DISMISS_MS;

    setToasts((prev) => {
      const next = [...prev, { id, message, type, action, exiting: false }];
      // If over max, dismiss the oldest non-exiting toast
      if (next.filter((t) => !t.exiting).length > MAX_VISIBLE) {
        const oldest = next.find((t) => !t.exiting);
        if (oldest) {
          clearTimeout(timersRef.current[oldest.id]);
          delete timersRef.current[oldest.id];
          return next.filter((t) => t.id !== oldest.id);
        }
      }
      return next;
    });

    timersRef.current[id] = setTimeout(() => dismiss(id), duration);
    return id;
  }, [dismiss]);

  const success = useCallback((message, action) => toast({ message, type: 'success', action }), [toast]);
  const error = useCallback((message, action) => toast({ message, type: 'error', action }), [toast]);
  const info = useCallback((message, action) => toast({ message, type: 'info', action }), [toast]);

  return (
    <ToastContext.Provider value={{ toast, success, error, info, dismiss, dismissAll, toasts }}>
      {children}
    </ToastContext.Provider>
  );
}
