import { Download, RefreshCw, WifiOff, Wifi } from 'lucide-react';
import { usePWA } from '../hooks/usePWA';
import { useApp } from '../contexts/AppContext';
import { t } from '../lib/i18n';

export function PWABanners() {
  const { messages } = useApp();
  const pwa = usePWA();

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
