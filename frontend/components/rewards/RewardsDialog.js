import { useRef } from 'react';
import { X } from 'lucide-react';
import { useDialogFocusTrap } from '../../hooks/useDialogFocusTrap';
import { inBody } from '../inBody';

/** The frame of every rewards dialog: a card on wide screens, a sheet on phones. */
export default function RewardsDialog({ id, title, closeLabel, onClose, onSubmit, children, actions, initialFocusRef }) {
  const dialogRef = useRef(null);
  useDialogFocusTrap({ open: true, containerRef: dialogRef, initialFocusRef, onClose });
  return inBody(
    <div className="cal-dialog-backdrop" onClick={onClose}>
      <div
        ref={dialogRef}
        className="rewards-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-dialog-title`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="rewards-dialog-header">
          <h2 id={`${id}-dialog-title`} className="rewards-dialog-title">{title}</h2>
          <button type="button" className="rewards-dialog-close" onClick={onClose} aria-label={closeLabel}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <form
          className="rewards-dialog-form ui-sheet-form"
          onSubmit={(e) => { e.preventDefault(); onSubmit?.(); }}
        >
          <div className="ui-sheet-body">{children}</div>
          <div className="rewards-dialog-actions ui-sheet-actions">{actions}</div>
        </form>
      </div>
    </div>,
  );
}
