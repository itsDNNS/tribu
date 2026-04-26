import { useEffect, useState } from 'react';
import { Database, Rss, Download, Upload, ChevronUp, ChevronDown, Plus, Copy, Check, RefreshCw, Trash2 } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { useToast } from '../../contexts/ToastContext';
import { copyTextToClipboard, downloadBlob } from '../../lib/helpers';
import { t } from '../../lib/i18n';
import * as api from '../../lib/api';

export default function DataTab() {
  const { messages, familyId, loadContacts, loadDashboard } = useApp();
  const { error: toastError } = useToast();

  // Data management state
  const [showCalImport, setShowCalImport] = useState(false);
  const [icsText, setIcsText] = useState('');
  const [calMsg, setCalMsg] = useState('');
  const [calErrors, setCalErrors] = useState([]);
  const [icsSubUrl, setIcsSubUrl] = useState('');
  const [icsSubName, setIcsSubName] = useState('');
  const [icsSubMsg, setIcsSubMsg] = useState('');
  const [icsSubErrors, setIcsSubErrors] = useState([]);
  const [calendarSubscriptions, setCalendarSubscriptions] = useState([]);
  const [subscriptionBusyId, setSubscriptionBusyId] = useState(null);
  const [subscriptionsLoading, setSubscriptionsLoading] = useState(false);
  const [showContactsImport, setShowContactsImport] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [contactsMsg, setContactsMsg] = useState('');
  const [rowErrors, setRowErrors] = useState([]);

  // Subscription state
  const [subToken, setSubToken] = useState('');
  const [subCreating, setSubCreating] = useState(false);
  const [subCopiedCal, setSubCopiedCal] = useState(false);
  const [subCopiedContacts, setSubCopiedContacts] = useState(false);
  const [subShowHints, setSubShowHints] = useState(false);

  const subCalendarUrl = subToken ? `${window.location.origin}/api/calendar/events/feed.ics?family_id=${familyId}&token=${subToken}` : '';
  const subContactsUrl = subToken ? `${window.location.origin}/api/contacts/feed.vcf?family_id=${familyId}&token=${subToken}` : '';


  function formatSubscriptionCounts(subscription) {
    const template = t(messages, 'module.calendar.subscription_last_counts') || 'Created {created}, updated {updated}, skipped {skipped}';
    return template
      .replace('{created}', subscription?.last_created ?? 0)
      .replace('{updated}', subscription?.last_updated ?? 0)
      .replace('{skipped}', subscription?.last_skipped ?? 0);
  }

  function subscriptionStatusLabel(subscription) {
    const status = subscription?.last_sync_status || 'pending';
    return t(messages, `module.calendar.subscription_status_${status}`) || status;
  }

  async function loadCalendarSubscriptions() {
    if (!familyId) return;
    setSubscriptionsLoading(true);
    const res = await api.apiGetCalendarSubscriptions(Number(familyId));
    setSubscriptionsLoading(false);
    if (res.ok) {
      setCalendarSubscriptions(res.data || []);
    } else {
      setIcsSubMsg(t(messages, 'module.calendar.subscription_loaded_error') || 'Could not load saved feeds');
    }
  }

  useEffect(() => {
    loadCalendarSubscriptions();
  }, [familyId]);

  async function handleCreateSubToken() {
    setSubCreating(true);
    const res = await api.apiCreateToken({
      name: `Feed subscription (${new Date().toLocaleDateString()})`,
      scopes: ['calendar:read', 'contacts:read'],
    });
    setSubCreating(false);
    if (res.ok) {
      setSubToken(res.data.token);
    }
  }

  async function handleCopySubUrl(url, type) {
    if (!await copyTextToClipboard(url)) return;
    if (type === 'calendar') {
      setSubCopiedCal(true);
      setTimeout(() => setSubCopiedCal(false), 2000);
    } else {
      setSubCopiedContacts(true);
      setTimeout(() => setSubCopiedContacts(false), 2000);
    }
  }

  async function handleExportIcs() {
    try {
      const res = await api.apiExportCalendarIcs(familyId);
      if (!res.ok) return toastError(t(messages, 'module.calendar.export_error') || 'Export failed');
      const blob = await res.blob();
      downloadBlob(blob, 'tribu-calendar.ics');
    } catch {
      toastError(t(messages, 'module.calendar.export_error') || 'Export failed');
    }
  }

  function formatPreviewMessage(data) {
    const template = t(messages, 'module.calendar.preview_success') || 'Preview: would create {created}, update {updated}, skip {skipped}. No calendar changes yet.';
    return template
      .replace('{created}', data?.would_create ?? 0)
      .replace('{updated}', data?.would_update ?? 0)
      .replace('{skipped}', data?.would_skip ?? 0);
  }

  async function handlePreviewImportIcs() {
    setCalMsg('');
    setCalErrors([]);
    const { ok, data } = await api.apiPreviewImportCalendarIcs(Number(familyId), icsText);
    if (!ok) {
      const detail = data?.detail ? `: ${data.detail}` : '';
      return setCalMsg(`${t(messages, 'module.calendar.preview_error') || 'Preview failed'}${detail}`);
    }
    setCalMsg(formatPreviewMessage(data));
    if (data.errors?.length) setCalErrors(data.errors);
  }

  async function handleImportIcs(e) {
    e.preventDefault();
    setCalMsg('');
    setCalErrors([]);
    const { ok, data } = await api.apiImportCalendarIcs(Number(familyId), icsText);
    if (!ok) return setCalMsg(t(messages, 'module.calendar.import_error') || 'Import failed');
    setCalMsg(t(messages, 'module.calendar.import_success').replace('{count}', data.created));
    if (data.errors?.length) setCalErrors(data.errors);
    setIcsText('');
  }

  async function handlePreviewSubscribeIcs() {
    setIcsSubMsg('');
    setIcsSubErrors([]);
    const { ok, data } = await api.apiPreviewSubscribeCalendarIcs(Number(familyId), icsSubUrl, icsSubName);
    if (!ok) {
      const detail = data?.detail ? `: ${data.detail}` : '';
      return setIcsSubMsg(`${t(messages, 'module.calendar.preview_error') || 'Preview failed'}${detail}`);
    }
    setIcsSubMsg(formatPreviewMessage(data));
    if (data.errors?.length) setIcsSubErrors(data.errors);
  }

  async function handleSubscribeIcs(e) {
    e.preventDefault();
    setIcsSubMsg('');
    setIcsSubErrors([]);
    const { ok, data } = await api.apiCreateCalendarSubscription(Number(familyId), icsSubUrl, icsSubName);
    if (!ok) {
      const detail = data?.detail ? `: ${data.detail}` : '';
      return setIcsSubMsg(`${t(messages, 'module.calendar.subscription_error') || 'Subscription failed'}${detail}`);
    }
    const template = t(messages, 'module.calendar.subscription_success') || 'Created {created}, updated {updated}, skipped {skipped}.';
    setIcsSubMsg(template
      .replace('{created}', data.last_created ?? 0)
      .replace('{updated}', data.last_updated ?? 0)
      .replace('{skipped}', data.last_skipped ?? 0));
    const latestErrors = data.sync_history?.[0]?.error_summary ? [{ index: 0, summary: data.name, error: data.sync_history[0].error_summary }] : [];
    if (latestErrors.length) setIcsSubErrors(latestErrors);
    setIcsSubUrl('');
    setIcsSubName('');
    await Promise.all([loadCalendarSubscriptions(), loadDashboard()]);
  }

  async function handleRefreshManagedSubscription(subscriptionId) {
    setSubscriptionBusyId(subscriptionId);
    setIcsSubMsg('');
    setIcsSubErrors([]);
    const { ok, data } = await api.apiRefreshCalendarSubscription(subscriptionId);
    setSubscriptionBusyId(null);
    if (!ok) {
      const detail = data?.detail ? `: ${data.detail}` : '';
      return setIcsSubMsg(`${t(messages, 'module.calendar.subscription_error') || 'Subscription failed'}${detail}`);
    }
    const template = t(messages, 'module.calendar.subscription_success') || 'Created {created}, updated {updated}, skipped {skipped}.';
    setIcsSubMsg(template
      .replace('{created}', data.last_created ?? 0)
      .replace('{updated}', data.last_updated ?? 0)
      .replace('{skipped}', data.last_skipped ?? 0));
    const latestErrors = data.sync_history?.[0]?.error_summary ? [{ index: 0, summary: data.name, error: data.sync_history[0].error_summary }] : [];
    if (latestErrors.length) setIcsSubErrors(latestErrors);
    await Promise.all([loadCalendarSubscriptions(), loadDashboard()]);
  }

  async function handleDeleteManagedSubscription(subscriptionId) {
    setSubscriptionBusyId(subscriptionId);
    const { ok, data } = await api.apiDeleteCalendarSubscription(subscriptionId);
    setSubscriptionBusyId(null);
    if (!ok) {
      const detail = data?.detail ? `: ${data.detail}` : '';
      return setIcsSubMsg(`${t(messages, 'module.calendar.subscription_error') || 'Subscription failed'}${detail}`);
    }
    setIcsSubMsg(t(messages, 'module.calendar.subscription_deleted') || 'Feed removed. Existing events stay in the calendar.');
    await loadCalendarSubscriptions();
  }

  function handleIcsFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setIcsText(ev.target.result);
    reader.readAsText(file);
  }

  async function handleExportCsv() {
    try {
      const res = await api.apiExportContactsCsv(familyId);
      if (!res.ok) return toastError(t(messages, 'module.contacts.export_error') || 'Export failed');
      const blob = await res.blob();
      downloadBlob(blob, 'tribu-contacts.csv');
    } catch {
      toastError(t(messages, 'module.contacts.export_error') || 'Export failed');
    }
  }

  async function handleImportCsv(e) {
    e.preventDefault();
    setRowErrors([]);
    setContactsMsg('');
    const { ok, data } = await api.apiImportContactsCsv(Number(familyId), csvText);
    if (!ok) return setContactsMsg(t(messages, 'module.contacts.import_error') || 'Import failed');
    setCsvText('');
    await Promise.all([loadContacts(), loadDashboard()]);
    setContactsMsg(`${t(messages, 'module.contacts.import_success')} ${data.created}`);
    if (data.row_errors?.length) setRowErrors(data.row_errors);
  }

  return (
    <div className="settings-grid">
      {/* Data Management */}
      <div className="settings-section">
        <div className="settings-section-title"><Database size={16} /> {t(messages, 'data_management')}</div>
        <p className="set-data-section-desc">
          {t(messages, 'data_management_desc')}
        </p>

        {/* Calendar (ICS) */}
        <div className="set-data-block">
          <div className="set-data-sub-heading">
            {t(messages, 'calendar')} (ICS)
          </div>
          <div className="set-data-btn-row">
            <button className="btn-ghost" onClick={handleExportIcs}>
              <Download size={15} /> {t(messages, 'module.calendar.export')}
            </button>
            <button className="btn-ghost" onClick={() => setShowCalImport(!showCalImport)}>
              {showCalImport ? <ChevronUp size={15} /> : <Upload size={15} />}
              {showCalImport ? t(messages, 'module.calendar.close_import') : t(messages, 'module.calendar.import')}
            </button>
          </div>
          <div className="settings-subsection">
            <form onSubmit={handleSubscribeIcs} className="quick-add-form">
              <label className="set-data-form-hint">{t(messages, 'module.calendar.subscription_hint')}</label>
              <input
                className="form-input"
                type="url"
                value={icsSubUrl}
                onChange={(e) => setIcsSubUrl(e.target.value)}
                placeholder={t(messages, 'module.calendar.subscription_url_placeholder')}
              />
              <input
                className="form-input"
                type="text"
                value={icsSubName}
                onChange={(e) => setIcsSubName(e.target.value)}
                placeholder={t(messages, 'module.calendar.subscription_name_placeholder')}
              />
              <div className="set-data-btn-row">
                <button className="btn-ghost" type="button" disabled={!icsSubUrl.trim()} onClick={handlePreviewSubscribeIcs}>
                  {t(messages, 'module.calendar.preview_subscription_submit')}
                </button>
                <button className="btn-primary" type="submit" disabled={!icsSubUrl.trim()}>
                  {t(messages, 'module.calendar.subscription_create_submit') || t(messages, 'module.calendar.subscription_submit')}
                </button>
              </div>
            </form>
            {icsSubMsg && (
              <p className="set-data-msg" style={{ color: icsSubErrors.length === 0 && !icsSubMsg.includes(t(messages, 'module.calendar.subscription_error')) ? 'var(--success)' : 'var(--danger)' }}>
                {icsSubMsg}
              </p>
            )}
            {icsSubErrors.length > 0 && (
              <div className="set-data-warning">
                <strong>{t(messages, 'module.calendar.subscription_warnings')}:</strong>
                <ul className="set-data-warning-list">
                  {icsSubErrors.map((err, i) => (
                    <li key={i}>#{err.index} {err.summary ? `"${err.summary}"` : ''}: {err.error}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="settings-subsection">
              <div className="set-data-sub-heading">{t(messages, 'module.calendar.managed_subscriptions')}</div>
              {subscriptionsLoading && <p className="set-data-muted-info">...</p>}
              {!subscriptionsLoading && calendarSubscriptions.length === 0 && (
                <p className="set-data-muted-info">{t(messages, 'module.calendar.managed_subscriptions_empty')}</p>
              )}
              {calendarSubscriptions.map((subscription) => (
                <div key={subscription.id} className="set-data-block">
                  <div className="set-data-flex-row">
                    <div className="set-data-flex-grow">
                      <strong>{subscription.name}</strong>
                      <div><code>{subscription.source_url}</code></div>
                      <p className="set-data-muted-info">
                        {subscriptionStatusLabel(subscription)} · {formatSubscriptionCounts(subscription)}
                        {subscription.last_sync_error ? ` · ${subscription.last_sync_error}` : ''}
                      </p>
                      {subscription.sync_history?.length > 0 && (
                        <details>
                          <summary>{t(messages, 'module.calendar.subscription_history')}</summary>
                          <ul className="set-data-warning-list">
                            {subscription.sync_history.map((sync) => (
                              <li key={sync.id}>{sync.status}: {sync.created}/{sync.updated}/{sync.skipped}{sync.error_summary ? ` · ${sync.error_summary}` : ''}</li>
                            ))}
                          </ul>
                        </details>
                      )}
                    </div>
                    <button className="btn-ghost set-data-no-shrink" type="button" disabled={subscriptionBusyId === subscription.id} onClick={() => handleRefreshManagedSubscription(subscription.id)}>
                      <RefreshCw size={14} /> {t(messages, 'module.calendar.subscription_refresh')}
                    </button>
                    <button className="btn-ghost set-data-no-shrink" type="button" disabled={subscriptionBusyId === subscription.id} onClick={() => handleDeleteManagedSubscription(subscription.id)}>
                      <Trash2 size={14} /> {t(messages, 'module.calendar.subscription_delete')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
          {showCalImport && (
            <div className="settings-subsection">
              {calMsg && (
                <p className="set-data-msg" style={{ color: calErrors.length === 0 && calMsg.includes(t(messages, 'module.calendar.import_success').split('{')[0]) ? 'var(--success)' : 'var(--danger)' }}>
                  {calMsg}
                </p>
              )}
              {calErrors.length > 0 && (
                <div className="set-data-warning">
                  <strong>{t(messages, 'module.calendar.import_warnings')}:</strong>
                  <ul className="set-data-warning-list">
                    {calErrors.map((err, i) => (
                      <li key={i}>#{err.index} {err.summary ? `"${err.summary}"` : ''}: {err.error}</li>
                    ))}
                  </ul>
                </div>
              )}
              <form onSubmit={handleImportIcs} className="quick-add-form">
                <label className="set-data-form-hint">{t(messages, 'module.calendar.import_hint')}</label>
                <input type="file" accept=".ics" onChange={handleIcsFile} className="form-input set-data-file-input" />
                <textarea
                  className="form-input set-data-textarea-ics"
                  value={icsText}
                  onChange={(e) => setIcsText(e.target.value)}
                  placeholder={t(messages, 'module.calendar.import_placeholder')}
                />
                <div className="set-data-btn-row">
                  <button className="btn-ghost" type="button" disabled={!icsText.trim()} onClick={handlePreviewImportIcs}>
                    {t(messages, 'module.calendar.preview_import_submit')}
                  </button>
                  <button className="btn-primary" type="submit" disabled={!icsText.trim()}>
                    {t(messages, 'module.calendar.import_submit')}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>

        {/* Contacts (CSV) */}
        <div>
          <div className="set-data-sub-heading">
            {t(messages, 'contacts')} (CSV)
          </div>
          <div className="set-data-btn-row">
            <button className="btn-ghost" onClick={handleExportCsv}>
              <Download size={15} /> {t(messages, 'module.contacts.export')}
            </button>
            <button className="btn-ghost" onClick={() => setShowContactsImport(!showContactsImport)}>
              {showContactsImport ? <ChevronUp size={15} /> : <Upload size={15} />}
              {showContactsImport ? t(messages, 'module.contacts.close') : t(messages, 'module.contacts.import')}
            </button>
          </div>
          {showContactsImport && (
            <div className="settings-subsection">
              {contactsMsg && (
                <p className="set-data-msg" style={{ color: contactsMsg.includes(t(messages, 'module.contacts.import_success')) ? 'var(--success)' : 'var(--danger)' }}>
                  {contactsMsg}
                </p>
              )}
              {rowErrors.length > 0 && (
                <div className="set-data-warning">
                  <strong>{t(messages, 'module.contacts.import_warnings')}:</strong>
                  <ul className="set-data-warning-list">
                    {rowErrors.map((re, i) => (
                      <li key={i}>{t(messages, 'module.contacts.row')} {re.row} ({re.name}): {re.errors.join(', ')}</li>
                    ))}
                  </ul>
                </div>
              )}
              <form onSubmit={handleImportCsv} className="quick-add-form">
                <label className="set-data-form-hint">{t(messages, 'contacts_csv_hint')}</label>
                <textarea
                  className="form-input set-data-textarea-csv"
                  value={csvText}
                  onChange={(e) => setCsvText(e.target.value)}
                  placeholder={t(messages, 'contacts_csv_hint')}
                />
                <button className="btn-primary" type="submit" disabled={!csvText.trim()}>
                  {t(messages, 'contacts_import')}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>

      {/* Subscriptions */}
      <div className="settings-section">
        <div className="settings-section-title"><Rss size={16} /> {t(messages, 'subscriptions')}</div>
        <p className="set-data-section-desc">
          {t(messages, 'subscriptions_desc')}
        </p>

        {subToken ? (
          <div className="set-data-sub-grid">
            {/* Calendar Feed URL */}
            <div>
              <label className="set-data-sub-heading--block">
                {t(messages, 'sub_calendar_feed')}
              </label>
              <div className="set-data-flex-row">
                <code className="token-display set-data-flex-grow">{subCalendarUrl}</code>
                <button className="btn-ghost set-data-no-shrink" onClick={() => handleCopySubUrl(subCalendarUrl, 'calendar')}>
                  {subCopiedCal ? <><Check size={14} /> {t(messages, 'sub_copied')}</> : <><Copy size={14} /> {t(messages, 'sub_copy')}</>}
                </button>
              </div>
            </div>

            {/* Contacts Feed URL */}
            <div>
              <label className="set-data-sub-heading--block">
                {t(messages, 'sub_contacts_feed')}
              </label>
              <div className="set-data-flex-row">
                <code className="token-display set-data-flex-grow">{subContactsUrl}</code>
                <button className="btn-ghost set-data-no-shrink" onClick={() => handleCopySubUrl(subContactsUrl, 'contacts')}>
                  {subCopiedContacts ? <><Check size={14} /> {t(messages, 'sub_copied')}</> : <><Copy size={14} /> {t(messages, 'sub_copy')}</>}
                </button>
              </div>
            </div>

            {/* Setup Hints */}
            <div>
              <button className="btn-ghost set-data-hints-btn" onClick={() => setSubShowHints(!subShowHints)}>
                {subShowHints ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                {t(messages, 'sub_setup_hints')}
              </button>
              {subShowHints && (
                <div className="settings-subsection set-data-hints-content">
                  <div>
                    <strong>{t(messages, 'sub_setup_android_title')}</strong>
                    <p className="set-data-hint-para">{t(messages, 'sub_setup_android')}</p>
                  </div>
                  <div>
                    <strong>{t(messages, 'sub_setup_ios_title')}</strong>
                    <p className="set-data-hint-para">{t(messages, 'sub_setup_ios')}</p>
                  </div>
                  <div>
                    <p className="set-data-hint-para--flush">{t(messages, 'sub_setup_contacts_hint')}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div>
            <p className="set-data-muted-info">
              {t(messages, 'sub_token_missing')}
            </p>
            <button className="btn-sm" onClick={handleCreateSubToken} disabled={subCreating}>
              <Plus size={14} /> {subCreating ? t(messages, 'sub_creating') : t(messages, 'sub_create_token')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
