import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, RefreshCw, WifiOff, Wifi } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { t } from '../lib/i18n';

export function PWABanners() {
  const { messages } = useApp();
  const [isOffline, setIsOffline] = useState(false);
  const [showBackOnline, setShowBackOnline] = useState(false);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const waitingWorkerRef = useRef(null);

  useEffect(() => {
    setIsOffline(!navigator.onLine);
    let backOnlineTimer;

    const goOffline = () => setIsOffline(true);
    const goOnline = () => {
      setIsOffline(false);
      setShowBackOnline(true);
      backOnlineTimer = setTimeout(() => setShowBackOnline(false), 3000);
    };

    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
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

    navigator.serviceWorker.register('/sw.js').then((registration) => {
      reg = registration;

      if (registration.waiting) {
        waitingWorkerRef.current = registration.waiting;
        setUpdateAvailable(true);
      }

      updateFoundHandler = () => {
        const newWorker = registration.installing;
        if (!newWorker) return;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            waitingWorkerRef.current = newWorker;
            setUpdateAvailable(true);
          }
        });
      };
      registration.addEventListener('updatefound', updateFoundHandler);
    }).catch(() => {});

    let refreshing = false;
    const onControllerChange = () => {
      if (!refreshing) {
        refreshing = true;
        window.location.reload();
      }
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      if (reg && updateFoundHandler) {
        reg.removeEventListener('updatefound', updateFoundHandler);
      }
    };
  }, []);

  const applyUpdate = useCallback(() => {
    if (waitingWorkerRef.current) {
      waitingWorkerRef.current.postMessage({ type: 'SKIP_WAITING' });
    }
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
