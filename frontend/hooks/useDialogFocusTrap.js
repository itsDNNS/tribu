import { useEffect, useRef } from 'react';

const DEFAULT_FOCUSABLE_SELECTOR = 'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), a[href]';

export function useDialogFocusTrap({
  open,
  containerRef,
  initialFocusRef,
  onClose,
  focusableSelector = DEFAULT_FOCUSABLE_SELECTOR,
}) {
  const previousFocusRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    previousFocusRef.current = document.activeElement;
    initialFocusRef?.current?.focus();

    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        onCloseRef.current?.();
        return;
      }
      if (e.key !== 'Tab' || !containerRef.current) return;

      const focusable = containerRef.current.querySelectorAll(focusableSelector);
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      const previous = previousFocusRef.current;
      if (previous && previous.isConnected && typeof previous.focus === 'function') {
        previous.focus();
      }
    };
  }, [containerRef, focusableSelector, initialFocusRef, open]);
}
