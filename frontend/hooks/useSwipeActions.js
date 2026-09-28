import { useRef, useState } from 'react';

// Horizontal swipe on touch for list rows: past the threshold, a swipe to
// the right or left runs its action when the finger lifts. Vertical moves
// keep scrolling the page (the row needs `touch-action: pan-y`). Mouse
// input is ignored; every swipe action also has a button.
export const SWIPE_THRESHOLD = 72;
const LOCK_DISTANCE = 10;
const MAX_OFFSET = 120;

export function useSwipeActions({ onSwipeRight, onSwipeLeft, enabled = true }) {
  const [offset, setOffset] = useState(0);
  const gesture = useRef(null);
  const swiped = useRef(false);

  const reset = () => {
    gesture.current = null;
    setOffset(0);
  };

  const handlers = {
    onPointerDown(event) {
      swiped.current = false;
      if (!enabled || event.pointerType === 'mouse') return;
      gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, axis: null, crossed: false };
    },
    onPointerMove(event) {
      const current = gesture.current;
      if (!current || current.id !== event.pointerId) return;
      const dx = event.clientX - current.x;
      const dy = event.clientY - current.y;
      if (!current.axis) {
        if (Math.abs(dx) > LOCK_DISTANCE && Math.abs(dx) > Math.abs(dy)) {
          current.axis = 'x';
          event.currentTarget.setPointerCapture?.(event.pointerId);
        } else if (Math.abs(dy) > LOCK_DISTANCE) {
          gesture.current = null;
          return;
        }
      }
      if (current.axis !== 'x') return;
      const allowed = (dx > 0 && onSwipeRight) || (dx < 0 && onSwipeLeft) ? dx : 0;
      const next = Math.max(-MAX_OFFSET, Math.min(MAX_OFFSET, allowed));
      const crossed = Math.abs(next) >= SWIPE_THRESHOLD;
      if (crossed && !current.crossed) navigator.vibrate?.(8);
      current.crossed = crossed;
      setOffset(next);
    },
    onPointerUp(event) {
      const current = gesture.current;
      if (!current || current.id !== event.pointerId) return;
      if (current.axis === 'x') {
        swiped.current = true;
        if (offset >= SWIPE_THRESHOLD) onSwipeRight?.();
        else if (offset <= -SWIPE_THRESHOLD) onSwipeLeft?.();
      }
      reset();
    },
    onPointerCancel: reset,
    // A swipe ends with a click on the row underneath; that click is not a tap.
    onClickCapture(event) {
      if (!swiped.current) return;
      swiped.current = false;
      event.preventDefault();
      event.stopPropagation();
    },
  };

  return { offset, handlers };
}
