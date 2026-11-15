import { useLayoutEffect, useRef, useState } from 'react';
import { useApp } from '../contexts/AppContext';
import { t } from '../lib/i18n';
import ConfirmDialog from './ConfirmDialog';

function outside(event, dialog) {
  const r = dialog.getBoundingClientRect();
  return event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom;
}

/**
 * A native modal <dialog>: top layer, inert page, Escape and focus return.
 * A click on the backdrop closes it only when the press started there too,
 * so selecting text that ends outside keeps it open. Once something was
 * typed, Escape and outside clicks ask before discarding it.
 */
export default function ModalDialog({ onClose, busy = false, guardInput = true, initialFocusRef, children, ...props }) {
  const messages = useApp()?.messages || {};
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const dirtyRef = useRef(false);
  const pressedOutsideRef = useRef(false);
  const unmountingRef = useRef(false);
  const [asking, setAsking] = useState(false);
  // Read while rendering: an autoFocus field inside takes focus before any effect runs.
  const [opener] = useState(() => (typeof document === 'undefined' ? null : document.activeElement));

  // Before paint, so the dialog never shows up in the page flow first.
  useLayoutEffect(() => {
    const dialog = ref.current;
    // An opener removed in this same update (e.g. a dialog replaced by this one) passed focus on already.
    const returnTo = opener?.isConnected ? opener : document.activeElement;
    unmountingRef.current = false;
    dialog.showModal();
    initialFocusRef?.current?.focus();
    return () => {
      unmountingRef.current = true;
      dialog.close();
      if (returnTo?.isConnected) returnTo.focus({ preventScroll: true });
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const dismiss = () => {
    if (busyRef.current) return;
    if (guardInput && dirtyRef.current) setAsking(true);
    else closeRef.current();
  };

  return (
    <>
      <dialog
        ref={ref}
        {...props}
        onInput={() => { dirtyRef.current = true; }}
        onCancel={(event) => {
          // React passes a nested dialog's cancel and close events up the component tree.
          if (event.target !== event.currentTarget) return;
          event.preventDefault();
          dismiss();
        }}
        onClose={(event) => {
          const dialog = event.currentTarget;
          if (event.target !== dialog || unmountingRef.current || dialog.open || !dialog.isConnected) return;
          // A repeated Escape without user activation cannot be cancelled: reopen, then decide as for any dismissal.
          dialog.showModal();
          dismiss();
        }}
        onPointerDown={(event) => {
          pressedOutsideRef.current = event.target === event.currentTarget && outside(event, event.currentTarget);
        }}
        onClick={(event) => {
          const pressedOutside = pressedOutsideRef.current;
          pressedOutsideRef.current = false;
          if (pressedOutside && event.target === event.currentTarget && outside(event, event.currentTarget)) dismiss();
        }}
      >
        {children}
      </dialog>
      {asking && (
        <ConfirmDialog
          title={t(messages, 'discard_changes_title')}
          message={t(messages, 'discard_changes_message')}
          confirmLabel={t(messages, 'discard_changes_confirm')}
          confirmDanger
          onConfirm={() => closeRef.current()}
          onCancel={() => setAsking(false)}
          messages={messages}
        />
      )}
    </>
  );
}
