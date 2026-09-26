import { useState, useEffect, useCallback } from 'react';
import { Check, Copy, X, Monitor, Trash2 } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { useToast } from '../../contexts/ToastContext';
import { copyTextToClipboard, errorText, parseServerInstant } from '../../lib/helpers';
import { t } from '../../lib/i18n';
import * as api from '../../lib/api';
import ConfirmDialog from '../ConfirmDialog';
import AdminDialog from './AdminDialog';
import DisplayStageEditor, { StageSchematic, draftFromDevice, draftToPayload, everyLabel } from './DisplayStageEditor';
import DisplayWeatherPanel from './DisplayWeatherPanel';

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
  const { familyId, messages, demoMode, lang } = useApp();
  const { error: toastError } = useToast();
  const [busy, setBusy] = useState(false);
  const [devices, setDevices] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDraft, setNewDraft] = useState(() => draftFromDevice(null));
  const [deviceDrafts, setDeviceDrafts] = useState({});
  const [created, setCreated] = useState(null); // { token, device, displayUrl }
  const [copied, setCopied] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);
  const [expandedDeviceId, setExpandedDeviceId] = useState(null);

  const load = useCallback(async () => {
    if (demoMode) return;
    const { ok, data } = await api.apiListDisplayDevices(familyId);
    if (ok) {
      setDevices(data);
      setDeviceDrafts(Object.fromEntries((data || []).map((device) => [device.id, draftFromDevice(device)])));
    }
  }, [familyId, demoMode]);

  useEffect(() => { load(); }, [load]);

  // Picture address for e-ink frames that cannot run a browser.
  function buildImageUrl(token) {
    const origin = typeof window === 'undefined' ? '' : window.location.origin;
    return `${origin}/display/image.png?token=${encodeURIComponent(token)}`;
  }

  function buildDisplayUrl(token) {
    if (typeof window === 'undefined') return `/display?token=${encodeURIComponent(token)}`;
    return `${window.location.origin}/display?token=${encodeURIComponent(token)}`;
  }

  async function handleCreate(e) {
    e.preventDefault();
    if (!newName.trim() || busy) return;
    setBusy(true);
    try {
    const payload = { name: newName.trim(), ...draftToPayload(newDraft) };
    const { ok, data } = await api.apiCreateDisplayDevice(familyId, payload);
    if (!ok) {
      toastError(errorText(data?.detail, t(messages, 'toast.error'), messages));
      return;
    }
    setCreated({
      token: data.token,
      device: data.device,
      displayUrl: buildDisplayUrl(data.token),
      imageUrl: data.device?.display_mode === 'eink' ? buildImageUrl(data.token) : null,
    });
    setShowCreate(false);
    resetCreateForm();
    setCopied(false);
    await load();
    } catch { toastError(t(messages, 'toast.error')); }
    finally { setBusy(false); }
  }

  function resetCreateForm() {
    setNewName('');
    setNewDraft(draftFromDevice(null));
  }

  async function handleSaveDevice(device) {
    if (busy) return;
    setBusy(true);
    try {
    const draft = deviceDrafts[device.id] || draftFromDevice(device);
    const { ok, data } = await api.apiUpdateDisplayDevice(familyId, device.id, draftToPayload(draft));
    if (!ok) {
      toastError(errorText(data?.detail, t(messages, 'toast.error'), messages));
      return;
    }
    setExpandedDeviceId(null);
    await load();
    } catch { toastError(t(messages, 'toast.error')); }
    finally { setBusy(false); }
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
          if (expandedDeviceId === device.id) setExpandedDeviceId(null);
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
    <div className="admin-subpage admin-subpage-displays">
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

      <div className="view-header adm-section-header admin-subpage-header">
        <div className="admin-subpage-title-block">
          <span className="admin-subpage-icon" aria-hidden="true">
            <Monitor size={20} />
          </span>
          <div>
            <h2 className="view-title">{t(messages, 'display_title')}</h2>
          </div>
        </div>
      </div>
      <p className="invite-intro">{t(messages, 'display_intro')}</p>
      <p className="invite-intro" data-testid="display-not-a-person-hint">
        <strong>{t(messages, 'display_not_a_person')}</strong>
      </p>

      {!demoMode && <DisplayWeatherPanel familyId={familyId} messages={messages} lang={lang} />}

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
          {created.imageUrl && (
            <>
              <p className="adm-banner-warning">{t(messages, 'display_image_url_hint')}</p>
              <div className="adm-banner-row">
                <code className="token-display" data-testid="display-created-image-url">{created.imageUrl}</code>
              </div>
            </>
          )}
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
                    ? t(messages, 'display_last_used').replace('{when}', parseServerInstant(device.last_used_at)?.toLocaleString())
                    : t(messages, 'display_never_used')}
                  {' · '}{t(messages, 'display_created').replace('{when}', parseServerInstant(device.created_at)?.toLocaleDateString())}
                  {' · '}{t(messages, device.display_mode === 'eink' ? 'display_mode_eink' : 'display_mode_tablet')} · {everyLabel(device.refresh_interval_seconds || 60, messages)}
                </div>
                {!device.revoked_at && (
                  <div className="display-device-composer-shell">
                    <button
                      type="button"
                      className="btn-ghost display-config-toggle"
                      onClick={() => setExpandedDeviceId(expandedDeviceId === device.id ? null : device.id)}
                      data-testid={`display-config-toggle-${device.id}`}
                      aria-expanded={expandedDeviceId === device.id ? 'true' : 'false'}
                    >
                      {expandedDeviceId === device.id
                        ? t(messages, 'close')
                        : t(messages, 'display_show_composer')}
                    </button>
                    {expandedDeviceId === device.id ? (
                      <AdminDialog title={device.name} messages={messages} busy={busy} onClose={() => setExpandedDeviceId(null)} actions={<><button className="ad-button" disabled={busy} onClick={() => setExpandedDeviceId(null)}>{t(messages, 'cancel')}</button><button className="ad-button primary" disabled={busy} onClick={() => handleSaveDevice(device)} data-testid="display-save-config">{t(messages, 'save')}</button></>}>
                        <fieldset className="ad-display-fields" disabled={busy}><DisplayStageEditor draft={deviceDrafts[device.id] || draftFromDevice(device)} messages={messages} onChange={(next) => setDeviceDrafts((current) => ({ ...current, [device.id]: next }))} /></fieldset>
                      </AdminDialog>
                    ) : (
                      <div className="display-device-compact-preview">
                        <StageSchematic layout={draftFromDevice(device).layout} messages={messages} />
                      </div>
                    )}
                  </div>
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
            <AdminDialog title={t(messages, 'display_create_section_title')} messages={messages} busy={busy} onClose={() => { setShowCreate(false); resetCreateForm(); }} actions={<><button className="ad-button" disabled={busy} onClick={() => { setShowCreate(false); resetCreateForm(); }}>{t(messages, 'cancel')}</button><button type="submit" form="admin-display-form" className="ad-button primary" disabled={busy} data-testid="display-create-submit">{t(messages, 'display_create')}</button></>}>
            <form id="admin-display-form" onSubmit={handleCreate}><fieldset className="ad-display-fields" disabled={busy}>
              <div className="settings-section adm-form-grid">
                <div className="display-create-form-heading">
                  <h2>{t(messages, 'display_create_section_title')}</h2>
                  <p>{t(messages, 'display_create_hint')}</p>
                </div>
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
                    autoComplete="off"
                    data-testid="display-create-name"
                  />
                  <small className="invite-helper-text">{t(messages, 'display_name_helper')}</small>
                </div>
                <DisplayStageEditor draft={newDraft} messages={messages} onChange={setNewDraft} />
              </div>
              </fieldset>
            </form></AdminDialog>
          ) : (
            <button
              className="btn-ghost"
              onClick={() => { resetCreateForm(); setShowCreate(true); }}
              data-testid="display-create-toggle"
            >
              <Monitor size={14} /> {t(messages, 'display_create')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
