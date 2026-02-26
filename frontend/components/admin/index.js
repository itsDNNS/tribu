import { useState } from 'react';
import { Plus, Check, Copy, X, KeyRound } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { errorText } from '../../lib/helpers';
import { t } from '../../lib/i18n';
import * as api from '../../lib/api';
import InviteSection from './InviteSection';
import BackupSection from './BackupSection';
import AuditLogSection from './AuditLogSection';

export default function AdminView() {
  const { familyId, members, messages, loadMembers, me, demoMode } = useApp();
  const [adminMsg, setAdminMsg] = useState('');
  const [showAddMember, setShowAddMember] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState('member');
  const [newIsAdult, setNewIsAdult] = useState(false);
  const [createdPassword, setCreatedPassword] = useState(null);
  const [passwordBannerType, setPasswordBannerType] = useState('created');
  const [copied, setCopied] = useState(false);
  const [creating, setCreating] = useState('');

  async function handleRemoveMember(userId) {
    if (!confirm(t(messages, 'remove_member_confirm'))) return;
    setAdminMsg('');
    const { ok, data } = await api.apiRemoveMember(familyId, userId);
    if (!ok) {
      setAdminMsg(errorText(data?.detail, 'Failed to remove member'));
      return;
    }
    await loadMembers();
  }

  async function handleSetAdult(userId, isAdult) {
    const { ok, data } = await api.apiSetAdult(familyId, userId, isAdult);
    if (!ok) {
      setAdminMsg(errorText(data?.detail, 'Failed'));
      return;
    }
    const member = members.find((m) => m.user_id === userId);
    if (data?.role && member && data.role !== member.role) {
      setAdminMsg(t(messages, 'admin_demoted'));
    }
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

  async function handleCreateMember(e) {
    e.preventDefault();
    setCreating('loading');
    setAdminMsg('');
    const { ok, data } = await api.apiCreateMember(familyId, {
      email: newEmail,
      display_name: newName,
      role: newRole,
      is_adult: newIsAdult,
    });
    if (!ok) {
      setAdminMsg(errorText(data?.detail, 'Failed to create member'));
      setCreating('');
      return;
    }
    setCreatedPassword(data.temporary_password);
    setPasswordBannerType('created');
    setShowAddMember(false);
    setNewEmail('');
    setNewName('');
    setNewRole('member');
    setNewIsAdult(false);
    setCreating('');
    await loadMembers();
  }

  async function handleResetPassword(userId) {
    setAdminMsg('');
    const { ok, data } = await api.apiResetMemberPassword(familyId, userId);
    if (!ok) {
      setAdminMsg(errorText(data?.detail, 'Failed to reset password'));
      return;
    }
    setCreatedPassword(data.temporary_password);
    setPasswordBannerType('reset');
  }

  function handleCopyPassword() {
    if (!createdPassword) return;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(createdPassword).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }).catch(fallbackCopy);
    } else {
      fallbackCopy();
    }
    function fallbackCopy() {
      const ta = document.createElement('textarea');
      ta.value = createdPassword;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <div className="view-enter">
      <div className="view-header">
        <div>
          <h1 className="view-title">{t(messages, 'admin_members')}</h1>
        </div>
      </div>
      {adminMsg && <p className="admin-error">{adminMsg}</p>}

      {/* Member Created Banner */}
      {createdPassword && (
        <div style={{
          background: 'rgba(16, 185, 129, 0.1)',
          border: '1px solid rgba(16, 185, 129, 0.3)',
          borderRadius: 'var(--radius-sm)',
          padding: 'var(--space-md)',
          marginBottom: 'var(--space-md)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: 'var(--space-sm)' }}>
            <Check size={16} style={{ color: 'var(--success)' }} />
            <span style={{ fontWeight: 600, fontSize: '0.88rem' }}>{t(messages, passwordBannerType === 'reset' ? 'password_was_reset' : 'member_created')}</span>
          </div>
          <p style={{ color: 'var(--warning)', fontSize: '0.82rem', marginBottom: 'var(--space-sm)' }}>
            {t(messages, 'member_created_warning')}
          </p>
          <div style={{ display: 'flex', gap: 'var(--space-sm)', alignItems: 'center' }}>
            <code className="token-display">{createdPassword}</code>
            <button className="btn-ghost" onClick={handleCopyPassword} style={{ flexShrink: 0 }}>
              {copied ? <><Check size={14} /> {t(messages, 'token_copied')}</> : <><Copy size={14} /> {t(messages, 'token_copy')}</>}
            </button>
          </div>
          <button
            onClick={() => { setCreatedPassword(null); setCopied(false); }}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', marginTop: 'var(--space-sm)', fontSize: '0.78rem' }}
          >
            <X size={12} style={{ verticalAlign: 'middle' }} /> Dismiss
          </button>
        </div>
      )}

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
            <div className="admin-actions">
              {m.user_id === me?.user_id ? (
                <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>{t(messages, 'admin_self_hint')}</span>
              ) : (
                <>
                  <button className="btn-ghost" onClick={() => handleSetAdult(m.user_id, !m.is_adult)}>{m.is_adult ? t(messages, 'set_child') : t(messages, 'set_adult')}</button>
                  <button className="btn-ghost" onClick={() => handleSetRole(m.user_id, 'admin')}>{t(messages, 'make_admin')}</button>
                  <button className="btn-ghost" onClick={() => handleSetRole(m.user_id, 'member')}>{t(messages, 'make_member')}</button>
                  <button className="btn-ghost" onClick={() => handleResetPassword(m.user_id)}><KeyRound size={13} /> {t(messages, 'reset_password')}</button>
                  <button className="btn-ghost" style={{ color: 'var(--danger)' }} onClick={() => handleRemoveMember(m.user_id)}><X size={13} /> {t(messages, 'remove_member')}</button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Add Member */}
      {!demoMode && (
        <div style={{ marginTop: 'var(--space-md)' }}>
          {showAddMember ? (
            <form onSubmit={handleCreateMember}>
              <div className="glass-sm settings-section" style={{ padding: 'var(--space-md)', display: 'grid', gap: 'var(--space-md)' }}>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: 1.5 }}>
                  {t(messages, 'add_member_desc')}
                </p>
                <div className="form-field">
                  <label>{t(messages, 'member_email')}</label>
                  <input
                    className="form-input"
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="form-field">
                  <label>{t(messages, 'member_name')}</label>
                  <input
                    className="form-input"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    required
                  />
                </div>
                <div className="form-field">
                  <label>{t(messages, 'member_role')}</label>
                  <select
                    className="form-input"
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value)}
                  >
                    <option value="member">{t(messages, 'member')}</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.88rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={newIsAdult}
                    onChange={(e) => setNewIsAdult(e.target.checked)}
                  />
                  {t(messages, 'member_is_adult')}
                </label>
                <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
                  <button type="submit" className="btn-sm" disabled={!newEmail.trim() || !newName.trim() || creating === 'loading'}>
                    <Plus size={14} /> {t(messages, 'add_member')}
                  </button>
                  <button type="button" className="btn-ghost" onClick={() => setShowAddMember(false)}>
                    {t(messages, 'cancel')}
                  </button>
                </div>
              </div>
            </form>
          ) : (
            <button className="btn-ghost" onClick={() => setShowAddMember(true)}>
              <Plus size={14} /> {t(messages, 'add_member')}
            </button>
          )}
        </div>
      )}

      <InviteSection />
      <BackupSection />
      <AuditLogSection />
    </div>
  );
}
