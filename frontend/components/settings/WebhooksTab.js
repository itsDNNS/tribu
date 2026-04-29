import { useCallback, useEffect, useState } from 'react';
import { PlugZap, Trash2 } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { useToast } from '../../contexts/ToastContext';
import * as api from '../../lib/api';

const WEBHOOK_EVENTS = [
  ['calendar.event.created', 'Termin erstellt'],
  ['task.created', 'Aufgabe erstellt'],
  ['task.updated', 'Aufgabe aktualisiert'],
  ['shopping.list.created', 'Einkaufsliste erstellt'],
  ['shopping.item.created', 'Einkaufsartikel erstellt'],
  ['shopping.item.updated', 'Einkaufsartikel aktualisiert'],
  ['quick_capture.created', 'Quick Capture erstellt'],
  ['birthday.created', 'Geburtstag erstellt'],
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
  const { familyId } = useApp();
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
        toastSuccess('Webhook gespeichert');
        setForm(emptyForm);
        await loadWebhooks();
      } else {
        toastError('Webhook konnte nicht gespeichert werden');
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
      toastSuccess('Webhook gelöscht');
      await loadWebhooks();
    }
  }

  async function handleTest(endpoint) {
    const res = await api.apiTestWebhook(endpoint.id);
    if (res.ok) {
      toastSuccess(res.data.status === 'delivered' ? 'Test-Webhook gesendet' : 'Test-Webhook fehlgeschlagen');
      await loadWebhooks();
    } else {
      toastError('Test-Webhook konnte nicht gesendet werden');
    }
  }

  return (
    <div className="settings-grid">
      <div className="settings-section">
        <div className="settings-section-title"><PlugZap size={16} /> Automation Webhooks</div>
        <p className="settings-help">
          Sende Tribu-Ereignisse an Home Assistant, Node-RED, ntfy, Gotify oder andere Automatisierungsplattformen.
          URLs und Secret-Werte werden in der Oberfläche nicht vollständig angezeigt.
        </p>

        <form className="settings-form" onSubmit={handleCreate}>
          <div className="form-field">
            <label className="set-label" htmlFor="webhook-name">Name</label>
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
            <label className="set-label" htmlFor="webhook-url">Webhook URL</label>
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
            <label className="set-label" htmlFor="webhook-secret-header">Optionaler Secret Header</label>
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
                placeholder="Secret Wert"
              />
            </div>
          </div>
          <fieldset className="settings-checklist">
            <legend className="set-label">Ereignisse</legend>
            {WEBHOOK_EVENTS.map(([eventName, label]) => (
              <label key={eventName} className="set-checkbox-label">
                <input
                  type="checkbox"
                  checked={form.events.includes(eventName)}
                  onChange={() => toggleEvent(eventName)}
                />
                <span>{label}</span>
              </label>
            ))}
          </fieldset>
          <label className="set-checkbox-label">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(event) => setForm((current) => ({ ...current, active: event.target.checked }))}
            />
            Aktiv
          </label>
          <button className="btn-sm" disabled={busy || form.events.length === 0} type="submit">Webhook hinzufügen</button>
        </form>
      </div>

      <div className="settings-section">
        <div className="settings-section-title">Konfigurierte Webhooks</div>
        {webhooks.length === 0 ? (
          <p className="settings-help">Noch keine Webhooks konfiguriert.</p>
        ) : (
          <div className="settings-list">
            {webhooks.map((endpoint) => (
              <div key={endpoint.id} className="settings-list-item">
                <div>
                  <strong>{endpoint.name}</strong>
                  <div className="muted-text">{endpoint.url_redacted}</div>
                  <div className="muted-text">{endpoint.events.join(', ')}</div>
                  {endpoint.has_secret && <div className="muted-text">Secret Header: {endpoint.secret_header_name || 'gesetzt'}</div>}
                </div>
                <div className="settings-row-actions">
                  <button className="btn-ghost" onClick={() => handleToggle(endpoint)}>
                    {endpoint.active ? 'Deaktivieren' : 'Aktivieren'}
                  </button>
                  <button className="btn-sm" onClick={() => handleTest(endpoint)}>Test senden</button>
                  <button className="btn-ghost" aria-label={`${endpoint.name} löschen`} onClick={() => handleDelete(endpoint)}>
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
