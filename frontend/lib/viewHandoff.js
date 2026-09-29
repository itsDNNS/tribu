import { useEffect, useState } from 'react';

// Opening another view at a given place (the weekly plan's links, #511):
// the caller leaves a value, the target view takes it when it opens. The
// values live only in memory for this page, never in browser storage.
const pending = new Map();

export function handOff(key, value) {
  pending.set(key, String(value));
}

// The value left for this view. It is read while rendering and cleared
// once the view is on screen, so rendering twice (React's strict mode)
// still sees it.
export function useHandoff(key) {
  const [value] = useState(() => pending.get(key) ?? null);
  useEffect(() => {
    pending.delete(key);
  }, [key]);
  return value;
}

// What is waiting for a view, without taking it.
export function peekHandoff(key) {
  return pending.get(key) ?? null;
}

// "2026-09-30" as a local date, or null.
export function handoffDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value || '');
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null;
}
