import { useEffect, useState } from 'react';

const MINUTE_MS = 60000;

function msUntilNextMinute(now = Date.now()) {
  const remainder = now % MINUTE_MS;
  return remainder === 0 ? MINUTE_MS : MINUTE_MS - remainder;
}

export function useCurrentMinute() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let timeoutId;
    let cancelled = false;

    const scheduleNextTick = () => {
      timeoutId = window.setTimeout(() => {
        if (cancelled) return;
        setNow(new Date());
        scheduleNextTick();
      }, msUntilNextMinute());
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'hidden') {
        setNow(new Date());
      }
    };

    scheduleNextTick();
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return now;
}
