import { useState, useEffect, useCallback } from 'react';
import { Bell, BellRing } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { useToast } from '../../contexts/ToastContext';
import { t } from '../../lib/i18n';
import usePushSubscription from '../../hooks/usePushSubscription';
import * as api from '../../lib/api';

export default function NotificationsTab() {
  const { messages, loggedIn, demoMode } = useApp();
  const { success: toastSuccess } = useToast();
  const { pushSupported, pushSubscription, pushPermission, subscribe: pushSubscribe, unsubscribe: pushUnsubscribe } = usePushSubscription(loggedIn, demoMode);

  const [notifPrefs, setNotifPrefs] = useState({ reminders_enabled: true, reminder_minutes: 30, quiet_start: '', quiet_end: '' });

  const loadNotifPrefs = useCallback(async () => {
    if (!loggedIn || demoMode) return;
    const res = await api.apiGetNotificationPreferences();
    if (res.ok) setNotifPrefs({
      reminders_enabled: res.data.reminders_enabled,
      reminder_minutes: res.data.reminder_minutes,
      quiet_start: res.data.quiet_start || '',
      quiet_end: res.data.quiet_end || '',
    });
  }, [loggedIn, demoMode]);

  useEffect(() => { loadNotifPrefs(); }, [loadNotifPrefs]);

  async function handleSaveNotifPrefs() {
    const payload = {
      ...notifPrefs,
      quiet_start: notifPrefs.quiet_start || null,
      quiet_end: notifPrefs.quiet_end || null,
    };
    const res = await api.apiUpdateNotificationPreferences(payload);
    if (res.ok) {
      toastSuccess(t(messages, 'notification_saved'));
    }
  }

  return (
    <div className="settings-grid">
      <div className="settings-section">
        <div className="settings-section-title"><Bell size={16} /> {t(messages, 'notification_settings')}</div>
        <div className="set-notif-grid">
          <label className="set-checkbox-label">
            <input
              type="checkbox"
              checked={notifPrefs.reminders_enabled}
              onChange={(e) => setNotifPrefs((p) => ({ ...p, reminders_enabled: e.target.checked }))}
            />
            {t(messages, 'notification_reminders_enabled')}
          </label>

          <div className="form-field">
            <label className="set-label">{t(messages, 'notification_reminder_minutes')}</label>
            <select
              className="form-input set-input-narrow"
              value={notifPrefs.reminder_minutes}
              onChange={(e) => setNotifPrefs((p) => ({ ...p, reminder_minutes: Number(e.target.value) }))}
            >
              <option value={15}>{t(messages, 'notification_minutes_15')}</option>
              <option value={30}>{t(messages, 'notification_minutes_30')}</option>
              <option value={60}>{t(messages, 'notification_minutes_60')}</option>
            </select>
          </div>

          <div className="form-field">
            <label className="set-label">{t(messages, 'notification_quiet_hours')}</label>
            <div className="set-time-row">
              <input
                type="time"
                className="form-input set-input-time"
                value={notifPrefs.quiet_start}
                onChange={(e) => setNotifPrefs((p) => ({ ...p, quiet_start: e.target.value }))}
                placeholder={t(messages, 'notification_quiet_start')}
              />
              <span className="set-separator">&ndash;</span>
              <input
                type="time"
                className="form-input set-input-time"
                value={notifPrefs.quiet_end}
                onChange={(e) => setNotifPrefs((p) => ({ ...p, quiet_end: e.target.value }))}
                placeholder={t(messages, 'notification_quiet_end')}
              />
            </div>
          </div>

          <button className="btn-sm set-save-btn" onClick={handleSaveNotifPrefs}>
            {t(messages, 'notification_save')}
          </button>

          {pushSupported && (
            <div className="set-push-section">
              <div className="set-push-header">
                <BellRing size={16} />
                <span className="set-push-title">{t(messages, 'push_notifications')}</span>
              </div>
              {pushSubscription ? (
                <div className="set-push-status">
                  <span className="set-push-enabled">{t(messages, 'push_enabled')}</span>
                  <button className="btn-ghost set-push-disable" onClick={pushUnsubscribe}>
                    {t(messages, 'push_disable')}
                  </button>
                </div>
              ) : (
                <div>
                  <button
                    className="btn-sm"
                    onClick={pushSubscribe}
                    disabled={pushPermission === 'denied'}
                  >
                    {t(messages, 'push_enable')}
                  </button>
                  {pushPermission === 'denied' && (
                    <p className="set-push-blocked">
                      {t(messages, 'push_blocked_hint')}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
