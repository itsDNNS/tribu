import { useState } from 'react';
import { useApp } from '../contexts/AppContext';
import { errorText } from '../lib/helpers';
import { t } from '../lib/i18n';
import * as api from '../lib/api';

export default function AdminView() {
  const { familyId, members, messages, loadMembers } = useApp();
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
    <div className="view-enter">
      <div className="view-header">
        <div>
          <h1 className="view-title">{t(messages, 'admin_members')}</h1>
        </div>
      </div>
      {adminMsg && <p style={{ color: 'var(--danger)', marginBottom: 'var(--space-md)' }}>{adminMsg}</p>}
      <div className="settings-grid">
        {members.map((m) => (
          <div key={m.user_id} className="glass-sm settings-section">
            <div className="profile-row">
              <div className="sidebar-user-avatar">{m.display_name?.[0] || '?'}</div>
              <div className="profile-info">
                <div className="profile-name">{m.display_name}</div>
                <div className="profile-email">{m.email}</div>
                <span className="profile-role">{m.role} · {m.is_adult ? t(messages, 'adult') : t(messages, 'child')}</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-sm)', marginTop: 'var(--space-md)' }}>
              <button className="btn-ghost" onClick={() => handleSetAdult(m.user_id, !m.is_adult)}>{m.is_adult ? t(messages, 'set_child') : t(messages, 'set_adult')}</button>
              <button className="btn-ghost" onClick={() => handleSetRole(m.user_id, 'admin')}>{t(messages, 'make_admin')}</button>
              <button className="btn-ghost" onClick={() => handleSetRole(m.user_id, 'member')}>{t(messages, 'make_member')}</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
