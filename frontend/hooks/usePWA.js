import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * PWA lifecycle hook: offline detection, install prompt, and SW update.
 */
export function usePWA() {
  const [isOffline, setIsOffline] = useState(false);
  const [showBackOnline, setShowBackOnline] = useState(false);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const waitingWorkerRef = useRef(null);

  // Offline / online detection
  useEffect(() => {
    setIsOffline(!navigator.onLine);

    const goOffline = () => setIsOffline(true);
    const goOnline = () => {
      setIsOffline(false);
      setShowBackOnline(true);
      setTimeout(() => setShowBackOnline(false), 3000);
    };

    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);

  // Install prompt capture
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

  // SW update detection
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker.register('/sw.js').then((registration) => {
      // Check if an update is already waiting
      if (registration.waiting) {
        waitingWorkerRef.current = registration.waiting;
        setUpdateAvailable(true);
      }

      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (!newWorker) return;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            waitingWorkerRef.current = newWorker;
            setUpdateAvailable(true);
          }
        });
      });
    }).catch(() => {});

    // Reload when the new SW takes control
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!refreshing) {
        refreshing = true;
        window.location.reload();
      }
    });
  }, []);

  const applyUpdate = useCallback(() => {
    if (waitingWorkerRef.current) {
      waitingWorkerRef.current.postMessage({ type: 'SKIP_WAITING' });
    }
  }, []);

  const installDismissed = typeof window !== 'undefined'
    && localStorage.getItem('tribu_install_dismissed') === '1';

  return {
    isOffline,
    showBackOnline,
    installPrompt: installPrompt && !installDismissed ? installPrompt : null,
    isInstalled,
    triggerInstall,
    dismissInstall,
    updateAvailable,
    applyUpdate,
  };
}
