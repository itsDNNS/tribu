import { useState, useEffect, useCallback } from 'react';
import { Check, Copy, X, Monitor, Trash2 } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { useToast } from '../../contexts/ToastContext';
import { copyTextToClipboard, errorText } from '../../lib/helpers';
import { t } from '../../lib/i18n';
import * as api from '../../lib/api';
import ConfirmDialog from '../ConfirmDialog';

/**
 * Admin tab for managing shared-home display devices (issue #172).
 *
 * A display device is intentionally NOT a person: it does not log in,
 * does not have an email/password, and does not appear in member
 * lists. The bearer token (`tribu_display_...`) is shown exactly
 * once at creation time so the admin can pair the wall tablet by
 * either copying the URL or scanning a QR. Revocation is soft: the
 * row stays for audit so an admin can see who created the token,
 * when it was last used, and who took it out of service.
 */
export default function DisplaysSection() {
  const { familyId, messages, demoMode } = useApp();
  const { error: toastError } = useToast();
  const [devices, setDevices] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newMode, setNewMode] = useState('tablet');
  const [newPreset, setNewPreset] = useState('hearth');
  const [newRefresh, setNewRefresh] = useState(60);
  const [deviceDrafts, setDeviceDrafts] = useState({});
  const [created, setCreated] = useState(null); // { token, device, displayUrl }
  const [copied, setCopied] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);

  const load = useCallback(async () => {
    if (demoMode) return;
    const { ok, data } = await api.apiListDisplayDevices(familyId);
    if (ok) {
      setDevices(data);
      setDeviceDrafts(Object.fromEntries((data || []).map((device) => [device.id, deviceToDraft(device)])));
    }
  }, [familyId, demoMode]);

  useEffect(() => { load(); }, [load]);

  function buildDisplayUrl(token) {
    if (typeof window === 'undefined') return `/display?token=${encodeURIComponent(token)}`;
    return `${window.location.origin}/display?token=${encodeURIComponent(token)}`;
  }

  async function handleCreate(e) {
    e.preventDefault();
    if (!newName.trim()) return;
    const { ok, data } = await api.apiCreateDisplayDevice(familyId, {
      name: newName.trim(),
      display_mode: newMode,
      layout_preset: newPreset,
      refresh_interval_seconds: Number(newRefresh),
    });
    if (!ok) {
      toastError(errorText(data?.detail, t(messages, 'toast.error'), messages));
      return;
    }
    setCreated({
      token: data.token,
      device: data.device,
      displayUrl: buildDisplayUrl(data.token),
    });
    setShowCreate(false);
    resetCreateForm();
    setCopied(false);
    await load();
  }

  function resetCreateForm() {
    setNewName('');
    setNewMode('tablet');
    setNewPreset('hearth');
    setNewRefresh(60);
  }

  function updateDraft(deviceId, patch) {
    setDeviceDrafts((current) => ({
      ...current,
      [deviceId]: { ...(current[deviceId] || {}), ...patch },
    }));
  }

  async function handleSaveDevice(device) {
    const draft = deviceDrafts[device.id] || deviceToDraft(device);
    const { ok, data } = await api.apiUpdateDisplayDevice(familyId, device.id, {
      display_mode: draft.display_mode,
      layout_preset: draft.layout_preset,
      refresh_interval_seconds: Number(draft.refresh_interval_seconds),
    });
    if (!ok) {
      toastError(errorText(data?.detail, t(messages, 'toast.error'), messages));
      return;
    }
    await load();
  }

  function handleRevoke(device) {
    setConfirmAction({
      title: t(messages, 'display_revoke'),
      message: t(messages, 'display_revoke_confirm').replace('{name}', device.name),
      danger: true,
      action: async () => {
        const { ok, data } = await api.apiRevokeDisplayDevice(familyId, device.id);
        if (!ok) {
          toastError(errorText(data?.detail, t(messages, 'toast.error'), messages));
        } else {
          await load();
        }
        setConfirmAction(null);
      },
    });
  }

  async function handleCopyUrl() {
    if (!created?.displayUrl) return;
    if (!await copyTextToClipboard(created.displayUrl)) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function deviceStatusLabel(device) {
    if (device.revoked_at) return { label: t(messages, 'display_status_revoked'), color: 'var(--text-muted)' };
    return { label: t(messages, 'display_status_active'), color: 'var(--success)' };
  }

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
          <h1 className="view-title">{t(messages, 'display_title')}</h1>
        </div>
      </div>
      <p className="invite-intro">{t(messages, 'display_intro')}</p>
      <p className="invite-intro" data-testid="display-not-a-person-hint">
        <strong>{t(messages, 'display_not_a_person')}</strong>
      </p>

      {created && (
        <div className="adm-success-banner" data-testid="display-created-banner">
          <div className="adm-banner-header">
            <Check size={16} className="adm-icon-success" />
            <span className="adm-banner-title">
              {t(messages, 'display_link_created').replace('{name}', created.device.name)}
            </span>
          </div>
          <p className="adm-banner-warning">{t(messages, 'display_link_hint')}</p>
          <p className="adm-banner-warning">{t(messages, 'display_link_share_hint')}</p>
          <div className="adm-banner-row">
            <code className="token-display" data-testid="display-created-url">{created.displayUrl}</code>
            <button
              className="btn-ghost adm-banner-no-shrink"
              onClick={handleCopyUrl}
              data-testid="display-copy-url"
            >
              {copied
                ? <><Check size={14} /> {t(messages, 'token_copied')}</>
                : <><Copy size={14} /> {t(messages, 'token_copy')}</>}
            </button>
          </div>
          <button
            className="adm-banner-dismiss"
            onClick={() => { setCreated(null); setCopied(false); }}
          >
            <X size={12} className="adm-icon-middle" /> {t(messages, 'dismiss')}
          </button>
        </div>
      )}

      <div className="settings-section adm-section-gap">
        {devices.length === 0 && (
          <p className="adm-empty">{t(messages, 'display_no_devices')}</p>
        )}
        {devices.map((device) => {
          const status = deviceStatusLabel(device);
          return (
            <div key={device.id} className="adm-list-item" data-testid={`display-row-${device.id}`}>
              <div>
                <div className="adm-list-item-header">
                  <Monitor size={14} className="adm-list-item-icon" />
                  <span className="adm-list-item-role">{device.name}</span>
                  <span className="adm-list-item-status" style={{ color: status.color }}>
                    {status.label}
                  </span>
                </div>
                <div className="adm-list-item-meta">
                  {device.last_used_at
                    ? t(messages, 'display_last_used').replace('{when}', new Date(device.last_used_at).toLocaleString())
                    : t(messages, 'display_never_used')}
                  {' · '}{t(messages, 'display_created').replace('{when}', new Date(device.created_at).toLocaleDateString())}
                  {' · '}{displayModeLabel(device.display_mode, messages)} · {layoutPresetLabel(device.layout_preset, messages)} · {device.refresh_interval_seconds || 60}s
                </div>
                {!device.revoked_at && (
                  <DisplayConfigControls
                    draft={deviceDrafts[device.id] || deviceToDraft(device)}
                    messages={messages}
                    onChange={(patch) => updateDraft(device.id, patch)}
                    onSave={() => handleSaveDevice(device)}
                  />
                )}
              </div>
              {!device.revoked_at && (
                <button
                  className="btn-ghost adm-revoke-btn"
                  onClick={() => handleRevoke(device)}
                  data-testid={`display-revoke-${device.id}`}
                >
                  <Trash2 size={14} /> {t(messages, 'display_revoke')}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {!demoMode && (
        <div className="adm-section-gap">
          {showCreate ? (
            <form onSubmit={handleCreate}>
              <div className="settings-section adm-form-grid">
                <div className="form-field">
                  <label>{t(messages, 'display_name_label')}</label>
                  <input
                    className="form-input"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder={t(messages, 'display_name_placeholder')}
                    maxLength={120}
                    required
                    autoFocus
                    data-testid="display-create-name"
                  />
                  <small className="invite-helper-text">{t(messages, 'display_name_helper')}</small>
                </div>
                <DisplayConfigControls
                  draft={{ display_mode: newMode, layout_preset: newPreset, refresh_interval_seconds: newRefresh }}
                  messages={messages}
                  onChange={(patch) => {
                    if (patch.display_mode) {
                      setNewMode(patch.display_mode);
                      if (patch.display_mode === 'eink' && newPreset === 'hearth') setNewPreset('eink_compact');
                    }
                    if (patch.layout_preset) setNewPreset(patch.layout_preset);
                    if (patch.refresh_interval_seconds) setNewRefresh(Number(patch.refresh_interval_seconds));
                  }}
                />
                <div className="set-btn-row">
                  <button type="submit" className="btn-sm" data-testid="display-create-submit">
                    <Monitor size={14} /> {t(messages, 'display_create')}
                  </button>
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => { setShowCreate(false); resetCreateForm(); }}
                  >
                    {t(messages, 'cancel')}
                  </button>
                </div>
              </div>
            </form>
          ) : (
            <button
              className="btn-ghost"
              onClick={() => setShowCreate(true)}
              data-testid="display-create-toggle"
            >
              <Monitor size={14} /> {t(messages, 'display_create')}
            </button>
          )}
        </div>
      )}
    </>
  );
}

const DISPLAY_MODES = ['tablet', 'eink'];
const LAYOUT_PRESETS = ['hearth', 'agenda_first', 'family_board', 'eink_compact', 'eink_agenda'];

function deviceToDraft(device) {
  return {
    display_mode: device.display_mode || 'tablet',
    layout_preset: device.layout_preset || 'hearth',
    refresh_interval_seconds: device.refresh_interval_seconds || (device.display_mode === 'eink' ? 900 : 60),
  };
}

function displayModeLabel(mode, messages) {
  return mode === 'eink' ? t(messages, 'display_mode_eink') : t(messages, 'display_mode_tablet');
}

function layoutPresetLabel(preset, messages) {
  return t(messages, `display_layout_${preset || 'hearth'}`);
}

function DisplayConfigControls({ draft, messages, onChange, onSave = null }) {
  return (
    <div className="adm-form-grid" data-testid="display-config-controls">
      <div className="form-field">
        <label>{t(messages, 'display_mode_label')}</label>
        <select
          className="form-input"
          value={draft.display_mode}
          onChange={(e) => onChange({ display_mode: e.target.value })}
          data-testid="display-mode-select"
        >
          {DISPLAY_MODES.map((mode) => (
            <option key={mode} value={mode}>{displayModeLabel(mode, messages)}</option>
          ))}
        </select>
      </div>
      <div className="form-field">
        <label>{t(messages, 'display_layout_label')}</label>
        <select
          className="form-input"
          value={draft.layout_preset}
          onChange={(e) => onChange({ layout_preset: e.target.value })}
          data-testid="display-layout-select"
        >
          {LAYOUT_PRESETS.map((preset) => (
            <option key={preset} value={preset}>{layoutPresetLabel(preset, messages)}</option>
          ))}
        </select>
      </div>
      <div className="form-field">
        <label>{t(messages, 'display_refresh_label')}</label>
        <input
          className="form-input"
          type="number"
          min={draft.display_mode === 'eink' ? 300 : 30}
          max={draft.display_mode === 'eink' ? 86400 : 3600}
          value={draft.refresh_interval_seconds}
          onChange={(e) => onChange({ refresh_interval_seconds: e.target.value })}
          data-testid="display-refresh-input"
        />
        <small className="invite-helper-text">{t(messages, 'display_refresh_helper')}</small>
      </div>
      {onSave && (
        <div className="set-btn-row">
          <button type="button" className="btn-sm" onClick={onSave} data-testid="display-save-config">
            {t(messages, 'save')}
          </button>
        </div>
      )}
    </div>
  );
}
