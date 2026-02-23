import { useState } from 'react';
import { UserPlus, ChevronDown, ChevronUp } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { errorText } from '../lib/helpers';
import { t } from '../lib/i18n';
import * as api from '../lib/api';

const AVATAR_COLORS = [
  'var(--member-1)', 'var(--member-2)', 'var(--member-3)', 'var(--member-4)',
  'var(--success)', 'var(--sapphire)', 'var(--warning)',
];

function getAvatarColor(name) {
  let hash = 0;
  for (let i = 0; i < (name || '').length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export default function ContactsView() {
  const { contacts, familyId, messages, loadContacts, loadDashboard } = useApp();

  const [contactsCsv, setContactsCsv] = useState('');
  const [contactsMsg, setContactsMsg] = useState('');
  const [showImport, setShowImport] = useState(false);

  async function importContactsCsv(e) {
    e.preventDefault();
    const { ok, data } = await api.apiImportContactsCsv(Number(familyId), contactsCsv);
    if (!ok) return setContactsMsg(errorText(data?.detail, 'Kontakte konnten nicht importiert werden'));
    setContactsCsv('');
    await Promise.all([loadContacts(), loadDashboard()]);
    setContactsMsg(`Kontakte importiert: ${data.created}`);
  }

  return (
    <div>
      <div className="view-header">
        <div>
          <div className="view-title">{t(messages, 'contacts')}</div>
          <div className="view-subtitle">{contacts.length} Kontakte</div>
        </div>
        <button className="btn-ghost" onClick={() => setShowImport(!showImport)}>
          {showImport ? <ChevronUp size={15} /> : <UserPlus size={15} />}
          {showImport ? 'Schließen' : 'Importieren'}
        </button>
      </div>

      {showImport && (
        <div className="glass" style={{ padding: 'var(--space-lg)', marginBottom: 'var(--space-md)' }}>
          {contactsMsg && <p style={{ marginBottom: 'var(--space-sm)', fontSize: '0.88rem', color: contactsMsg.includes('importiert') ? 'var(--success)' : 'var(--danger)' }}>{contactsMsg}</p>}
          <form onSubmit={importContactsCsv} className="quick-add-form">
            <label style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>{t(messages, 'contacts_csv_hint')}</label>
            <textarea
              className="form-input"
              style={{ minHeight: 120 }}
              value={contactsCsv}
              onChange={(e) => setContactsCsv(e.target.value)}
              placeholder={t(messages, 'contacts_csv_hint')}
            />
            <button className="btn-primary" type="submit">{t(messages, 'contacts_import')}</button>
          </form>
        </div>
      )}

      <div className="contacts-grid stagger">
        {contacts.map((c) => {
          const initials = (c.full_name || '?').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
          return (
            <div key={c.id} className="contact-card glass-sm">
              <div className="contact-avatar" style={{ background: getAvatarColor(c.full_name) }}>
                {initials}
              </div>
              <div className="contact-info">
                <div className="contact-name">{c.full_name}</div>
                {(c.email || c.phone) && (
                  <div className="contact-detail">{c.email || c.phone}</div>
                )}
                {c.birthday_month && c.birthday_day && (
                  <div className="contact-birthday">
                    🎂 {c.birthday_day}.{c.birthday_month}.
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {contacts.length === 0 && (
          <div className="glass-sm" style={{ padding: 'var(--space-xl)', textAlign: 'center', gridColumn: '1 / -1' }}>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>Noch keine Kontakte vorhanden</div>
            <button className="btn-ghost" style={{ marginTop: 'var(--space-md)' }} onClick={() => setShowImport(true)}>
              <UserPlus size={15} /> CSV importieren
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
