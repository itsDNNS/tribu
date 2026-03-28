import { useEffect, useRef } from 'react';
import { t } from '../lib/i18n';

export default function ConfirmDialog({ title, message, confirmLabel, confirmDanger, onConfirm, onCancel, messages }) {
  const confirmRef = useRef(null);

  useEffect(() => {
    confirmRef.current?.focus();
    function handleKeyDown(e) {
      if (e.key === 'Escape') onCancel();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  return (
    <div className="cal-dialog-backdrop" role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-title">
      <div className="cal-dialog">
        <div id="confirm-dialog-title" className="cal-dialog-title">{title}</div>
        {message && <div className="cal-dialog-subtitle">{message}</div>}
        <div className="cal-dialog-actions">
          <button ref={confirmRef} className={`btn-sm${confirmDanger ? ' cal-dialog-delete-all' : ''}`} onClick={onConfirm}>
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
