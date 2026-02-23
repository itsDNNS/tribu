import { useState } from 'react';
import { useApp } from '../contexts/AppContext';
import { errorText } from '../lib/helpers';
import { t } from '../lib/i18n';
import * as api from '../lib/api';

export default function AdminView() {
  const { familyId, members, ui, messages, loadMembers } = useApp();
  const [adminMsg, setAdminMsg] = useState('');

  async function handleSetAdult(userId, isAdult) {
    await api.apiSetAdult(familyId, userId, isAdult);
    await loadMembers();
  }

  async function handleSetRole(userId, role) {
    const { ok, data } = await api.apiSetRole(familyId, userId, role);
    if (!ok) {
      setAdminMsg(errorText(data?.detail, 'Failed to set role'));
      return;
    }
    await loadMembers();
  }

  return (
    <div style={ui.card}>
      <h2>{t(messages, 'admin_members')}</h2>
      {adminMsg && <p>{adminMsg}</p>}
      {members.map((m) => (
        <div key={m.user_id} style={{ ...ui.smallCard, marginBottom: 8 }}>
          <strong>{m.display_name}</strong> <small>({m.email})</small><br />
          <small>{t(messages, 'role')}: {m.role} | {m.is_adult ? t(messages, 'adult') : t(messages, 'child')}</small>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button style={ui.secondaryBtn} onClick={() => handleSetAdult(m.user_id, !m.is_adult)}>{m.is_adult ? t(messages, 'set_child') : t(messages, 'set_adult')}</button>
            <button style={ui.secondaryBtn} onClick={() => handleSetRole(m.user_id, 'admin')}>{t(messages, 'make_admin')}</button>
            <button style={ui.secondaryBtn} onClick={() => handleSetRole(m.user_id, 'member')}>{t(messages, 'make_member')}</button>
          </div>
        </div>
      ))}
    </div>
  );
}
