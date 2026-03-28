import { useState } from 'react';
import { useMemo } from 'react';
import { Plus, Check, Copy, X, KeyRound, Shield } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { useToast } from '../../contexts/ToastContext';
import { errorText } from '../../lib/helpers';
import { t } from '../../lib/i18n';
import * as api from '../../lib/api';
import ConfirmDialog from '../ConfirmDialog';
import InviteSection from './InviteSection';
import BackupSection from './BackupSection';
import AuditLogSection from './AuditLogSection';

export default function AdminView() {
  const { familyId, members, messages, loadMembers, me, demoMode, timeFormat, setTimeFormat } = useApp();
  const { error: toastError, info: toastInfo, success: toastSuccess } = useToast();
  const [showAddMember, setShowAddMember] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState('member');
  const [newIsAdult, setNewIsAdult] = useState(false);
  const [createdPassword, setCreatedPassword] = useState(null);
  const [passwordBannerType, setPasswordBannerType] = useState('created');
  const [copied, setCopied] = useState(false);
  const [creating, setCreating] = useState('');
  const [confirmAction, setConfirmAction] = useState(null);

  async function handleRemoveMember(userId) {
    setConfirmAction({
      title: t(messages, 'remove_member'),
      message: t(messages, 'remove_member_confirm'),
      danger: true,
      action: async () => {
        const { ok, data } = await api.apiRemoveMember(familyId, userId);
        if (!ok) {
          toastError(errorText(data?.detail, t(messages, 'toast.error'), messages));
        } else {
          await loadMembers();
        }
        setConfirmAction(null);
      },
    });
  }

  async function handleSetAdult(userId, isAdult) {
    const { ok, data } = await api.apiSetAdult(familyId, userId, isAdult);
    if (!ok) {
      toastError(errorText(data?.detail, t(messages, 'toast.error'), messages));
      return;
    }
    const member = members.find((m) => m.user_id === userId);
    if (data?.role && member && data.role !== member.role) {
      toastInfo(t(messages, 'admin_demoted'));
    }
    await loadMembers();
  }

  async function handleSetBirthdate(userId, dateOfBirth) {
    const { ok, data } = await api.apiSetMemberBirthdate(familyId, userId, dateOfBirth);
    if (!ok) return toastError(errorText(data?.detail, t(messages, 'toast.error'), messages));
    await loadMembers();
  }

  async function handleSetRole(userId, role) {
    const { ok, data } = await api.apiSetRole(familyId, userId, role);
    if (!ok) {
      toastError(errorText(data?.detail, t(messages, 'toast.error'), messages));
      return;
    }
    await loadMembers();
  }

  async function handleCreateMember(e) {
    e.preventDefault();
    setCreating('loading');
    const { ok, data } = await api.apiCreateMember(familyId, {
      email: newEmail,
      display_name: newName,
      role: newRole,
      is_adult: newIsAdult,
    });
    if (!ok) {
      toastError(errorText(data?.detail, t(messages, 'toast.error'), messages));
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
    const { ok, data } = await api.apiResetMemberPassword(familyId, userId);
    if (!ok) {
      toastError(errorText(data?.detail, t(messages, 'toast.error'), messages));
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
      {confirmAction && (
        <ConfirmDialog
          title={confirmAction.title}
          message={confirmAction.message}
          confirmDanger={confirmAction.danger}
          onConfirm={confirmAction.action}
          onCancel={() => setConfirmAction(null)}
          messages={messages}
        />
      )}
      <div className="view-header">
        <div>
          <h1 className="view-title">{t(messages, 'admin_members')}</h1>
        </div>
      </div>
      {/* Time Format Toggle */}
      <div className="admin-time-toggle">
        <span className="admin-time-label">{t(messages, 'time_format')}</span>
        <div className="rewards-tabs">
          <button className={`rewards-tab${timeFormat === '24h' ? ' active' : ''}`} onClick={async () => {
            const { ok } = await api.apiSetTimeFormat('24h');
            if (ok) setTimeFormat('24h'); else toastError(t(messages, 'toast.error'));
          }}>24h</button>
          <button className={`rewards-tab${timeFormat === '12h' ? ' active' : ''}`} onClick={async () => {
            const { ok } = await api.apiSetTimeFormat('12h');
            if (ok) setTimeFormat('12h'); else toastError(t(messages, 'toast.error'));
          }}>12h</button>
        </div>
      </div>

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
            <X size={12} style={{ verticalAlign: 'middle' }} /> {t(messages, 'dismiss')}
          </button>
        </div>
      )}

      <MemberGroups members={members} me={me} messages={messages} onSetAdult={handleSetAdult} onSetRole={handleSetRole} onResetPassword={handleResetPassword} onRemoveMember={handleRemoveMember} onSetBirthdate={handleSetBirthdate} />

      {/* Add Member */}
      {!demoMode && (
        <div style={{ marginTop: 'var(--space-md)' }}>
          {showAddMember ? (
            <form onSubmit={handleCreateMember}>
              <div className="settings-section" style={{ padding: 'var(--space-md)', display: 'grid', gap: 'var(--space-md)' }}>
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

function getAge(dateOfBirth) {
  if (!dateOfBirth) return null;
  // Parse as YYYY-MM-DD to avoid timezone offset issues
  const [y, m, d] = dateOfBirth.split('-').map(Number);
  const dob = new Date(y, m - 1, d);
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  if (now.getMonth() < dob.getMonth() || (now.getMonth() === dob.getMonth() && now.getDate() < dob.getDate())) age--;
  return age;
}

function MemberGroups({ members, me, messages, onSetAdult, onSetRole, onResetPassword, onRemoveMember, onSetBirthdate }) {
  const { adults, children } = useMemo(() => {
    const roleRank = (r) => r === 'owner' ? 0 : r === 'admin' ? 1 : 2;
    const sorted = [...members].sort((a, b) => {
      const rankDiff = roleRank(a.role) - roleRank(b.role);
      if (rankDiff !== 0) return rankDiff;
      return (a.display_name || '').localeCompare(b.display_name || '');
    });
    return {
      adults: sorted.filter(m => m.is_adult),
      children: sorted.filter(m => !m.is_adult),
    };
  }, [members]);

  const renderMember = (m) => (
    <div key={m.user_id} className="settings-section">
      <div className="profile-row">
        <div className="sidebar-user-avatar">{m.display_name?.[0] || '?'}</div>
        <div className="profile-info">
          <div className="profile-name" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {m.display_name}
            {(m.role === 'admin' || m.role === 'owner') && (
              <Shield size={13} style={{ color: 'var(--amethyst)' }} aria-label={m.role} />
            )}
          </div>
          <div className="profile-email">
            {m.email}
            {m.date_of_birth && <span style={{ marginLeft: 8, fontSize: '0.75rem', color: 'var(--text-muted)' }}>({getAge(m.date_of_birth)} {t(messages, 'years_old')})</span>}
          </div>
        </div>
      </div>
      <div className="admin-actions">
        {m.user_id === me?.user_id ? (
          <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>{t(messages, 'admin_self_hint')}</span>
        ) : (
          <>
            <button className="btn-ghost" onClick={() => onSetAdult(m.user_id, !m.is_adult)}>{m.is_adult ? t(messages, 'set_child') : t(messages, 'set_adult')}</button>
            {m.role === 'member' && <button className="btn-ghost" onClick={() => onSetRole(m.user_id, 'admin')}>{t(messages, 'make_admin')}</button>}
            {m.role === 'admin' && <button className="btn-ghost" onClick={() => onSetRole(m.user_id, 'member')}>{t(messages, 'make_member')}</button>}
            <input type="date" className="form-input" style={{ width: 'auto', padding: '4px 8px', fontSize: '0.78rem' }}
              value={m.date_of_birth || ''}
              onChange={(e) => onSetBirthdate(m.user_id, e.target.value || null)}
              aria-label={t(messages, 'birthdate')} />
            <button className="btn-ghost" onClick={() => onResetPassword(m.user_id)}><KeyRound size={13} /> {t(messages, 'reset_password')}</button>
            <button className="btn-ghost btn-outline-danger" onClick={() => onRemoveMember(m.user_id)}><X size={13} /> {t(messages, 'remove_member')}</button>
          </>
        )}
      </div>
    </div>
  );

  return (
    <>
      {adults.length > 0 && (
        <>
          <div className="member-group-header">{t(messages, 'member_group_adults')} ({adults.length})</div>
          <div className="settings-grid">{adults.map(renderMember)}</div>
        </>
      )}
      {children.length > 0 && (
        <>
          <div className="member-group-header">{t(messages, 'member_group_children')} ({children.length})</div>
          <div className="settings-grid">{children.map(renderMember)}</div>
        </>
      )}
    </>
  );
}
