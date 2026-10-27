import { useEffect, useRef, useState } from 'react';

// Observe the actual planning surface: a tablet sidebar can consume 229px.
export function usePlannerLayout() {
  const ref = useRef(null);
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => {
      const width = element.getBoundingClientRect().width;
      if (width > 0) setCompact(width < 800);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return { ref, compact };
}

// Only a focused field opens the on-screen keyboard; folding or rotating also shrinks the visual viewport for a moment.
const isEditing = () => !!document.activeElement?.matches?.('input, textarea, select, [contenteditable="true"]');

export function useVisualViewport() {
  useEffect(() => {
    const viewport = window.visualViewport;
    const sync = () => {
      document.documentElement.style.setProperty(
        '--ui-viewport-height',
        `${viewport?.height || innerHeight}px`,
      );
      document.documentElement.style.setProperty(
        '--ui-viewport-top',
        `${viewport?.offsetTop || 0}px`,
      );
      document.body.classList.toggle(
        'ui-keyboard',
        isEditing() && innerHeight - (viewport?.height || innerHeight) > 130,
      );
    };
    sync();
    viewport?.addEventListener('resize', sync);
    viewport?.addEventListener('scroll', sync);
    window.addEventListener('resize', sync);
    return () => {
      viewport?.removeEventListener('resize', sync);
      viewport?.removeEventListener('scroll', sync);
      window.removeEventListener('resize', sync);
      document.body.classList.remove('ui-keyboard');
    };
  }, []);
}
