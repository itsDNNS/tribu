import { useState } from 'react';
import { Database, Rss, Download, Upload, ChevronUp, ChevronDown, Plus, Copy, Check } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { useToast } from '../../contexts/ToastContext';
import { downloadBlob } from '../../lib/helpers';
import { t } from '../../lib/i18n';
import * as api from '../../lib/api';

export default function DataTab() {
  const { messages, familyId, loggedIn, demoMode, loadContacts, loadDashboard } = useApp();
  const { error: toastError } = useToast();

  // Data management state
  const [showCalImport, setShowCalImport] = useState(false);
  const [icsText, setIcsText] = useState('');
  const [calMsg, setCalMsg] = useState('');
  const [calErrors, setCalErrors] = useState([]);
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

  function handleCopySubUrl(url, type) {
    navigator.clipboard.writeText(url);
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
    <div className="settings-grid stagger">
      {/* Data Management */}
      <div className="settings-section glass">
        <div className="settings-section-title"><Database size={16} /> {t(messages, 'data_management')}</div>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: 1.5, marginBottom: 'var(--space-md)' }}>
          {t(messages, 'data_management_desc')}
        </p>

        {/* Calendar (ICS) */}
        <div style={{ marginBottom: 'var(--space-lg)' }}>
          <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 'var(--space-sm)' }}>
            {t(messages, 'calendar')} (ICS)
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-sm)', marginBottom: 'var(--space-sm)' }}>
            <button className="btn-ghost" onClick={handleExportIcs}>
              <Download size={15} /> {t(messages, 'module.calendar.export')}
            </button>
            <button className="btn-ghost" onClick={() => setShowCalImport(!showCalImport)}>
              {showCalImport ? <ChevronUp size={15} /> : <Upload size={15} />}
              {showCalImport ? t(messages, 'module.calendar.close_import') : t(messages, 'module.calendar.import')}
            </button>
          </div>
          {showCalImport && (
            <div className="glass-sm" style={{ padding: 'var(--space-md)' }}>
              {calMsg && (
                <p style={{ marginBottom: 'var(--space-sm)', fontSize: '0.88rem', color: calErrors.length === 0 && calMsg.includes(t(messages, 'module.calendar.import_success').split('{')[0]) ? 'var(--success)' : 'var(--danger)' }}>
                  {calMsg}
                </p>
              )}
              {calErrors.length > 0 && (
                <div style={{ marginBottom: 'var(--space-sm)', fontSize: '0.82rem', color: 'var(--warning, #f6ad55)' }}>
                  <strong>{t(messages, 'module.calendar.import_warnings')}:</strong>
                  <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
                    {calErrors.map((err, i) => (
                      <li key={i}>#{err.index} {err.summary ? `"${err.summary}"` : ''}: {err.error}</li>
                    ))}
                  </ul>
                </div>
              )}
              <form onSubmit={handleImportIcs} className="quick-add-form">
                <label style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>{t(messages, 'module.calendar.import_hint')}</label>
                <input type="file" accept=".ics" onChange={handleIcsFile} className="form-input" style={{ padding: '10px 12px' }} />
                <textarea
                  className="form-input"
                  style={{ minHeight: 100 }}
                  value={icsText}
                  onChange={(e) => setIcsText(e.target.value)}
                  placeholder={t(messages, 'module.calendar.import_placeholder')}
                />
                <button className="btn-primary" type="submit" disabled={!icsText.trim()}>
                  {t(messages, 'module.calendar.import_submit')}
                </button>
              </form>
            </div>
          )}
        </div>

        {/* Contacts (CSV) */}
        <div>
          <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 'var(--space-sm)' }}>
            {t(messages, 'contacts')} (CSV)
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-sm)', marginBottom: 'var(--space-sm)' }}>
            <button className="btn-ghost" onClick={handleExportCsv}>
              <Download size={15} /> {t(messages, 'module.contacts.export')}
            </button>
            <button className="btn-ghost" onClick={() => setShowContactsImport(!showContactsImport)}>
              {showContactsImport ? <ChevronUp size={15} /> : <Upload size={15} />}
              {showContactsImport ? t(messages, 'module.contacts.close') : t(messages, 'module.contacts.import')}
            </button>
          </div>
          {showContactsImport && (
            <div className="glass-sm" style={{ padding: 'var(--space-md)' }}>
              {contactsMsg && (
                <p style={{ marginBottom: 'var(--space-sm)', fontSize: '0.88rem', color: contactsMsg.includes(t(messages, 'module.contacts.import_success')) ? 'var(--success)' : 'var(--danger)' }}>
                  {contactsMsg}
                </p>
              )}
              {rowErrors.length > 0 && (
                <div style={{ marginBottom: 'var(--space-sm)', fontSize: '0.82rem', color: 'var(--warning, #f6ad55)' }}>
                  <strong>{t(messages, 'module.contacts.import_warnings')}:</strong>
                  <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
                    {rowErrors.map((re, i) => (
                      <li key={i}>{t(messages, 'module.contacts.row')} {re.row} ({re.name}): {re.errors.join(', ')}</li>
                    ))}
                  </ul>
                </div>
              )}
              <form onSubmit={handleImportCsv} className="quick-add-form">
                <label style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>{t(messages, 'contacts_csv_hint')}</label>
                <textarea
                  className="form-input"
                  style={{ minHeight: 120 }}
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
      <div className="settings-section glass">
        <div className="settings-section-title"><Rss size={16} /> {t(messages, 'subscriptions')}</div>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: 1.5, marginBottom: 'var(--space-md)' }}>
          {t(messages, 'subscriptions_desc')}
        </p>

        {subToken ? (
          <div style={{ display: 'grid', gap: 'var(--space-md)' }}>
            {/* Calendar Feed URL */}
            <div>
              <label style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 'var(--space-sm)', display: 'block' }}>
                {t(messages, 'sub_calendar_feed')}
              </label>
              <div style={{ display: 'flex', gap: 'var(--space-sm)', alignItems: 'center' }}>
                <code className="token-display" style={{ flex: 1 }}>{subCalendarUrl}</code>
                <button className="btn-ghost" onClick={() => handleCopySubUrl(subCalendarUrl, 'calendar')} style={{ flexShrink: 0 }}>
                  {subCopiedCal ? <><Check size={14} /> {t(messages, 'sub_copied')}</> : <><Copy size={14} /> {t(messages, 'sub_copy')}</>}
                </button>
              </div>
            </div>

            {/* Contacts Feed URL */}
            <div>
              <label style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 'var(--space-sm)', display: 'block' }}>
                {t(messages, 'sub_contacts_feed')}
              </label>
              <div style={{ display: 'flex', gap: 'var(--space-sm)', alignItems: 'center' }}>
                <code className="token-display" style={{ flex: 1 }}>{subContactsUrl}</code>
                <button className="btn-ghost" onClick={() => handleCopySubUrl(subContactsUrl, 'contacts')} style={{ flexShrink: 0 }}>
                  {subCopiedContacts ? <><Check size={14} /> {t(messages, 'sub_copied')}</> : <><Copy size={14} /> {t(messages, 'sub_copy')}</>}
                </button>
              </div>
            </div>

            {/* Setup Hints */}
            <div>
              <button className="btn-ghost" onClick={() => setSubShowHints(!subShowHints)} style={{ fontSize: '0.85rem' }}>
                {subShowHints ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                {t(messages, 'sub_setup_hints')}
              </button>
              {subShowHints && (
                <div className="glass-sm" style={{ padding: 'var(--space-md)', marginTop: 'var(--space-sm)', display: 'grid', gap: 'var(--space-md)', fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  <div>
                    <strong>{t(messages, 'sub_setup_android_title')}</strong>
                    <p style={{ margin: '4px 0 0' }}>{t(messages, 'sub_setup_android')}</p>
                  </div>
                  <div>
                    <strong>{t(messages, 'sub_setup_ios_title')}</strong>
                    <p style={{ margin: '4px 0 0' }}>{t(messages, 'sub_setup_ios')}</p>
                  </div>
                  <div>
                    <p style={{ margin: 0 }}>{t(messages, 'sub_setup_contacts_hint')}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: 'var(--space-sm)' }}>
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
