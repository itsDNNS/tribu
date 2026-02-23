import { useState } from 'react';
import { useApp } from '../contexts/AppContext';
import { errorText } from '../lib/helpers';
import { t } from '../lib/i18n';
import { styles } from '../lib/styles';
import * as api from '../lib/api';

export default function ContactsView() {
  const { contacts, familyId, tokens, messages, ui, loadContacts, loadDashboard } = useApp();

  const [contactsCsv, setContactsCsv] = useState('');
  const [contactsMsg, setContactsMsg] = useState('');

  async function importContactsCsv(e) {
    e.preventDefault();
    const { ok, data } = await api.apiImportContactsCsv(Number(familyId), contactsCsv);
    if (!ok) return setContactsMsg(errorText(data?.detail, 'Kontakte konnten nicht importiert werden'));
    setContactsCsv('');
    await Promise.all([loadContacts(), loadDashboard()]);
    setContactsMsg(`Kontakte importiert: ${data.created}`);
  }

  return (
    <div style={ui.card}>
      <h2>{t(messages, 'contacts')}</h2>
      {contactsMsg && <p>{contactsMsg}</p>}
      <form onSubmit={importContactsCsv} style={styles.formGrid}>
        <label style={{ color: tokens.muted, fontSize: 13 }}>{t(messages, 'contacts_csv_hint')}</label>
        <textarea style={{ ...ui.input, minHeight: 140 }} value={contactsCsv} onChange={(e) => setContactsCsv(e.target.value)} placeholder={t(messages, 'contacts_csv_hint')} />
        <button style={ui.primaryBtn} type="submit">{t(messages, 'contacts_import')}</button>
      </form>

      <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
        {contacts.map((c) => (
          <div key={c.id} style={ui.smallCard}>
            <strong>{c.full_name}</strong>
            <small>{c.email || c.phone || '-'}</small>
            {(c.birthday_month && c.birthday_day) && <small>🎂 {c.birthday_day}.{c.birthday_month}.</small>}
          </div>
        ))}
      </div>
    </div>
  );
}
