import { useId, useRef, useState } from 'react';
import { t } from '../lib/i18n';
import { inBody } from './inBody';
import ModalDialog from './ModalDialog';

export default function ConfirmDialog({ title, message, confirmLabel, confirmDanger, onConfirm, onCancel, messages }) {
  const id = useId();
  const confirmBtnRef = useRef(null);
  const cancelBtnRef = useRef(null);
  const [loading, setLoading] = useState(false);

  async function handleConfirm() {
    setLoading(true);
    try {
      await onConfirm();
    } finally {
      setLoading(false);
    }
  }

  // A destructive confirmation starts on the safe choice.
  return inBody(
    <ModalDialog
      className="ui-modal cal-dialog"
      aria-labelledby={`${id}-title`}
      aria-describedby={message ? `${id}-desc` : undefined}
      onClose={onCancel}
      busy={loading}
      guardInput={false}
      initialFocusRef={confirmDanger ? cancelBtnRef : confirmBtnRef}
    >
      <div id={`${id}-title`} className="cal-dialog-title">{title}</div>
      {message && <div id={`${id}-desc`} className="cal-dialog-subtitle">{message}</div>}
      <div className="cal-dialog-actions">
        <button ref={confirmBtnRef} className={`btn-sm${confirmDanger ? ' cal-dialog-delete-all' : ''}`} onClick={handleConfirm} disabled={loading}>
          {confirmLabel || t(messages, 'confirm')}
        </button>
        <button ref={cancelBtnRef} className="btn-sm cal-dialog-cancel" onClick={onCancel} disabled={loading}>
          {t(messages, 'cancel')}
        </button>
      </div>
    </ModalDialog>
  );
}
