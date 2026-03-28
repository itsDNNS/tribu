import { useEffect, useRef } from 'react';
import { t } from '../lib/i18n';

export default function ConfirmDialog({ title, message, confirmLabel, confirmDanger, onConfirm, onCancel, messages }) {
  const dialogRef = useRef(null);
  const confirmBtnRef = useRef(null);
  const previousFocusRef = useRef(null);

  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;

  useEffect(() => {
    previousFocusRef.current = document.activeElement;
    confirmBtnRef.current?.focus();
    function handleKeyDown(e) {
      if (e.key === 'Escape') { onCancelRef.current(); return; }
      if (e.key === 'Tab' && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll('button');
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previousFocusRef.current?.focus();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="cal-dialog-backdrop" onClick={onCancel}>
      <div ref={dialogRef} className="cal-dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-title" aria-describedby={message ? 'confirm-dialog-desc' : undefined} onClick={e => e.stopPropagation()}>
        <div id="confirm-dialog-title" className="cal-dialog-title">{title}</div>
        {message && <div id="confirm-dialog-desc" className="cal-dialog-subtitle">{message}</div>}
        <div className="cal-dialog-actions">
          <button ref={confirmBtnRef} className={`btn-sm${confirmDanger ? ' cal-dialog-delete-all' : ''}`} onClick={onConfirm}>
            {confirmLabel || t(messages, 'confirm')}
          </button>
          <button className="btn-sm cal-dialog-cancel" onClick={onCancel}>
            {t(messages, 'cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}
