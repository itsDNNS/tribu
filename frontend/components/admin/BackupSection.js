import { useState, useEffect, useCallback } from 'react';
import { useApp } from '../../contexts/AppContext';
import { useToast } from '../../contexts/ToastContext';
import { downloadBlob, errorText } from '../../lib/helpers';
import { t } from '../../lib/i18n';
import * as api from '../../lib/api';
import ConfirmDialog from '../ConfirmDialog';

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function backupStatusLabel(messages, namespace, value) {
  if (!value) return '';
  const label = t(messages, `backup_${namespace}_${value}`, value);
  if (label !== value) return label;
  return t(messages, `backup_${namespace}_unknown`, t(messages, 'backup_database_unknown'));
}

function backupDocsHref(runbook) {
  if (runbook === 'self_hosting_backup_restore') {
    return 'https://github.com/itsDNNS/tribu/blob/main/docs/self-hosting.md#backup--restore';
  }
  return 'https://github.com/itsDNNS/tribu/blob/main/docs/self-hosting.md';
}

export default function BackupSection() {
  const { messages } = useApp();
  const { error: toastError } = useToast();
  const [config, setConfig] = useState(null);
  const [status, setStatus] = useState(null);
  const [statusError, setStatusError] = useState(false);
  const [backups, setBackups] = useState([]);
  const [schedule, setSchedule] = useState('off');
  const [retention, setRetention] = useState(7);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);

  const loadConfig = useCallback(async () => {
    const { ok, data } = await api.apiGetBackupConfig();
    if (ok) {
      setConfig(data);
      setSchedule(data.schedule);
      setRetention(data.retention);
    }
  }, []);

  const loadStatus = useCallback(async ({ fallbackBackups = null } = {}) => {
    try {
      const { ok, data } = await api.apiGetBackupStatus();
      if (ok) {
        setStatus(data);
        setStatusError(false);
        return true;
      } else {
        setStatus((current) => (Array.isArray(fallbackBackups) && current
          ? { ...current, has_backups: fallbackBackups.length > 0, latest_backup: fallbackBackups[0] || null }
          : null));
        setStatusError(true);
        return false;
      }
    } catch {
      setStatus((current) => (Array.isArray(fallbackBackups) && current
        ? { ...current, has_backups: fallbackBackups.length > 0, latest_backup: fallbackBackups[0] || null }
        : null));
      setStatusError(true);
      return false;
    }
  }, []);

  const loadBackups = useCallback(async () => {
    const { ok, data } = await api.apiGetBackups();
    if (ok) {
      setBackups(data);
      return data;
    }
    return null;
  }, []);

  useEffect(() => {
    loadConfig();
    loadStatus();
    loadBackups();
  }, [loadConfig, loadStatus, loadBackups]);

  async function handleSaveConfig() {
    setSaving(true);
    const { ok, data } = await api.apiUpdateBackupConfig({ schedule, retention });
    if (ok) {
      setConfig(data);
    } else {
      toastError(errorText(data?.detail, t(messages, 'toast.error'), messages));
    }
    setSaving(false);
  }

  async function handleTrigger() {
    setCreating(true);
    const { ok, data } = await api.apiTriggerBackup();
    if (!ok) {
      toastError(errorText(data?.detail, t(messages, 'toast.error'), messages));
    }
    await loadConfig();
    const nextBackups = (await loadBackups()) || backups;
    await loadStatus({ fallbackBackups: nextBackups });
    setCreating(false);
  }

  async function handleDownload(filename) {
    const res = await api.apiDownloadBackup(filename);
    if (!res.ok) return;
    const blob = await res.blob();
    downloadBlob(blob, filename);
  }

  async function handleDelete(filename) {
    setConfirmAction({
      title: t(messages, 'backup_delete'),
      message: t(messages, 'backup_delete_confirm'),
      danger: true,
      action: async () => {
        const { ok, data } = await api.apiDeleteBackup(filename);
        if (!ok) {
          toastError(errorText(data?.detail, t(messages, 'toast.error'), messages));
        } else {
          await loadConfig();
          const nextBackups = (await loadBackups()) || backups;
          await loadStatus({ fallbackBackups: nextBackups });
        }
        setConfirmAction(null);
      },
    });
  }

  const scheduleOptions = [
    { value: 'off', label: t(messages, 'backup_schedule_off') },
    { value: 'daily', label: t(messages, 'backup_schedule_daily') },
    { value: 'weekly', label: t(messages, 'backup_schedule_weekly') },
    { value: 'monthly', label: t(messages, 'backup_schedule_monthly') },
  ];

  return (
    <>
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
      <div className="view-header adm-section-header">
        <div>
          <h1 className="view-title">{t(messages, 'backup_title')}</h1>
        </div>
      </div>

      <div className="settings-section backup-confidence-panel">
        <div className="backup-confidence-header">
          <div>
            <div className="adm-field-title">{t(messages, 'backup_confidence_title')}</div>
            {status?.has_backups === false && (
              <p className="backup-confidence-warning" role="status">{t(messages, 'backup_confidence_empty')}</p>
            )}
            {statusError && (
              <p className="backup-confidence-warning" role="alert">{t(messages, 'backup_status_unavailable')}</p>
            )}
          </div>
          {status?.restore_runbook && (
            <a className="btn-ghost backup-docs-link" href={backupDocsHref(status.restore_runbook)}>
              {t(messages, 'backup_docs_link')}
            </a>
          )}
        </div>
        {status && (
          <div className="backup-confidence-grid">
            <div className="backup-confidence-card">
              <span>{t(messages, 'backup_database_backend')}</span>
              <strong>{backupStatusLabel(messages, 'database', status.database_backend)}</strong>
              <small>{backupStatusLabel(messages, 'storage', status.backup_dir)}</small>
            </div>
            <div className="backup-confidence-card">
              <span>{t(messages, 'backup_latest_export')}</span>
              {status.latest_backup ? (
                <>
                  <strong>{status.latest_backup.filename}</strong>
                  <small>{new Date(status.latest_backup.created_at).toLocaleString()} · {formatBytes(status.latest_backup.size_bytes)}</small>
                </>
              ) : (
                <strong>{t(messages, 'backup_last_none')}</strong>
              )}
            </div>
            <div className="backup-confidence-card backup-confidence-list-card">
              <span>{t(messages, 'backup_included_domains')}</span>
              <div className="backup-domain-list">
                {(status.included_domains || []).map((domain) => <em key={domain}>{backupStatusLabel(messages, 'domain', domain)}</em>)}
              </div>
            </div>
            <div className="backup-confidence-card backup-confidence-list-card">
              <span>{t(messages, 'backup_excluded_domains')}</span>
              <div className="backup-domain-list muted">
                {(status.excluded_domains || []).map((domain) => <em key={domain}>{backupStatusLabel(messages, 'excluded', domain)}</em>)}
              </div>
            </div>
            <div className="backup-confidence-card backup-restore-card">
              <span>{t(messages, 'backup_restore_guidance')}</span>
              <strong>{backupStatusLabel(messages, 'restore', status.restore_supported)}</strong>
            </div>
          </div>
        )}
      </div>

      <div className="settings-section adm-section-gap">
        <div className="adm-col-layout-lg">
          <label>
            <span className="adm-field-title">{t(messages, 'backup_schedule')}</span>
            <select
              className="form-input adm-select-block"
              value={schedule}
              onChange={(e) => setSchedule(e.target.value)}
            >
              {scheduleOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="adm-field-title">{t(messages, 'backup_retention')}</span>
            <input
              className="form-input adm-input-block"
              type="number"
              min={1}
              max={100}
              value={retention}
              onChange={(e) => setRetention(parseInt(e.target.value) || 1)}
            />
            <span className="adm-retention-hint">{t(messages, 'backup_retention_hint')}</span>
          </label>
          <div>
            <button className="btn-primary" onClick={handleSaveConfig} disabled={saving}>
              {t(messages, 'backup_save')}
            </button>
          </div>
          {config?.last_backup && (
            <div className="adm-backup-last">
              {t(messages, 'backup_last')}: {new Date(config.last_backup).toLocaleString()}
              {config.last_backup_status && ` (${config.last_backup_status})`}
            </div>
          )}
          <div className="adm-backup-volume">
            {t(messages, 'backup_volume_hint')}
          </div>
        </div>
      </div>

      <div className="settings-section">
        <div className="adm-backup-header">
          <span className="adm-field-title">{t(messages, 'backup_list')}</span>
          <button className="btn-primary" onClick={handleTrigger} disabled={creating}>
            {creating ? t(messages, 'backup_creating') : t(messages, 'backup_now')}
          </button>
        </div>
        {backups.length === 0 && <p className="adm-empty">{t(messages, 'backup_no_backups')}</p>}
        {backups.map((b) => (
          <div key={b.filename} className="adm-list-item">
            <div>
              <div className="adm-backup-filename">{b.filename}</div>
              <div className="adm-backup-meta">
                {new Date(b.created_at).toLocaleString()} &middot; {formatBytes(b.size_bytes)}
                {b.alembic_revision && ` · rev ${b.alembic_revision}`}
              </div>
            </div>
            <div className="adm-btn-row">
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
