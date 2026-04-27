import { useCallback, useEffect, useRef, useState } from 'react';

const MAX_BACKOFF = 30000;
const PING_INTERVAL = 25000;
const NO_RECONNECT_CODES = [4001, 4003];

export function buildShoppingWebSocketUrl(listId, location = window.location) {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.host}/ws/shopping/${encodeURIComponent(listId)}`;
}

export function useWebSocket(listId, { onMessage, enabled = true } = {}) {
  const [connected, setConnected] = useState(false);
  const wsRef = useRef(null);
  const retryRef = useRef(0);
  const timerRef = useRef(null);
  const pingRef = useRef(null);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  const cleanup = useCallback(() => {
    clearTimeout(timerRef.current);
    clearInterval(pingRef.current);
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
      wsRef.current = null;
    }
    setConnected(false);
  }, []);

  useEffect(() => {
    if (!enabled || !listId) {
      cleanup();
      return;
    }

    let cancelled = false;

    function connect() {
      if (cancelled) return;

      const url = buildShoppingWebSocketUrl(listId);

      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (cancelled) { ws.close(); return; }
        retryRef.current = 0;
        setConnected(true);

        pingRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, PING_INTERVAL);
      };

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === 'pong') return;
          onMessageRef.current?.(msg);
        } catch { /* ignore malformed messages */ }
      };

      ws.onclose = (e) => {
        clearInterval(pingRef.current);
        setConnected(false);
        wsRef.current = null;

        if (cancelled || NO_RECONNECT_CODES.includes(e.code)) return;

        const backoff = Math.min(1000 * 2 ** retryRef.current, MAX_BACKOFF);
        retryRef.current++;
        timerRef.current = setTimeout(connect, backoff);
      };

      ws.onerror = () => {
        // onclose will fire after onerror, handling reconnect
      };
    }

    connect();

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [listId, enabled, cleanup]);

  return { connected };
}
