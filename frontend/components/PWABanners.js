import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, RefreshCw, WifiOff, Wifi } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { t } from '../lib/i18n';
import { trustedScriptURL } from '../lib/trustedTypes';

export const OFFLINE_BANNER_DELAY_MS = 4000;
export const UPDATE_IDLE_MS = 2 * 60 * 1000;
export const UPDATE_RETRY_MS = 30 * 1000;
// Asking for the switch while the page was still loading through the old worker left it
// stuck in Chromium browser tests (about one in five), so the first attempt waits until
// the page has loaded and settled.
export const UPDATE_SETTLE_MS = 2000;

const INTERACTION_EVENTS = ['pointerdown', 'keydown', 'input', 'wheel'];
const TEXT_ENTRY = 'textarea, select, input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]):not([type=reset])';

// Applying an update reloads the page, so it happens on its own only when nothing
// can be lost: no open dialog, no focused field, online (check-offs waiting for
// the network live only in this page), and the person is away (app in the
// background), has not touched the page since it loaded, or left it alone a while.
export function canReloadSafely(lastInteractionAt, now = Date.now()) {
  if (navigator.onLine === false) return false;
  if (document.querySelector('dialog[open]')) return false;
  const focused = document.activeElement;
  if (focused && (focused.isContentEditable || focused.matches?.(TEXT_ENTRY))) return false;
  return document.visibilityState === 'hidden'
    || lastInteractionAt === null
    || now - lastInteractionAt >= UPDATE_IDLE_MS;
}

export function PWABanners() {
  const { messages } = useApp();
  const [isOffline, setIsOffline] = useState(false);
  const [showBackOnline, setShowBackOnline] = useState(false);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const waitingWorkerRef = useRef(null);
  const updateActionRef = useRef(null);

  // A short dropout (a tunnel, the lift) should not flash a banner: it
  // appears after a few seconds offline, and "back online" only follows a
  // banner that was actually shown. Check-offs made meanwhile wait and are
  // sent once the network is back (lib/offline.js).
  useEffect(() => {
    let offlineTimer;
    let backOnlineTimer;
    let shown = false;

    const goOffline = () => {
      clearTimeout(offlineTimer);
      offlineTimer = setTimeout(() => {
        shown = true;
        setIsOffline(true);
      }, OFFLINE_BANNER_DELAY_MS);
    };
    const goOnline = () => {
      clearTimeout(offlineTimer);
      setIsOffline(false);
      if (!shown) return;
      shown = false;
      setShowBackOnline(true);
      clearTimeout(backOnlineTimer);
      backOnlineTimer = setTimeout(() => setShowBackOnline(false), 3000);
    };

    if (!navigator.onLine) goOffline();
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
      clearTimeout(offlineTimer);
      clearTimeout(backOnlineTimer);
    };
  }, []);

  useEffect(() => {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches
      || navigator.standalone === true;
    if (isStandalone) {
      setIsInstalled(true);
      return;
    }

    const handler = (e) => {
      e.preventDefault();
      setInstallPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const triggerInstall = useCallback(async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const result = await installPrompt.userChoice;
    if (result.outcome === 'accepted') {
      setIsInstalled(true);
    }
    setInstallPrompt(null);
  }, [installPrompt]);

  const dismissInstall = useCallback(() => {
    setInstallPrompt(null);
    try { localStorage.setItem('tribu_install_dismissed', '1'); } catch {}
  }, []);

  useEffect(() => {
    if (!navigator.serviceWorker?.register) return;

    let updateFoundHandler;
    let reg = null;
    let retryTimer = null;
    let settleTimer = null;
    let offerPending = false;
    let onLoadOffer = null;
    let lastInteractionAt = null;
    // The first install claims an uncontrolled page; reloading then would drop what someone is typing.
    const hadController = Boolean(navigator.serviceWorker.controller);
    // Another tab may switch to the new version while this one is busy; this one then reloads later.
    let reloadPending = false;
    let updateRequested = false;
    let refreshing = false;

    const noteInteraction = () => { lastInteractionAt = Date.now(); };
    INTERACTION_EVENTS.forEach((type) => window.addEventListener(type, noteInteraction, { capture: true, passive: true }));

    const reload = () => {
      if (refreshing) return;
      refreshing = true;
      clearInterval(retryTimer);
      window.location.reload();
    };
    const activateWaiting = () => {
      if (!waitingWorkerRef.current) return false;
      waitingWorkerRef.current.postMessage({ type: 'SKIP_WAITING' });
      return true;
    };

    // Waiting with the banner forever is what made it come back on every visit:
    // a new worker only takes over by itself once every Tribu window is closed.
    const tryAutoUpdate = () => {
      if (!canReloadSafely(lastInteractionAt)) return false;
      if (reloadPending) {
        reload();
        return true;
      }
      return activateWaiting();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') tryAutoUpdate();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    // The banner stays as the way to update right away while someone is busy.
    const offerUpdate = () => {
      if (offerPending) return;
      offerPending = true;
      const offer = () => {
        settleTimer = setTimeout(() => {
          offerPending = false;
          if (tryAutoUpdate()) return;
          setUpdateAvailable(true);
          if (!retryTimer) retryTimer = setInterval(tryAutoUpdate, UPDATE_RETRY_MS);
        }, UPDATE_SETTLE_MS);
      };
      if (document.readyState === 'complete') offer();
      else {
        onLoadOffer = offer;
        window.addEventListener('load', offer, { once: true });
      }
    };

    updateActionRef.current = () => {
      updateRequested = true;
      if (reloadPending) reload();
      else activateWaiting();
    };

    navigator.serviceWorker.register(trustedScriptURL('/sw.js')).then((registration) => {
      reg = registration;

      if (registration.waiting) {
        waitingWorkerRef.current = registration.waiting;
        offerUpdate();
      }

      updateFoundHandler = () => {
        const newWorker = registration.installing;
        if (!newWorker) return;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            waitingWorkerRef.current = newWorker;
            offerUpdate();
          }
        });
      };
      registration.addEventListener('updatefound', updateFoundHandler);
    }).catch(() => {});

    const onControllerChange = () => {
      waitingWorkerRef.current = null;
      if (!hadController) {
        // Nothing to reload into here, so the banner has nothing left to offer.
        clearInterval(retryTimer);
        retryTimer = null;
        setUpdateAvailable(false);
        return;
      }
      reloadPending = true;
      if (updateRequested || tryAutoUpdate()) {
        reload();
        return;
      }
      setUpdateAvailable(true);
      if (!retryTimer) retryTimer = setInterval(tryAutoUpdate, UPDATE_RETRY_MS);
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    return () => {
      clearInterval(retryTimer);
      clearTimeout(settleTimer);
      if (onLoadOffer) window.removeEventListener('load', onLoadOffer);
      updateActionRef.current = null;
      INTERACTION_EVENTS.forEach((type) => window.removeEventListener(type, noteInteraction, { capture: true }));
      document.removeEventListener('visibilitychange', onVisibilityChange);
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      if (reg && updateFoundHandler) {
        reg.removeEventListener('updatefound', updateFoundHandler);
      }
    };
  }, []);

  const applyUpdate = useCallback(() => {
    updateActionRef.current?.();
  }, []);

  const installDismissed = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('tribu_install_dismissed') === '1';
  }, []);

  const pwa = {
    isOffline,
    showBackOnline,
    installPrompt: installPrompt && !installDismissed ? installPrompt : null,
    isInstalled,
    triggerInstall,
    dismissInstall,
    updateAvailable,
    applyUpdate,
  };

  return (
    <>
      {pwa.isOffline && (
        <div className="pwa-banner pwa-banner--offline" role="alert">
          <WifiOff size={14} />
          <span>{t(messages, 'pwa.offline')}</span>
        </div>
      )}

      {pwa.showBackOnline && !pwa.isOffline && (
        <div className="pwa-banner pwa-banner--online" role="status">
          <Wifi size={14} />
          <span>{t(messages, 'pwa.back_online')}</span>
        </div>
      )}

      {pwa.updateAvailable && (
        <div className="pwa-banner pwa-banner--update" role="alert">
          <RefreshCw size={14} />
          <span>{t(messages, 'pwa.update_available')}</span>
          <button className="pwa-banner__action" onClick={pwa.applyUpdate}>
            {t(messages, 'pwa.update_action')}
          </button>
        </div>
      )}

      {pwa.installPrompt && !pwa.isInstalled && (
        <div className="pwa-banner pwa-banner--install" role="complementary">
          <Download size={14} />
          <span>{t(messages, 'pwa.install_prompt')}</span>
          <button className="pwa-banner__action" onClick={pwa.triggerInstall}>
            {t(messages, 'pwa.install_action')}
          </button>
          <button className="pwa-banner__dismiss" onClick={pwa.dismissInstall} aria-label={t(messages, 'pwa.install_dismiss')}>
            &times;
          </button>
        </div>
      )}
    </>
  );
}
