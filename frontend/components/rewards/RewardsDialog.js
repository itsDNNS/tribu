import { X } from 'lucide-react';
import ModalDialog from '../ModalDialog';
import { inBody } from '../inBody';

/** The frame of every rewards dialog: a card on wide screens, a sheet on phones. */
export default function RewardsDialog({ id, title, closeLabel, onClose, onSubmit, children, actions, initialFocusRef }) {
  return inBody(
    <ModalDialog
      className="ui-modal rewards-dialog"
      aria-labelledby={`${id}-dialog-title`}
      onClose={onClose}
      initialFocusRef={initialFocusRef}
    >
      <div className="rewards-dialog-header">
        <h2 id={`${id}-dialog-title`} className="rewards-dialog-title">{title}</h2>
        <button type="button" className="rewards-dialog-close" onClick={onClose} aria-label={closeLabel}>
          <X size={18} aria-hidden="true" />
        </button>
      </div>
      <form
        className="rewards-dialog-form ui-sheet-form"
        onSubmit={(e) => { e.preventDefault(); onSubmit?.(e); }}
      >
        <div className="ui-sheet-body">{children}</div>
        <div className="rewards-dialog-actions ui-sheet-actions">{actions}</div>
      </form>
    </ModalDialog>,
  );
}
