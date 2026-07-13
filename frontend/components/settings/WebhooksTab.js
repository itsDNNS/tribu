import { useCallback, useEffect, useState } from 'react';
import { PlugZap, Trash2 } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { useToast } from '../../contexts/ToastContext';
import { t } from '../../lib/i18n';
import * as api from '../../lib/api';

const WEBHOOK_EVENTS = [
  ['calendar.event.created', 'webhooks_event_calendar_event_created'],
  ['task.created', 'webhooks_event_task_created'],
  ['task.updated', 'webhooks_event_task_updated'],
  ['shopping.list.created', 'webhooks_event_shopping_list_created'],
  ['shopping.list.updated', 'webhooks_event_shopping_list_updated'],
  ['shopping.item.created', 'webhooks_event_shopping_item_created'],
  ['shopping.item.updated', 'webhooks_event_shopping_item_updated'],
  ['quick_capture.created', 'webhooks_event_quick_capture_created'],
  ['birthday.created', 'webhooks_event_birthday_created'],
];

const emptyForm = {
  name: '',
  url: '',
  events: ['calendar.event.created', 'task.created', 'shopping.item.created'],
  active: true,
  secret_header_name: '',
  secret_header_value: '',
};

export default function WebhooksTab() {
  const { familyId, messages } = useApp();
  const msg = useCallback((key, fallback) => t(messages, key, fallback), [messages]);
  const { success: toastSuccess, error: toastError } = useToast();
  const [webhooks, setWebhooks] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);

  const loadWebhooks = useCallback(async () => {
    if (!familyId) return;
    const res = await api.apiListWebhooks(familyId);
    if (res.ok) setWebhooks(res.data || []);
  }, [familyId]);

  useEffect(() => { loadWebhooks(); }, [loadWebhooks]);

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
    setBusy(true);
    try {
      const payload = {
        family_id: Number(familyId),
        name: form.name,
        url: form.url,
        events: form.events,
        active: form.active,
        secret_header_name: form.secret_header_name || null,
        secret_header_value: form.secret_header_value || null,
      };
      const res = await api.apiCreateWebhook(payload);
      if (res.ok) {
        toastSuccess(msg('toast.webhook_saved', 'Webhook saved'));
        setForm(emptyForm);
        await loadWebhooks();
      } else {
        toastError(msg('toast.webhook_save_failed', 'Webhook could not be saved'));
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleToggle(endpoint) {
    const res = await api.apiUpdateWebhook(endpoint.id, { active: !endpoint.active });
    if (res.ok) await loadWebhooks();
  }

  async function handleDelete(endpoint) {
    const res = await api.apiDeleteWebhook(endpoint.id);
    if (res.ok) {
      toastSuccess(msg('toast.webhook_deleted', 'Webhook deleted'));
      await loadWebhooks();
    }
  }

  async function handleTest(endpoint) {
    const res = await api.apiTestWebhook(endpoint.id);
    if (res.ok) {
      toastSuccess(res.data.status === 'delivered'
        ? msg('toast.webhook_test_sent', 'Test webhook sent')
        : msg('toast.webhook_test_failed', 'Test webhook failed'));
      await loadWebhooks();
    } else {
      toastError(msg('toast.webhook_test_send_failed', 'Test webhook could not be sent'));
    }
  }

  return (
    <div className="settings-grid">
      <div className="settings-section">
        <div className="settings-section-title"><PlugZap size={16} /> {msg('automation_webhooks', 'Automation Webhooks')}</div>
        <p className="settings-help">{msg('webhooks_help', 'Send Tribu events to Home Assistant, Node-RED, ntfy, Gotify or other automation platforms. URLs and secret values are not shown in full in the interface.')}</p>

        <form className="settings-form" onSubmit={handleCreate}>
          <div className="form-field">
            <label className="set-label" htmlFor="webhook-name">{msg('name', 'Name')}</label>
            <input
              id="webhook-name"
              className="form-input"
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              placeholder="Home Assistant"
              required
            />
          </div>
          <div className="form-field">
            <label className="set-label" htmlFor="webhook-url">{msg('webhooks_url_label', 'Webhook URL')}</label>
            <input
              id="webhook-url"
              className="form-input"
              type="url"
              value={form.url}
              onChange={(event) => setForm((current) => ({ ...current, url: event.target.value }))}
              placeholder="https://example.local/api/webhook/..."
              required
            />
          </div>
          <div className="form-field">
            <label className="set-label" htmlFor="webhook-secret-header">{msg('webhooks_secret_header_label', 'Optional secret header')}</label>
            <div className="set-time-row">
              <input
                id="webhook-secret-header"
                className="form-input"
                value={form.secret_header_name}
                onChange={(event) => setForm((current) => ({ ...current, secret_header_name: event.target.value }))}
                placeholder="X-Tribu-Secret"
              />
              <input
                className="form-input"
                type="password"
                value={form.secret_header_value}
                onChange={(event) => setForm((current) => ({ ...current, secret_header_value: event.target.value }))}
                placeholder={msg('webhooks_secret_value_placeholder', 'Secret value')}
              />
            </div>
          </div>
          <fieldset className="settings-checklist">
            <legend className="set-label">{msg('webhooks_events_legend', 'Events')}</legend>
            {WEBHOOK_EVENTS.map(([eventName, labelKey]) => (
              <label key={eventName} className="set-checkbox-label">
                <input
                  type="checkbox"
                  checked={form.events.includes(eventName)}
                  onChange={() => toggleEvent(eventName)}
                />
                <span>{msg(labelKey, eventName)}</span>
              </label>
            ))}
          </fieldset>
          <label className="set-checkbox-label">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(event) => setForm((current) => ({ ...current, active: event.target.checked }))}
            />
            {msg('webhooks_active', 'Active')}
          </label>
          <button className="btn-sm" disabled={busy || form.events.length === 0} type="submit">{msg('webhooks_add', 'Add webhook')}</button>
        </form>
      </div>

      <div className="settings-section">
        <div className="settings-section-title">{msg('webhooks_configured', 'Configured webhooks')}</div>
        {webhooks.length === 0 ? (
          <p className="settings-help">{msg('webhooks_none', 'No webhooks configured yet.')}</p>
        ) : (
          <div className="settings-list">
            {webhooks.map((endpoint) => (
              <div key={endpoint.id} className="settings-list-item">
                <div>
                  <strong>{endpoint.name}</strong>
                  <div className="muted-text">{endpoint.url_redacted}</div>
                  <div className="muted-text">{endpoint.events.join(', ')}</div>
                  {endpoint.has_secret && (
                    <div className="muted-text">
                      {msg('webhooks_secret_header_display', 'Secret header: {name}').replace(
                        '{name}',
                        endpoint.secret_header_name || msg('webhooks_secret_header_set', 'set')
                      )}
                    </div>
                  )}
                </div>
                <div className="settings-row-actions">
                  <button className="btn-ghost" onClick={() => handleToggle(endpoint)}>
                    {endpoint.active ? msg('webhooks_disable', 'Disable') : msg('webhooks_enable', 'Enable')}
                  </button>
                  <button className="btn-sm" onClick={() => handleTest(endpoint)}>{msg('webhooks_send_test', 'Send test')}</button>
                  <button className="btn-ghost" aria-label={msg('webhooks_delete_aria', 'Delete {name}').replace('{name}', endpoint.name)} onClick={() => handleDelete(endpoint)}>
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
