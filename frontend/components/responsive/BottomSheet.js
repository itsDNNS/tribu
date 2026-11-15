import { useEffect, useId, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { t } from '../../lib/i18n';
import ModalDialog from '../ModalDialog';

const SWIPE_CLOSE_DISTANCE = 90;

// Modal mobile bottom sheet with a grab handle, swipe-down dismissal and a reachable close button.
export default function BottomSheet({ title, messages, onClose, className = '', keepHeight = false, children }) {
  const ref = useRef(null);
  const dragRef = useRef(null);
  const titleId = useId();
  const [dragOffset, setDragOffset] = useState(0);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const dialog = ref.current.closest('dialog');
    // Keep the opening height while content changes so the sheet does not jump under the keyboard.
    if (keepHeight && dialog.offsetHeight) dialog.style.minHeight = `${dialog.offsetHeight}px`;
    // Focus the close button instead of a text field so the keyboard stays closed.
    dialog.querySelector('.ui-bottom-sheet-close')?.focus();
  }, [keepHeight]);

  const dragStart = (e) => {
    if (e.pointerType === 'mouse' || e.target.closest('button')) return;
    dragRef.current = { y: e.clientY, id: e.pointerId };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const dragMove = (e) => {
    if (dragRef.current?.id !== e.pointerId) return;
    setDragOffset(Math.max(0, e.clientY - dragRef.current.y));
  };
  const dragEnd = (e) => {
    if (dragRef.current?.id !== e.pointerId) return;
    dragRef.current = null;
    if (dragOffset > SWIPE_CLOSE_DISTANCE) closeRef.current();
    else setDragOffset(0);
  };

  return (
    <ModalDialog
      className={`ui-bottom-sheet ${className}`}
      aria-labelledby={titleId}
      style={dragOffset ? { transform: `translateY(${dragOffset}px)`, transition: 'none' } : undefined}
      onClose={onClose}
    >
      <header ref={ref} className="ui-bottom-sheet-head" onPointerDown={dragStart} onPointerMove={dragMove} onPointerUp={dragEnd} onPointerCancel={dragEnd}>
        <span className="ui-bottom-sheet-grab" aria-hidden="true" />
        <h2 id={titleId}>{title}</h2>
        <button type="button" className="ui-bottom-sheet-close" aria-label={t(messages, 'close')} onClick={onClose}>
          <X size={18} aria-hidden="true" />
        </button>
      </header>
      <div className="ui-bottom-sheet-body">{children}</div>
    </ModalDialog>
  );
}
