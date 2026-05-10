import { useCallback, useEffect, useState } from 'react';
import { BellRing, Trash2 } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { useToast } from '../../contexts/ToastContext';
import { t } from '../../lib/i18n';
import * as api from '../../lib/api';

const DESTINATION_EVENTS = [
  ['calendar.reminder', 'notification_destinations_event_calendar'],
  ['task.reminder', 'notification_destinations_event_task'],
  ['birthday.reminder', 'notification_destinations_event_birthday'],
];

const emptyForm = {
  name: '',
  target_url_secret: '',
  events: ['calendar.reminder', 'task.reminder', 'birthday.reminder'],
  active: true,
  respect_quiet_hours: true,
};

export default function NotificationDestinationsTab() {
  const { familyId, messages } = useApp();
  const { success: toastSuccess, error: toastError } = useToast();
  const [destinations, setDestinations] = useState([]);
  const [providerStatus, setProviderStatus] = useState({ available: true });
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);

  const loadDestinations = useCallback(async () => {
    if (!familyId) return;
    const res = await api.apiListNotificationDestinations(familyId);
    if (res.ok) setDestinations(res.data || []);
  }, [familyId]);

  const loadProviderStatus = useCallback(async () => {
    const res = await api.apiGetNotificationDestinationProviderStatus();
    if (res.ok) setProviderStatus(res.data || { available: false });
  }, []);

  useEffect(() => { loadProviderStatus(); }, [loadProviderStatus]);
  useEffect(() => { loadDestinations(); }, [loadDestinations]);

  function toggleEvent(eventName) {
    setForm((current) => {
      const hasEvent = current.events.includes(eventName);
      return {
        ...current,
        events: hasEvent
          ? current.events.filter((event) => event !== eventName)
          : [...current.events, eventName],
      };
    });
  }

  async function handleCreate(event) {
    event.preventDefault();
    if (!familyId || !providerStatus.available) return;
    setBusy(true);
    try {
      const res = await api.apiCreateNotificationDestination({
        family_id: Number(familyId),
        name: form.name.trim(),
        target_url_secret: form.target_url_secret.trim(),
        events: form.events,
        active: form.active,
        respect_quiet_hours: form.respect_quiet_hours,
      });
      if (res.ok) {
        toastSuccess(t(messages, 'notification_destinations_saved'));
        setForm(emptyForm);
        await loadDestinations();
      } else {
        toastError(t(messages, 'notification_destinations_save_failed'));
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleToggle(destination) {
    const res = await api.apiUpdateNotificationDestination(destination.id, { active: !destination.active });
    if (res.ok) await loadDestinations();
  }

  async function handleDelete(destination) {
    const res = await api.apiDeleteNotificationDestination(destination.id);
    if (res.ok) {
      toastSuccess(t(messages, 'notification_destinations_deleted'));
      await loadDestinations();
    }
  }

  async function handleTest(destination) {
    const res = await api.apiTestNotificationDestination(destination.id);
    if (res.ok) {
      const delivered = res.data?.status === 'delivered';
      toastSuccess(t(messages, delivered ? 'notification_destinations_test_sent' : 'notification_destinations_test_failed'));
      await loadDestinations();
    } else {
      toastError(t(messages, 'notification_destinations_test_failed'));
    }
  }

  const providerAvailable = providerStatus?.available !== false;
  const canSubmit = providerAvailable && !busy && familyId && form.name.trim() && form.target_url_secret.trim() && form.events.length > 0;

  return (
    <div className="settings-grid">
      <div className="settings-section">
        <div className="settings-section-title"><BellRing size={16} /> {t(messages, 'notification_destinations_title')}</div>
        <p className="settings-help">{t(messages, 'notification_destinations_help')}</p>
        <p className="settings-help">{t(messages, 'notification_destinations_privacy')}</p>
        {!providerAvailable && (
          <p className="settings-help" role="status">{t(messages, 'notification_destinations_provider_unavailable')}</p>
        )}

        <form className="settings-form" onSubmit={handleCreate}>
          <div className="form-field">
            <label className="set-label" htmlFor="notification-destination-name">{t(messages, 'name')}</label>
            <input
              id="notification-destination-name"
              className="form-input"
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              placeholder={t(messages, 'notification_destinations_name_placeholder')}
              required
            />
          </div>
          <div className="form-field">
            <label className="set-label" htmlFor="notification-destination-url">{t(messages, 'notification_destinations_url')}</label>
            <input
              id="notification-destination-url"
              className="form-input"
              type="password"
              autoComplete="off"
              value={form.target_url_secret}
              onChange={(event) => setForm((current) => ({ ...current, target_url_secret: event.target.value }))}
              placeholder="ntfy://ntfy.sh/family-topic"
              required
            />
            <p className="settings-help">{t(messages, 'notification_destinations_examples')}</p>
          </div>
          <fieldset className="settings-checklist">
            <legend className="set-label">{t(messages, 'notification_destinations_events')}</legend>
            {DESTINATION_EVENTS.map(([eventName, labelKey]) => (
              <label key={eventName} className="set-checkbox-label">
                <input
                  type="checkbox"
                  checked={form.events.includes(eventName)}
                  onChange={() => toggleEvent(eventName)}
                />
                <span>{t(messages, labelKey)}</span>
              </label>
            ))}
          </fieldset>
          <label className="set-checkbox-label">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(event) => setForm((current) => ({ ...current, active: event.target.checked }))}
            />
            {t(messages, 'notification_destinations_active')}
          </label>
          <label className="set-checkbox-label">
            <input
              type="checkbox"
              checked={form.respect_quiet_hours}
              onChange={(event) => setForm((current) => ({ ...current, respect_quiet_hours: event.target.checked }))}
            />
            {t(messages, 'notification_destinations_respect_quiet_hours')}
          </label>
          <button className="btn-sm" disabled={!canSubmit} type="submit">
            {t(messages, 'notification_destinations_add')}
          </button>
        </form>
      </div>

      <div className="settings-section">
        <div className="settings-section-title">{t(messages, 'notification_destinations_configured')}</div>
        {destinations.length === 0 ? (
          <p className="settings-help">{t(messages, 'notification_destinations_empty')}</p>
        ) : (
          <div className="settings-list">
            {destinations.map((destination) => (
              <div key={destination.id} className="settings-list-item">
                <div>
                  <strong>{destination.name}</strong>
                  <div className="muted-text">{destination.url_redacted}</div>
                  <div className="muted-text">
                    {(destination.events || []).map((eventName) => {
                      const eventConfig = DESTINATION_EVENTS.find(([key]) => key === eventName);
                      return t(messages, eventConfig?.[1] || eventName);
                    }).join(', ')}
                  </div>
                  <div className="muted-text">
                    {t(messages, destination.active ? 'notification_destinations_status_active' : 'notification_destinations_status_inactive')}
                    {' · '}
                    {t(messages, 'notification_destinations_last_status')}: {destination.last_status || 'never'}
                  </div>
                  {destination.has_secret && <div className="muted-text">{t(messages, 'notification_destinations_secret_saved')}</div>}
                </div>
                <div className="settings-row-actions">
                  <button className="btn-ghost" onClick={() => handleToggle(destination)}>
                    {t(messages, destination.active ? 'notification_destinations_disable' : 'notification_destinations_enable')}
                  </button>
                  <button className="btn-sm" onClick={() => handleTest(destination)}>{t(messages, 'notification_destinations_send_test')}</button>
                  <button
                    className="btn-ghost"
                    aria-label={t(messages, 'notification_destinations_delete_label').replace('{name}', destination.name)}
                    onClick={() => handleDelete(destination)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
