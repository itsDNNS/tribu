import { useState, useEffect, useCallback } from 'react';
import { Plus, Check, Copy, X, KeyRound, Link, Trash2 } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { errorText } from '../lib/helpers';
import { t } from '../lib/i18n';
import * as api from '../lib/api';

const ACTION_KEYS = {
  member_created: 'audit_action_member_created',
  member_removed: 'audit_action_member_removed',
  password_reset: 'audit_action_password_reset',
  role_changed: 'audit_action_role_changed',
  adult_changed: 'audit_action_adult_changed',
  invite_created: 'audit_action_invite_created',
  invite_revoked: 'audit_action_invite_revoked',
  invite_used: 'audit_action_invite_used',
};

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function InviteSection() {
  const { familyId, messages, demoMode } = useApp();
  const [invites, setInvites] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [rolePreset, setRolePreset] = useState('member');
  const [isAdultPreset, setIsAdultPreset] = useState(false);
  const [expiryDays, setExpiryDays] = useState(7);
  const [maxUses, setMaxUses] = useState('');
  const [createdUrl, setCreatedUrl] = useState(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  // Base URL settings
  const [baseUrl, setBaseUrl] = useState('');
  const [baseUrlEnv, setBaseUrlEnv] = useState('');
  const [baseUrlEffective, setBaseUrlEffective] = useState('');
  const [baseUrlSaved, setBaseUrlSaved] = useState(false);

  const loadInvites = useCallback(async () => {
    if (demoMode) return;
    const { ok, data } = await api.apiGetInvitations(familyId);
    if (ok) setInvites(data);
  }, [familyId, demoMode]);

  const loadBaseUrl = useCallback(async () => {
    if (demoMode) return;
    const { ok, data } = await api.apiGetBaseUrl();
    if (ok) {
      setBaseUrl(data.saved || '');
      setBaseUrlEnv(data.env || '');
      setBaseUrlEffective(data.effective || '');
    }
  }, [demoMode]);

  useEffect(() => {
    loadInvites();
    loadBaseUrl();
  }, [loadInvites, loadBaseUrl]);

  async function handleCreate(e) {
    e.preventDefault();
    setError('');
    const payload = {
      role_preset: rolePreset,
      is_adult_preset: isAdultPreset,
      expires_in_days: expiryDays,
    };
    if (maxUses) payload.max_uses = parseInt(maxUses);
    const { ok, data } = await api.apiCreateInvitation(familyId, payload);
    if (!ok) {
      setError(errorText(data?.detail, 'Failed'));
      return;
    }
    setCreatedUrl(data.invite_url);
    setShowCreate(false);
    setRolePreset('member');
    setIsAdultPreset(false);
    setExpiryDays(7);
    setMaxUses('');
    await loadInvites();
  }

  async function handleRevoke(inviteId) {
    if (!confirm(t(messages, 'invite_revoke_confirm'))) return;
    const { ok, data } = await api.apiRevokeInvitation(familyId, inviteId);
    if (!ok) {
      setError(errorText(data?.detail, 'Failed'));
      return;
    }
    await loadInvites();
  }

  async function handleSaveBaseUrl() {
    const { ok } = await api.apiSetBaseUrl(baseUrl);
    if (ok) {
      setBaseUrlSaved(true);
      setTimeout(() => setBaseUrlSaved(false), 2000);
      await loadBaseUrl();
    }
  }

  function handleCopyUrl() {
    if (!createdUrl) return;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(createdUrl).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    } else {
      const ta = document.createElement('textarea');
      ta.value = createdUrl;
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

  function inviteStatus(inv) {
    if (inv.revoked) return { label: t(messages, 'invite_status_revoked'), color: 'var(--text-muted)' };
    if (new Date(inv.expires_at) < new Date()) return { label: t(messages, 'invite_status_expired'), color: 'var(--text-muted)' };
    if (inv.max_uses && inv.use_count >= inv.max_uses) return { label: t(messages, 'invite_status_used_up'), color: 'var(--text-muted)' };
    return { label: t(messages, 'invite_status_active'), color: 'var(--success)' };
  }

  return (
    <>
      <div className="view-header" style={{ marginTop: '2rem' }}>
        <div>
          <h1 className="view-title">{t(messages, 'invite_title')}</h1>
        </div>
      </div>
      {error && <p className="admin-error">{error}</p>}

      {/* Base URL setting */}
      {!demoMode && (
        <div className="glass-sm settings-section" style={{ marginBottom: '1rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <span style={{ fontWeight: 500 }}>{t(messages, 'base_url_title')}</span>
            <small style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{t(messages, 'base_url_hint')}</small>
            <input
              className="form-input"
              type="url"
              placeholder="https://tribu.example.com"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
            />
            {baseUrlEnv && (
              <small style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                {t(messages, 'base_url_env')}: {baseUrlEnv}
              </small>
            )}
            <small style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>
              {t(messages, 'base_url_effective')}: {baseUrlEffective}
            </small>
            <button className="btn-primary" onClick={handleSaveBaseUrl} style={{ alignSelf: 'flex-start' }}>
              {baseUrlSaved ? t(messages, 'base_url_saved') : t(messages, 'base_url_save')}
            </button>
          </div>
        </div>
      )}

      {/* Created URL banner */}
      {createdUrl && (
        <div style={{
          background: 'rgba(16, 185, 129, 0.1)',
          border: '1px solid rgba(16, 185, 129, 0.3)',
          borderRadius: 'var(--radius-sm)',
          padding: 'var(--space-md)',
          marginBottom: 'var(--space-md)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: 'var(--space-sm)' }}>
            <Check size={16} style={{ color: 'var(--success)' }} />
            <span style={{ fontWeight: 600, fontSize: '0.88rem' }}>{t(messages, 'invite_link_created')}</span>
          </div>
          <p style={{ color: 'var(--warning)', fontSize: '0.82rem', marginBottom: 'var(--space-sm)' }}>
            {t(messages, 'invite_link_hint')}
          </p>
          <div style={{ display: 'flex', gap: 'var(--space-sm)', alignItems: 'center' }}>
            <code className="token-display" style={{ wordBreak: 'break-all' }}>{createdUrl}</code>
            <button className="btn-ghost" onClick={handleCopyUrl} style={{ flexShrink: 0 }}>
              {copied ? <><Check size={14} /> {t(messages, 'invite_copied')}</> : <><Copy size={14} /> {t(messages, 'invite_copy')}</>}
            </button>
          </div>
          <button
            onClick={() => { setCreatedUrl(null); setCopied(false); }}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', marginTop: 'var(--space-sm)', fontSize: '0.78rem' }}
          >
            <X size={12} style={{ verticalAlign: 'middle' }} /> Dismiss
          </button>
        </div>
      )}

      {/* Invite list */}
      <div className="glass-sm settings-section" style={{ marginBottom: '1rem' }}>
        {invites.length === 0 && <p style={{ opacity: 0.6 }}>{t(messages, 'invite_no_invites')}</p>}
        {invites.map((inv) => {
          const status = inviteStatus(inv);
          return (
            <div key={inv.id} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '0.5rem 0', borderTop: '1px solid var(--glass-border, rgba(255,255,255,0.08))',
            }}>
              <div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <Link size={14} style={{ opacity: 0.5 }} />
                  <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>{inv.role_preset}</span>
                  <span style={{ fontSize: '0.78rem', color: status.color, fontWeight: 600 }}>{status.label}</span>
                </div>
                <div style={{ fontSize: '0.78rem', opacity: 0.6, marginTop: 2 }}>
                  {inv.max_uses
                    ? t(messages, 'invite_uses').replace('{count}', inv.use_count).replace('{max}', inv.max_uses)
                    : t(messages, 'invite_uses_unlimited').replace('{count}', inv.use_count)
                  }
                  {' · '}{new Date(inv.expires_at).toLocaleDateString()}
                </div>
              </div>
              {!inv.revoked && new Date(inv.expires_at) > new Date() && (
                <button className="btn-ghost" onClick={() => handleRevoke(inv.id)} style={{ color: 'var(--danger)' }}>
                  <Trash2 size={14} /> {t(messages, 'invite_revoke')}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Create invite form */}
      {!demoMode && (
        <div style={{ marginBottom: '1rem' }}>
          {showCreate ? (
            <form onSubmit={handleCreate}>
              <div className="glass-sm settings-section" style={{ padding: 'var(--space-md)', display: 'grid', gap: 'var(--space-md)' }}>
                <div className="form-field">
                  <label>{t(messages, 'invite_role')}</label>
                  <select className="form-input" value={rolePreset} onChange={(e) => setRolePreset(e.target.value)}>
                    <option value="member">{t(messages, 'member')}</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.88rem', cursor: 'pointer' }}>
                  <input type="checkbox" checked={isAdultPreset} onChange={(e) => setIsAdultPreset(e.target.checked)} />
                  {t(messages, 'invite_is_adult')}
                </label>
                <div className="form-field">
                  <label>{t(messages, 'invite_expiry_days')}</label>
                  <input className="form-input" type="number" min={1} max={90} value={expiryDays} onChange={(e) => setExpiryDays(parseInt(e.target.value) || 7)} style={{ width: '5rem' }} />
                </div>
                <div className="form-field">
                  <label>{t(messages, 'invite_max_uses')}</label>
                  <input className="form-input" type="number" min={1} max={1000} value={maxUses} onChange={(e) => setMaxUses(e.target.value)} style={{ width: '5rem' }} placeholder="-" />
                </div>
                <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
                  <button type="submit" className="btn-sm">
                    <Link size={14} /> {t(messages, 'invite_create')}
                  </button>
                  <button type="button" className="btn-ghost" onClick={() => setShowCreate(false)}>
                    {t(messages, 'cancel')}
                  </button>
                </div>
              </div>
            </form>
          ) : (
            <button className="btn-ghost" onClick={() => setShowCreate(true)}>
              <Link size={14} /> {t(messages, 'invite_create')}
            </button>
          )}
        </div>
      )}
    </>
  );
}

function BackupSection() {
  const { messages } = useApp();
  const [config, setConfig] = useState(null);
  const [backups, setBackups] = useState([]);
  const [schedule, setSchedule] = useState('off');
  const [retention, setRetention] = useState(7);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const loadConfig = useCallback(async () => {
    const { ok, data } = await api.apiGetBackupConfig();
    if (ok) {
      setConfig(data);
      setSchedule(data.schedule);
      setRetention(data.retention);
    }
  }, []);

  const loadBackups = useCallback(async () => {
    const { ok, data } = await api.apiGetBackups();
    if (ok) setBackups(data);
  }, []);

  useEffect(() => {
    loadConfig();
    loadBackups();
  }, [loadConfig, loadBackups]);

  async function handleSaveConfig() {
    setSaving(true);
    setError('');
    const { ok, data } = await api.apiUpdateBackupConfig({ schedule, retention });
    if (ok) {
      setConfig(data);
    } else {
      setError(errorText(data?.detail, 'Failed'));
    }
    setSaving(false);
  }

  async function handleTrigger() {
    setCreating(true);
    setError('');
    const { ok, data } = await api.apiTriggerBackup();
    if (!ok) {
      setError(errorText(data?.detail, 'Backup failed'));
    }
    await loadConfig();
    await loadBackups();
    setCreating(false);
  }

  async function handleDownload(filename) {
    const res = await api.apiDownloadBackup(filename);
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleDelete(filename) {
    if (!confirm(t(messages, 'backup_delete_confirm'))) return;
    const { ok, data } = await api.apiDeleteBackup(filename);
    if (!ok) {
      setError(errorText(data?.detail, 'Failed'));
    }
    await loadBackups();
  }

  const scheduleOptions = [
    { value: 'off', label: t(messages, 'backup_schedule_off') },
    { value: 'daily', label: t(messages, 'backup_schedule_daily') },
    { value: 'weekly', label: t(messages, 'backup_schedule_weekly') },
    { value: 'monthly', label: t(messages, 'backup_schedule_monthly') },
  ];

  return (
    <>
      <div className="view-header" style={{ marginTop: '2rem' }}>
        <div>
          <h1 className="view-title">{t(messages, 'backup_title')}</h1>
        </div>
      </div>
      {error && <p className="admin-error">{error}</p>}

      <div className="glass-sm settings-section" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <label>
            <span style={{ fontWeight: 500 }}>{t(messages, 'backup_schedule')}</span>
            <select
              className="form-input"
              value={schedule}
              onChange={(e) => setSchedule(e.target.value)}
              style={{ display: 'block', marginTop: '0.25rem' }}
            >
              {scheduleOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
          <label>
            <span style={{ fontWeight: 500 }}>{t(messages, 'backup_retention')}</span>
            <input
              className="form-input"
              type="number"
              min={1}
              max={100}
              value={retention}
              onChange={(e) => setRetention(parseInt(e.target.value) || 1)}
              style={{ display: 'block', width: '5rem', marginTop: '0.25rem' }}
            />
            <span style={{ fontSize: '0.8rem', opacity: 0.7 }}>{t(messages, 'backup_retention_hint')}</span>
          </label>
          <div>
            <button className="btn-primary" onClick={handleSaveConfig} disabled={saving}>
              {t(messages, 'backup_save')}
            </button>
          </div>
          {config?.last_backup && (
            <div style={{ fontSize: '0.85rem', opacity: 0.8 }}>
              {t(messages, 'backup_last')}: {new Date(config.last_backup).toLocaleString()}
              {config.last_backup_status && ` (${config.last_backup_status})`}
            </div>
          )}
          <div style={{ fontSize: '0.8rem', opacity: 0.6 }}>
            {t(messages, 'backup_volume_hint')}
          </div>
        </div>
      </div>

      <div className="glass-sm settings-section">
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.75rem' }}>
          <span style={{ fontWeight: 500 }}>{t(messages, 'backup_list')}</span>
          <button className="btn-primary" onClick={handleTrigger} disabled={creating}>
            {creating ? t(messages, 'backup_creating') : t(messages, 'backup_now')}
          </button>
        </div>
        {backups.length === 0 && <p style={{ opacity: 0.6 }}>{t(messages, 'backup_no_backups')}</p>}
        {backups.map((b) => (
          <div key={b.filename} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '0.5rem 0', borderTop: '1px solid var(--glass-border, rgba(255,255,255,0.08))',
          }}>
            <div>
              <div style={{ fontWeight: 500, fontSize: '0.9rem' }}>{b.filename}</div>
              <div style={{ fontSize: '0.8rem', opacity: 0.6 }}>
                {new Date(b.created_at).toLocaleString()} &middot; {formatBytes(b.size_bytes)}
                {b.alembic_revision && ` · rev ${b.alembic_revision}`}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="btn-ghost" onClick={() => handleDownload(b.filename)}>
                {t(messages, 'backup_download')}
              </button>
              <button className="btn-ghost" onClick={() => handleDelete(b.filename)}>
                {t(messages, 'backup_delete')}
              </button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function AuditLogSection() {
  const { familyId, messages } = useApp();
  const [entries, setEntries] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (offset = 0) => {
    setLoading(true);
    const { ok, data } = await api.apiGetAuditLog(familyId, 50, offset);
    if (ok) {
      setEntries((prev) => offset === 0 ? data.items : [...prev, ...data.items]);
      setTotal(data.total);
    }
    setLoading(false);
  }, [familyId]);

  useEffect(() => { load(0); }, [load]);

  function formatAction(entry) {
    const key = ACTION_KEYS[entry.action] || entry.action;
    return t(messages, key);
  }

  function formatDetails(entry) {
    if (!entry.details) return null;
    if (entry.action === 'role_changed') return `${entry.details.old} → ${entry.details.new}`;
    if (entry.action === 'adult_changed') return entry.details.is_adult ? '→ adult' : '→ child';
    if (entry.action === 'member_created' && entry.details.email) return entry.details.email;
    if (entry.action === 'invite_created' && entry.details.role_preset) return `${entry.details.role_preset} (${entry.details.expires_in_days}d)`;
    if (entry.action === 'invite_used' && entry.details.email) return entry.details.email;
    return null;
  }

  return (
    <>
      <div className="view-header" style={{ marginTop: '2rem' }}>
        <div>
          <h1 className="view-title">{t(messages, 'audit_log_title')}</h1>
        </div>
      </div>

      <div className="glass-sm settings-section">
        {entries.length === 0 && !loading && (
          <p style={{ opacity: 0.6 }}>{t(messages, 'audit_log_empty')}</p>
        )}
        {entries.map((e) => (
          <div key={e.id} className="audit-entry">
            <span className="audit-time">
              {new Date(e.created_at).toLocaleString()}
            </span>
            <span className="audit-action-badge">{formatAction(e)}</span>
            {e.target_display_name && (
              <span className="audit-target">→ {e.target_display_name}</span>
            )}
            {formatDetails(e) && (
              <span className="audit-details">{formatDetails(e)}</span>
            )}
            {e.admin_display_name && (
              <span className="audit-admin">{t(messages, 'audit_by')} {e.admin_display_name}</span>
            )}
          </div>
        ))}
        {entries.length < total && (
          <button
            className="btn-ghost"
            onClick={() => load(entries.length)}
            disabled={loading}
            style={{ marginTop: 'var(--space-sm)' }}
          >
            {t(messages, 'audit_log_load_more')}
          </button>
        )}
      </div>
    </>
  );
}

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
