import { useCallback, useEffect, useState } from 'react';

const PAUSE_MS = 60 * 1000;

// Which card a zone shows is derived from the wall clock, so displays stay in step
// after reloads and several screens in one home change together.
export function rotationSlot(nowMs, { cardCount, intervalMs, offsetMs }) {
  const slot = Math.floor((nowMs - offsetMs) / intervalMs);
  return {
    slot,
    index: cardCount > 0 ? ((slot % cardCount) + cardCount) % cardCount : 0,
    startedAt: offsetMs + slot * intervalMs,
    nextAt: offsetMs + (slot + 1) * intervalMs,
  };
}

export function zoneOffset({ stagger, zoneIndex, zoneCount, intervalMs }) {
  return stagger ? Math.round((zoneIndex * intervalMs) / zoneCount) : 0;
}

export function useStageRotation({ cardCount, intervalSeconds, zoneIndex, zoneCount, stagger, eink, refreshSeconds, pauseOnTouch }) {
  const intervalMs = (eink ? refreshSeconds : intervalSeconds) * 1000;
  const offsetMs = eink ? 0 : zoneOffset({ stagger, zoneIndex, zoneCount, intervalMs });
  const [now, setNow] = useState(() => Date.now());
  const [hold, setHold] = useState(null); // { index, until }

  const scheduled = rotationSlot(now, { cardCount, intervalMs, offsetMs });
  const held = hold && hold.until > now ? hold : null;

  useEffect(() => {
    const wakeAt = held ? Math.min(held.until, scheduled.nextAt) : scheduled.nextAt;
    const id = setTimeout(() => setNow(Date.now()), Math.max(50, wakeAt - Date.now() + 20));
    return () => clearTimeout(id);
  }, [held, scheduled.nextAt]);

  const step = useCallback((delta) => {
    if (cardCount < 2) return;
    setHold((current) => {
      const base = current && current.until > Date.now() ? current.index : rotationSlot(Date.now(), { cardCount, intervalMs, offsetMs }).index;
      return { index: (((base + delta) % cardCount) + cardCount) % cardCount, until: Date.now() + PAUSE_MS };
    });
    setNow(Date.now());
  }, [cardCount, intervalMs, offsetMs]);

  const pause = useCallback(() => {
    if (!pauseOnTouch || eink) return;
    setHold((current) => ({
      index: current && current.until > Date.now() ? current.index : rotationSlot(Date.now(), { cardCount, intervalMs, offsetMs }).index,
      until: Date.now() + PAUSE_MS,
    }));
    setNow(Date.now());
  }, [pauseOnTouch, eink, cardCount, intervalMs, offsetMs]);

  return {
    index: held ? Math.min(held.index, Math.max(0, cardCount - 1)) : scheduled.index,
    paused: Boolean(held),
    elapsedMs: held ? 0 : now - scheduled.startedAt,
    intervalMs,
    slotKey: held ? `hold-${held.index}-${held.until}` : `slot-${scheduled.slot}`,
    next: () => step(1),
    previous: () => step(-1),
    pause,
  };
}
