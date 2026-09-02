import { useCallback, useEffect, useState } from 'react';
import { Store, Trash2 } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { useToast } from '../../contexts/ToastContext';
import { errorText } from '../../lib/helpers';
import { t } from '../../lib/i18n';
import { buildStoreSearchUrl, storeLinkHost } from '../../lib/storeSearch';
import * as api from '../../lib/api';

const emptyForm = { name: '', url_template: '' };

function format(messages, key, values = {}) {
  let value = t(messages, key);
  for (const [name, replacement] of Object.entries(values)) value = value.replace(`{${name}}`, replacement);
  return value;
}

export default function StoreLinksTab() {
  const { familyId, messages } = useApp();
  const { success: toastSuccess, error: toastError } = useToast();
  const [storeLinks, setStoreLinks] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [busy, setBusy] = useState(false);

  const loadStoreLinks = useCallback(async () => {
    if (!familyId) return;
    const res = await api.apiGetShoppingStoreLinks(familyId);
    if (res.ok) setStoreLinks(res.data || []);
  }, [familyId]);

  useEffect(() => { loadStoreLinks(); }, [loadStoreLinks]);

  function resetForm() {
    setForm(emptyForm);
    setEditingId(null);
  }

  function startEdit(link) {
    setForm({ name: link.name, url_template: link.url_template });
    setEditingId(link.id);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!familyId) return;
    setBusy(true);
    const values = { name: form.name.trim(), url_template: form.url_template.trim() };
    try {
      const res = editingId === null
        ? await api.apiCreateShoppingStoreLink({ family_id: Number(familyId), ...values })
        : await api.apiUpdateShoppingStoreLink(editingId, values);
      if (res.ok) {
        toastSuccess(t(messages, 'store_links_saved'));
        resetForm();
        await loadStoreLinks();
      } else {
        toastError(errorText(res.data?.detail, t(messages, 'store_links_save_failed'), messages));
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(link) {
    if (!window.confirm(format(messages, 'store_links_delete_confirm', { name: link.name }))) return;
    const res = await api.apiDeleteShoppingStoreLink(link.id);
    if (res.ok) {
      toastSuccess(t(messages, 'store_links_deleted'));
      if (editingId === link.id) resetForm();
      await loadStoreLinks();
    }
  }

  const previewQuery = t(messages, 'store_links_preview_query');
  const preview = buildStoreSearchUrl(form.url_template, previewQuery);
  const canSubmit = !busy && familyId && form.name.trim() && form.url_template.trim();

  return (
    <div className="settings-grid">
      <div className="settings-section">
        <div className="settings-section-title"><Store size={16} /> {t(messages, 'store_links_title')}</div>
        <p className="settings-help">{t(messages, 'store_links_help')}</p>
        <p className="settings-help">{t(messages, 'store_links_privacy')}</p>
        <form className="settings-form" onSubmit={handleSubmit}>
          <div className="form-field">
            <label className="set-label" htmlFor="store-link-name">{t(messages, 'store_links_name_label')}</label>
            <input id="store-link-name" className="form-input" value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              placeholder={t(messages, 'store_links_name_placeholder')} required maxLength={80} />
          </div>
          <div className="form-field">
            <label className="set-label" htmlFor="store-link-url">{t(messages, 'store_links_url_label')}</label>
            <input id="store-link-url" className="form-input" type="text" inputMode="url" autoComplete="off"
              value={form.url_template}
              onChange={(event) => setForm((current) => ({ ...current, url_template: event.target.value }))}
              placeholder={t(messages, 'store_links_url_placeholder')} required maxLength={500} />
            <p className="settings-help">{t(messages, 'store_links_url_help')}</p>
            <p className="settings-help" aria-live="polite">
              {preview
                ? <>{t(messages, 'store_links_preview_label')}: <span className="store-link-preview">{preview.url}</span></>
                : t(messages, 'store_links_preview_missing')}
            </p>
          </div>
          <div className="settings-row-actions">
            <button className="btn-sm" disabled={!canSubmit} type="submit">
              {t(messages, editingId === null ? 'store_links_add' : 'store_links_save')}
            </button>
            {editingId !== null && <button className="btn-ghost" type="button" onClick={resetForm}>{t(messages, 'cancel')}</button>}
          </div>
        </form>
      </div>

      <div className="settings-section">
        <div className="settings-section-title">{t(messages, 'store_links_configured')}</div>
        {storeLinks.length === 0 ? <p className="settings-help">{t(messages, 'store_links_empty')}</p> : (
          <div className="settings-list">
            {storeLinks.map((link) => (
              <div key={link.id} className="settings-list-item">
                <div><strong>{link.name}</strong><div className="muted-text">{storeLinkHost(link.url_template) || t(messages, 'store_links_host_unknown')}</div></div>
                <div className="settings-row-actions">
                  <button className="btn-ghost" type="button" onClick={() => startEdit(link)}>{t(messages, 'store_links_edit')}</button>
                  <button className="btn-ghost" type="button"
                    aria-label={format(messages, 'store_links_delete_label', { name: link.name })}
                    onClick={() => handleDelete(link)}><Trash2 size={16} aria-hidden="true" /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
