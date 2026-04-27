import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import DisplayDashboard from '../components/DisplayDashboard';
import { apiDisplayMe, apiDisplayDashboard } from '../lib/api';

const TOKEN_STORAGE_KEY = 'tribu_display_token';
const DEFAULT_REFRESH_INTERVAL_MS = 60 * 1000;
const MIN_REFRESH_INTERVAL_MS = 30 * 1000;
const MAX_REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * Shared-home display page (issue #172).
 *
 * Mounted at /display, this page deliberately does NOT mount the
 * normal AppShell, does NOT use AppContext (which would call
 * `/auth/me` and `/families/me`), and does NOT render the sidebar,
 * search overlay, notifications center, or any quick-add widgets.
 *
 * Pairing flow:
 *   1. Admin creates a device, copies the URL containing ?token=...
 *      to the wall tablet.
 *   2. The tablet visits /display?token=..., which strips the token
 *      from the URL bar and persists it in localStorage so subsequent
 *      visits to /display work without exposing the token in the
 *      browser's address bar.
 *   3. The token authenticates `/display/me` and `/display/dashboard`
 *      via the dedicated `tribu_display_` bearer flow. The display
 *      runtime never sends the user session cookie (see
 *      `apiDisplayDashboard`), so a revoked token cannot silently
 *      fall back to an admin's session.
 */
export default function DisplayPage() {
  const router = useRouter();
  const [token, setToken] = useState(null);
  const [state, setState] = useState('loading'); // loading | missing | invalid | revoked | ready
  const [me, setMe] = useState(null);
  const [dashboard, setDashboard] = useState(null);

  // Token bootstrap: prefer ?token=, fall back to localStorage. Once
  // captured from the URL, immediately persist + scrub the URL so the
  // wall tablet never displays the token in a visible address bar.
  useEffect(() => {
    if (!router.isReady) return;
    if (typeof window === 'undefined') return;
    const queryToken = typeof router.query.token === 'string' ? router.query.token : null;
    if (queryToken) {
      try { window.localStorage.setItem(TOKEN_STORAGE_KEY, queryToken); } catch {}
      setToken(queryToken);
      router.replace('/display', undefined, { shallow: true });
      return;
    }
    let stored = null;
    try { stored = window.localStorage.getItem(TOKEN_STORAGE_KEY); } catch {}
    if (stored) {
      setToken(stored);
    } else {
      setState('missing');
    }
  }, [router.isReady, router.query.token, router]);

  const refresh = useCallback(async (activeToken) => {
    if (!activeToken) return;
    const meRes = await apiDisplayMe(activeToken);
    if (meRes.status === 401) {
      const code = meRes.data?.detail?.code;
      const next = code === 'DISPLAY_TOKEN_REVOKED' ? 'revoked' : 'invalid';
      setState(next);
      if (next !== 'revoked') {
        // Invalid (never seen) tokens get cleared so the device can
        // be re-paired without manual storage editing. Revoked tokens
        // stay so the wall tablet can show a clear message instead of
        // looping back to "missing".
        try { window.localStorage.removeItem(TOKEN_STORAGE_KEY); } catch {}
      }
      setMe(null);
      setDashboard(null);
      return;
    }
    if (!meRes.ok) {
      setState('invalid');
      return;
    }
    const dashRes = await apiDisplayDashboard(activeToken);
    if (!dashRes.ok) {
      const code = dashRes.data?.detail?.code;
      const next = code === 'DISPLAY_TOKEN_REVOKED' ? 'revoked' : 'invalid';
      setState(next);
      if (next !== 'revoked') {
        try { window.localStorage.removeItem(TOKEN_STORAGE_KEY); } catch {}
      }
      setMe(null);
      setDashboard(null);
      return;
    }
    setMe(meRes.data);
    setDashboard(dashRes.data);
    setState('ready');
  }, []);

  const refreshIntervalMs = getRefreshIntervalMs(dashboard?.config || me?.config);

  useEffect(() => {
    if (!token) return undefined;
    refresh(token);
    const id = setInterval(() => { refresh(token); }, refreshIntervalMs);
    return () => clearInterval(id);
  }, [token, refresh, refreshIntervalMs]);

  return (
    <>
      <Head>
        <title>Tribu Display</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
      </Head>
      <main className="display-root" data-testid="display-root">
        {state === 'loading' && (
          <div
            className="display-state-loading"
            data-testid="display-state-loading"
            aria-busy="true"
            aria-label="Loading display"
          >
            <div className="display-skeleton-card" />
            <div className="display-skeleton-card" />
            <div className="display-skeleton-card" />
            <span className="visually-hidden" style={{ position: 'absolute', left: -9999 }}>
              Loading…
            </span>
          </div>
        )}
        {state === 'missing' && (
          <div className="display-state" data-testid="display-state-missing">
            <h1>Tribu Display</h1>
            <p>Pair this device by opening the link an admin generated under Admin → Displays.</p>
          </div>
        )}
        {state === 'invalid' && (
          <div className="display-state" data-testid="display-state-invalid">
            <h1>Tribu Display</h1>
            <p>This display is not paired or its token is no longer valid. Ask an admin to create a new pairing link.</p>
          </div>
        )}
        {state === 'revoked' && (
          <div className="display-state" data-testid="display-state-revoked">
            <h1>Tribu Display</h1>
            <p>This display has been removed by an admin. Ask for a new pairing link to bring it back online.</p>
          </div>
        )}
        {state === 'ready' && me && dashboard && (
          <DisplayDashboard me={me} dashboard={dashboard} />
        )}
      </main>
    </>
  );
}

function getRefreshIntervalMs(config) {
  const seconds = Number(config?.refresh_interval_seconds);
  if (!Number.isFinite(seconds)) return DEFAULT_REFRESH_INTERVAL_MS;
  const ms = Math.round(seconds * 1000);
  return Math.min(MAX_REFRESH_INTERVAL_MS, Math.max(MIN_REFRESH_INTERVAL_MS, ms));
}
