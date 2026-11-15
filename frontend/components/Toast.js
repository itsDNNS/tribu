import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { useModalStack } from '../contexts/ModalStackContext';
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

// Toasts sit in one popover so they show in the top layer. While a modal dialog
// is open, the innermost one renders this region instead (see ModalDialog): the
// dialog makes the rest of the page inert, which would leave the buttons unreachable.
export function ToastRegion() {
  const { toasts, setPaused } = useToast();
  const messages = useApp()?.messages || {};
  const regionRef = useRef(null);
  const hoverRef = useRef(false);
  const focusRef = useRef(false);
  const updatePaused = () => setPaused(hoverRef.current || focusRef.current);

  useEffect(() => {
    const region = regionRef.current;
    if (!region?.showPopover) return;
    const open = region.matches(':popover-open');
    if (toasts.length && !open) region.showPopover();
    if (!toasts.length && open) region.hidePopover();
  }, [toasts]);

  useEffect(() => {
    if (!toasts.length) {
      hoverRef.current = false;
      focusRef.current = false;
      setPaused(false);
    }
  }, [toasts, setPaused]);

  // A region that moves into a dialog or back must not keep the timers paused.
  useEffect(() => () => setPaused(false), [setPaused]);

  return (
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
  );
}

// Toasts are announced through the live region below, which is in the page from the start.
export function ToastContainer() {
  const modalStack = useModalStack();
  return (
    <>
      {!modalStack?.topModal && <ToastRegion />}
      <div id="a11y-announcer" className="sr-only" aria-live="polite" aria-atomic="true" />
    </>
  );
}
