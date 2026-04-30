import { useState, useEffect, useCallback } from 'react';
import { Bell, BellRing } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { useToast } from '../../contexts/ToastContext';
import { t } from '../../lib/i18n';
import usePushSubscription from '../../hooks/usePushSubscription';
import * as api from '../../lib/api';

const PUSH_CATEGORY_DEFAULTS = {
  calendar_reminders: true,
  task_due: true,
  birthdays: true,
  event_assignments: false,
  shopping_changes: false,
  meal_plan_changes: false,
  family_changes: false,
};

const PUSH_CATEGORY_ROWS = [
  ['calendar_reminders', 'push_category_calendar_reminders', 'push_category_calendar_reminders_desc'],
  ['task_due', 'push_category_task_due', 'push_category_task_due_desc'],
  ['birthdays', 'push_category_birthdays', 'push_category_birthdays_desc'],
  ['event_assignments', 'push_category_event_assignments', 'push_category_event_assignments_desc'],
  ['shopping_changes', 'push_category_shopping_changes', 'push_category_shopping_changes_desc'],
  ['meal_plan_changes', 'push_category_meal_plan_changes', 'push_category_meal_plan_changes_desc'],
  ['family_changes', 'push_category_family_changes', 'push_category_family_changes_desc'],
];

function normalizePushCategories(value) {
  return { ...PUSH_CATEGORY_DEFAULTS, ...(value || {}) };
}

function pushStatusCopy(messages, pushStatus, pushSupported, pushPermission, pushSubscription) {
  if (!pushSupported) {
    return {
      tone: 'warning',
      title: t(messages, 'push_unavailable_title'),
      detail: t(messages, 'push_unavailable_hint'),
    };
  }
  if (!pushStatus) return null;
  if (!pushStatus.server_configured) {
    return {
      tone: 'warning',
      title: t(messages, 'push_server_not_configured'),
      detail: t(messages, 'push_server_not_configured_hint'),
    };
  }
  if (pushPermission === 'denied') {
    return {
      tone: 'warning',
      title: t(messages, 'push_blocked'),
      detail: t(messages, 'push_blocked_hint'),
    };
  }
  if (!pushStatus.pywebpush_available) {
    return {
      tone: 'warning',
      title: t(messages, 'push_sender_unavailable'),
      detail: t(messages, 'push_sender_unavailable_hint'),
    };
  }
  if (!pushStatus.push_enabled) {
    return {
      tone: 'neutral',
      title: t(messages, 'push_device_not_subscribed'),
      detail: t(messages, 'push_device_not_subscribed_hint'),
    };
  }
  if (!pushSubscription || pushStatus.subscription_count === 0) {
    return {
      tone: 'neutral',
      title: t(messages, 'push_device_not_subscribed'),
      detail: t(messages, 'push_device_not_subscribed_hint'),
    };
  }
  return {
    tone: 'success',
    title: t(messages, 'push_ready_title'),
    detail: t(messages, 'push_ready_hint'),
  };
}

export default function NotificationsTab() {
  const { messages, loggedIn, demoMode } = useApp();
  const { success: toastSuccess } = useToast();
  const { pushSupported, pushSubscription, pushPermission, subscribe: pushSubscribe, unsubscribe: pushUnsubscribe } = usePushSubscription(loggedIn, demoMode);

  const [notifPrefs, setNotifPrefs] = useState({
    reminders_enabled: true,
    reminder_minutes: 30,
    quiet_start: '',
    quiet_end: '',
    push_categories: normalizePushCategories(null),
  });
  const [pushStatus, setPushStatus] = useState(null);
  const [pushBusy, setPushBusy] = useState(false);

  const loadNotifPrefs = useCallback(async () => {
    if (!loggedIn || demoMode) return;
    const res = await api.apiGetNotificationPreferences();
    if (res.ok) setNotifPrefs({
      reminders_enabled: res.data.reminders_enabled,
      reminder_minutes: res.data.reminder_minutes,
      quiet_start: res.data.quiet_start || '',
      quiet_end: res.data.quiet_end || '',
      push_categories: normalizePushCategories(res.data.push_categories),
    });
  }, [loggedIn, demoMode]);

  const loadPushStatus = useCallback(async () => {
    if (!loggedIn || demoMode) return;
    const res = await api.apiGetPushStatus();
    if (res.ok) setPushStatus(res.data);
  }, [loggedIn, demoMode]);

  useEffect(() => { loadNotifPrefs(); }, [loadNotifPrefs]);
  useEffect(() => { loadPushStatus(); }, [loadPushStatus, pushSubscription]);

  async function handleSaveNotifPrefs() {
    const payload = {
      ...notifPrefs,
      quiet_start: notifPrefs.quiet_start || null,
      quiet_end: notifPrefs.quiet_end || null,
    };
    const res = await api.apiUpdateNotificationPreferences(payload);
    if (res.ok) {
      toastSuccess(t(messages, 'notification_saved'));
      loadPushStatus();
    }
  }

  async function handlePushSubscribe() {
    setPushBusy(true);
    try {
      const ok = await pushSubscribe();
      if (ok) {
        toastSuccess(t(messages, 'push_subscribed'));
        await loadPushStatus();
      }
    } finally {
      setPushBusy(false);
    }
  }

  async function handlePushUnsubscribe() {
    setPushBusy(true);
    try {
      const ok = await pushUnsubscribe();
      if (ok) {
        toastSuccess(t(messages, 'push_unsubscribed'));
        await loadPushStatus();
      }
    } finally {
      setPushBusy(false);
    }
  }

  async function handleSendTestPush() {
    setPushBusy(true);
    try {
      const res = await api.apiSendTestPush();
      if (res.ok && res.data?.status === 'sent') {
        toastSuccess(t(messages, 'push_test_sent'));
      }
      await loadPushStatus();
    } finally {
      setPushBusy(false);
    }
  }

  const statusCopy = pushStatusCopy(messages, pushStatus, pushSupported, pushPermission, pushSubscription);
  const serverReady = Boolean(pushStatus?.server_configured && pushStatus?.pywebpush_available);
  const canSubscribe = pushSupported && serverReady && pushPermission !== 'denied' && !pushBusy;
  const canTestPush = Boolean(pushSupported && pushStatus?.ready && pushSubscription && !pushBusy);

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

          <div className="set-push-section">
            <div className="set-push-header">
              <BellRing size={16} />
              <span className="set-push-title">{t(messages, 'push_notifications')}</span>
            </div>
            <div className="set-push-category-section">
              <div className="set-push-category-title">{t(messages, 'push_categories_title')}</div>
              <p className="set-push-category-help">{t(messages, 'push_categories_help')}</p>
              <div className="set-push-category-list">
                {PUSH_CATEGORY_ROWS.map(([key, labelKey, descKey]) => (
                  <label className="set-push-category-row" key={key}>
                    <input
                      type="checkbox"
                      checked={Boolean(notifPrefs.push_categories?.[key])}
                      onChange={(e) => setNotifPrefs((p) => ({
                        ...p,
                        push_categories: {
                          ...normalizePushCategories(p.push_categories),
                          [key]: e.target.checked,
                        },
                      }))}
                    />
                    <span>
                      <strong>{t(messages, labelKey)}</strong>
                      <small>{t(messages, descKey)}</small>
                    </span>
                  </label>
                ))}
              </div>
            </div>
            {statusCopy && (
              <div className={`set-push-diagnostic set-push-diagnostic-${statusCopy.tone}`}>
                <strong>{statusCopy.title}</strong>
                <p>{statusCopy.detail}</p>
              </div>
            )}
            {pushSupported && (
              pushSubscription ? (
                <div className="set-push-status">
                  <span className="set-push-enabled">{t(messages, 'push_enabled')}</span>
                  <button className="btn-sm" onClick={handleSendTestPush} disabled={!canTestPush}>
                    {t(messages, 'push_test_send')}
                  </button>
                  <button className="btn-ghost set-push-disable" onClick={handlePushUnsubscribe} disabled={pushBusy}>
                    {t(messages, 'push_disable')}
                  </button>
                </div>
              ) : (
                <div>
                  <button
                    className="btn-sm"
                    onClick={handlePushSubscribe}
                    disabled={!canSubscribe}
                  >
                    {t(messages, 'push_enable')}
                  </button>
                </div>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
