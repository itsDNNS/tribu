import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import StageDisplay from '../components/display/StageDisplay';
import { normalizeStageConfig, resolveLanguage } from '../components/display/stageModel';
import { apiDisplayMe, apiDisplayDashboard } from '../lib/api';
import { buildMessages, listLanguages, t as translate } from '../lib/i18n';
import { localeForLang } from '../lib/dates';

const TOKEN_STORAGE_KEY = 'tribu_display_token';
const CACHE_STORAGE_KEY = 'tribu_display_cache';
const SUPPORTED_LANGUAGES = listLanguages().map((language) => language.key);

/**
 * Shared-home display page (issue #172, Home Family Display 2.0).
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
 *
 * The last good payload is cached on the device, so the wall keeps
 * showing the family day (marked offline) when the network drops.
 */
export default function DisplayPage() {
  const router = useRouter();
  const [token, setToken] = useState(null);
  const [state, setState] = useState('loading'); // loading | missing | invalid | revoked | ready
  const [me, setMe] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  const [offlineSince, setOfflineSince] = useState(null);

  // Token bootstrap: prefer ?token=, fall back to localStorage. Once
  // captured from the URL, immediately persist + scrub the URL so the
  // wall tablet never displays the token in a visible address bar.
  useEffect(() => {
    if (!router.isReady) return;
    if (typeof window === 'undefined') return;
    const queryToken = typeof router.query.token === 'string' ? router.query.token : null;
    if (queryToken) {
      try {
        window.localStorage.setItem(TOKEN_STORAGE_KEY, queryToken);
        window.localStorage.removeItem(CACHE_STORAGE_KEY);
      } catch {}
      setToken(queryToken);
      router.replace('/display', undefined, { shallow: true });
      return;
    }
    let stored = null;
    try { stored = window.localStorage.getItem(TOKEN_STORAGE_KEY); } catch {}
    if (stored) {
      setToken(stored);
      const cached = readCache();
      if (cached) {
        setMe(cached.me);
        setDashboard(cached.dashboard);
        setOfflineSince(new Date(cached.at));
        setState('ready');
      }
    } else {
      setState('missing');
    }
  }, [router.isReady, router.query.token, router]);

  const unpair = useCallback((code) => {
    const next = code === 'DISPLAY_TOKEN_REVOKED' ? 'revoked' : 'invalid';
    setState(next);
    try {
      window.localStorage.removeItem(CACHE_STORAGE_KEY);
      // Invalid (never seen) tokens get cleared so the device can be
      // re-paired without manual storage editing. Revoked tokens stay
      // so the wall tablet can show a clear message instead of looping
      // back to "missing".
      if (next !== 'revoked') window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    } catch {}
    setMe(null);
    setDashboard(null);
  }, []);

  const refresh = useCallback(async (activeToken) => {
    if (!activeToken) return;
    const meRes = await apiDisplayMe(activeToken);
    if (meRes.status === 401) return unpair(meRes.data?.detail?.code);
    if (!meRes.ok) return markOffline(meRes.status);
    const dashRes = await apiDisplayDashboard(activeToken);
    if (dashRes.status === 401) return unpair(dashRes.data?.detail?.code);
    if (!dashRes.ok) return markOffline(dashRes.status);
    setMe(meRes.data);
    setDashboard(dashRes.data);
    setOfflineSince(null);
    setState('ready');
    writeCache({ me: meRes.data, dashboard: dashRes.data, at: Date.now() });

    function markOffline(status) {
      // Unreachable server or server error: keep what is on the wall.
      if (status === 0 || status >= 500) {
        setOfflineSince((current) => current || new Date());
        setState((current) => (current === 'ready' ? current : 'loading'));
        return;
      }
      setState('invalid');
    }
  }, [unpair]);

  const config = normalizeStageConfig(dashboard?.config || me?.config);
  const refreshIntervalMs = config.refreshSeconds * 1000;
  useEffect(() => {
    if (!token) return undefined;
    refresh(token);
    const id = setInterval(() => { refresh(token); }, refreshIntervalMs);
    return () => clearInterval(id);
  }, [token, refresh, refreshIntervalMs]);

  useScreenWakeLock(state === 'ready' && config.mode !== 'eink');

  // Read the device languages after mount so server and first client render agree.
  const [deviceLanguages, setDeviceLanguages] = useState([]);
  useEffect(() => {
    setDeviceLanguages(navigator.languages?.length ? [...navigator.languages] : [navigator.language]);
  }, []);
  const language = useMemo(
    () => resolveLanguage(config.language, deviceLanguages, SUPPORTED_LANGUAGES),
    [config.language, deviceLanguages]
  );
  const messages = useMemo(() => buildMessages(language), [language]);
  const t = useCallback((key) => translate(messages, key), [messages]);

  return (
    <>
      <Head>
        <title>Tribu Display</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
      </Head>
      <main className="display-root display-root--stage" data-testid="display-root" lang={language}>
        {state === 'loading' && (
          <div className="display-state" data-testid="display-state-loading" aria-busy="true" aria-label={t('display.state.loading')}>
            <p>{t('display.state.loading')}</p>
          </div>
        )}
        {state === 'missing' && (
          <div className="display-state" data-testid="display-state-missing">
            <h1>Tribu Display</h1>
            <p>{t('display.state.missing')}</p>
          </div>
        )}
        {state === 'invalid' && (
          <div className="display-state" data-testid="display-state-invalid">
            <h1>Tribu Display</h1>
            <p>{t('display.state.invalid')}</p>
          </div>
        )}
        {state === 'revoked' && (
          <div className="display-state" data-testid="display-state-revoked">
            <h1>Tribu Display</h1>
            <p>{t('display.state.revoked')}</p>
          </div>
        )}
        {state === 'ready' && me && dashboard && (
          <StageDisplay me={me} dashboard={dashboard} t={t} locale={localeForLang(language)} offlineSince={offlineSince} />
        )}
      </main>
    </>
  );
}

function readCache() {
  try {
    const cached = JSON.parse(window.localStorage.getItem(CACHE_STORAGE_KEY) || 'null');
    return cached?.me && cached?.dashboard && Number.isFinite(cached.at) ? cached : null;
  } catch {
    return null;
  }
}

function writeCache(value) {
  try {
    window.localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Storage full or unavailable: the display still works, only without an offline copy.
  }
}

// Keep tablets awake while the family display is showing (Screen Wake Lock API).
function useScreenWakeLock(active) {
  useEffect(() => {
    if (!active || typeof navigator === 'undefined' || !navigator.wakeLock?.request) return undefined;
    let lock = null;
    let cancelled = false;
    const acquire = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        lock = await navigator.wakeLock.request('screen');
        if (cancelled) lock.release().catch(() => {});
      } catch {
        lock = null;
      }
    };
    acquire();
    document.addEventListener('visibilitychange', acquire);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', acquire);
      lock?.release().catch(() => {});
    };
  }, [active]);
}
