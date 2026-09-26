import { useEffect, useId, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { t } from '../../lib/i18n';

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
    const dialog = ref.current;
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.showModal();
    // Keep the opening height while content changes so the sheet does not jump under the keyboard.
    if (keepHeight && dialog.offsetHeight) dialog.style.minHeight = `${dialog.offsetHeight}px`;
    // Focus the close button instead of a text field so the keyboard stays closed.
    dialog.querySelector('.ui-bottom-sheet-close')?.focus();
    return () => {
      dialog.close();
      document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
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
    <dialog
      ref={ref}
      className={`ui-bottom-sheet ${className}`}
      aria-labelledby={titleId}
      style={dragOffset ? { transform: `translateY(${dragOffset}px)`, transition: 'none' } : undefined}
      onCancel={(e) => {
        e.preventDefault();
        closeRef.current();
      }}
      onClick={(e) => {
        if (e.target !== e.currentTarget) return;
        const r = e.currentTarget.getBoundingClientRect();
        if (e.clientY < r.top || e.clientX < r.left || e.clientX > r.right) closeRef.current();
      }}
    >
      <header className="ui-bottom-sheet-head" onPointerDown={dragStart} onPointerMove={dragMove} onPointerUp={dragEnd} onPointerCancel={dragEnd}>
        <span className="ui-bottom-sheet-grab" aria-hidden="true" />
        <h2 id={titleId}>{title}</h2>
        <button type="button" className="ui-bottom-sheet-close" aria-label={t(messages, 'close')} onClick={onClose}>
          <X size={18} aria-hidden="true" />
        </button>
      </header>
      <div className="ui-bottom-sheet-body">{children}</div>
    </dialog>
  );
}
