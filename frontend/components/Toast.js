import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { useToast } from '../contexts/ToastContext';
import { t } from '../lib/i18n';

function Toast({ id, message, type, action, exiting, dismissLabel }) {
  const { dismiss } = useToast();

  return (
    <div className={`toast toast--${type}${exiting ? ' toast--exiting' : ''}`}>
      <span className="toast__message">{message}</span>
      {action && (
        <button className="toast__action" onClick={action.onClick}>
          {action.label}
        </button>
      )}
      <button
        className="toast__dismiss"
        onClick={(event) => {
          // Keep keyboard focus in the stack instead of dropping it on the page.
          const toast = event.currentTarget.closest('.toast');
          (toast.nextElementSibling || toast.previousElementSibling)?.querySelector('.toast__dismiss')?.focus();
          dismiss(id);
        }}
        aria-label={dismissLabel}
      >
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );
}

// Toasts sit in one popover so they show above an open modal dialog. They are
// announced through the live region below, which is in the page from the start.
export function ToastContainer() {
  const { toasts, setPaused } = useToast();
  const messages = useApp()?.messages || {};
  const regionRef = useRef(null);
  const shownAboveRef = useRef(null);
  const hoverRef = useRef(false);
  const focusRef = useRef(false);
  const updatePaused = () => setPaused(hoverRef.current || focusRef.current);

  useEffect(() => {
    const region = regionRef.current;
    if (!region?.showPopover) return;
    const open = region.matches(':popover-open');
    if (!toasts.length) {
      if (open) region.hidePopover();
      return;
    }
    // A dialog opened after the toasts covers them: show them again to move them to the top.
    const modal = [...document.querySelectorAll('dialog:modal')].at(-1) || null;
    if (open && modal === shownAboveRef.current) return;
    if (open) region.hidePopover();
    region.showPopover();
    shownAboveRef.current = modal;
  }, [toasts]);

  useEffect(() => {
    if (!toasts.length) {
      hoverRef.current = false;
      focusRef.current = false;
      setPaused(false);
    }
  }, [toasts, setPaused]);

  return (
    <>
      <section
        ref={regionRef}
        popover="manual"
        className="toast-container"
        aria-label={t(messages, 'notifications')}
        onPointerEnter={() => { hoverRef.current = true; updatePaused(); }}
        onPointerLeave={() => { hoverRef.current = false; updatePaused(); }}
        onFocus={() => { focusRef.current = true; updatePaused(); }}
        onBlur={(event) => {
          if (event.currentTarget.contains(event.relatedTarget)) return;
          focusRef.current = false;
          updatePaused();
        }}
      >
        {toasts.map((toast) => (
          <Toast key={toast.id} {...toast} dismissLabel={t(messages, 'dismiss')} />
        ))}
      </section>
      <div id="a11y-announcer" className="sr-only" aria-live="polite" aria-atomic="true" />
    </>
  );
}
