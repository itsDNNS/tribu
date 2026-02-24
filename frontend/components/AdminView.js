import { useState, useEffect, useCallback } from 'react';
import { useApp } from '../contexts/AppContext';
import { errorText } from '../lib/helpers';
import { t } from '../lib/i18n';
import * as api from '../lib/api';

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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

export default function AdminView() {
  const { familyId, members, messages, loadMembers, me } = useApp();
  const [adminMsg, setAdminMsg] = useState('');

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

  return (
    <div className="view-enter">
      <div className="view-header">
        <div>
          <h1 className="view-title">{t(messages, 'admin_members')}</h1>
        </div>
      </div>
      {adminMsg && <p className="admin-error">{adminMsg}</p>}
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
                </>
              )}
            </div>
          </div>
        ))}
      </div>
      <BackupSection />
    </div>
  );
}
