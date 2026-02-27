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
    <div className="settings-grid stagger">
      <div className="settings-section glass">
        <div className="settings-section-title"><Bell size={16} /> {t(messages, 'notification_settings')}</div>
        <div style={{ display: 'grid', gap: 'var(--space-md)' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.88rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={notifPrefs.reminders_enabled}
              onChange={(e) => setNotifPrefs((p) => ({ ...p, reminders_enabled: e.target.checked }))}
            />
            {t(messages, 'notification_reminders_enabled')}
          </label>

          <div className="form-field">
            <label style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{t(messages, 'notification_reminder_minutes')}</label>
            <select
              className="form-input"
              value={notifPrefs.reminder_minutes}
              onChange={(e) => setNotifPrefs((p) => ({ ...p, reminder_minutes: Number(e.target.value) }))}
              style={{ maxWidth: 200 }}
            >
              <option value={15}>{t(messages, 'notification_minutes_15')}</option>
              <option value={30}>{t(messages, 'notification_minutes_30')}</option>
              <option value={60}>{t(messages, 'notification_minutes_60')}</option>
            </select>
          </div>

          <div className="form-field">
            <label style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{t(messages, 'notification_quiet_hours')}</label>
            <div style={{ display: 'flex', gap: 'var(--space-sm)', alignItems: 'center' }}>
              <input
                type="time"
                className="form-input"
                value={notifPrefs.quiet_start}
                onChange={(e) => setNotifPrefs((p) => ({ ...p, quiet_start: e.target.value }))}
                style={{ maxWidth: 140 }}
                placeholder={t(messages, 'notification_quiet_start')}
              />
              <span style={{ color: 'var(--text-muted)' }}>&ndash;</span>
              <input
                type="time"
                className="form-input"
                value={notifPrefs.quiet_end}
                onChange={(e) => setNotifPrefs((p) => ({ ...p, quiet_end: e.target.value }))}
                style={{ maxWidth: 140 }}
                placeholder={t(messages, 'notification_quiet_end')}
              />
            </div>
          </div>

          <button className="btn-sm" onClick={handleSaveNotifPrefs} style={{ justifySelf: 'start' }}>
            {t(messages, 'notification_save')}
          </button>

          {pushSupported && (
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 'var(--space-md)', marginTop: 'var(--space-sm)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: 'var(--space-sm)' }}>
                <BellRing size={16} />
                <span style={{ fontWeight: 600, fontSize: '0.88rem' }}>{t(messages, 'push_notifications')}</span>
              </div>
              {pushSubscription ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                  <span style={{ fontSize: '0.85rem', color: 'var(--success)' }}>{t(messages, 'push_enabled')}</span>
                  <button className="btn-ghost" onClick={pushUnsubscribe} style={{ fontSize: '0.82rem' }}>
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
                    <p style={{ fontSize: '0.78rem', color: 'var(--warning)', marginTop: 'var(--space-sm)' }}>
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
