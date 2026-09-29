import { useEffect, useState } from 'react';

// Opening another view at a given place (the weekly plan's links, #511):
// the caller leaves a value, the target view takes it when it opens.
export function handOff(key, value) {
  try {
    sessionStorage.setItem(key, String(value));
  } catch {
    /* private mode */
  }
}

function peek(key) {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

// The value left for this view. It is read while rendering and cleared
// once the view is on screen, so rendering twice (React's strict mode)
// still sees it.
export function useHandoff(key) {
  const [value] = useState(() => peek(key));
  useEffect(() => {
    try {
      sessionStorage.removeItem(key);
    } catch {
      /* private mode */
    }
  }, [key]);
  return value;
}

// "2026-09-30" as a local date, or null.
export function handoffDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value || '');
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null;
}
