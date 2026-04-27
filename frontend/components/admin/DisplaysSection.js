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
  const [newLayout, setNewLayout] = useState(null);
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
    const payload = {
      name: newName.trim(),
      display_mode: newMode,
      layout_preset: newPreset,
      refresh_interval_seconds: Number(newRefresh),
    };
    if (newLayout) payload.layout_config = newLayout;
    const { ok, data } = await api.apiCreateDisplayDevice(familyId, payload);
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
    setNewLayout(null);
  }

  function updateDraft(deviceId, patch, device = null) {
    setDeviceDrafts((current) => {
      const previous = current[deviceId] || (device ? deviceToDraft(device) : {});
      const next = { ...previous, ...patch };
      // Picking a different preset or mode must also drop stale layout_config so
      // the slot editor reflects the freshly chosen preset/mode grid.
      const presetChanged = patch.layout_preset && patch.layout_preset !== previous.layout_preset;
      const modeChanged = patch.display_mode && patch.display_mode !== previous.display_mode;
      if ((presetChanged || modeChanged) && !Object.prototype.hasOwnProperty.call(patch, 'layout_config')) {
        next.layout_config = null;
      }
      return { ...current, [deviceId]: next };
    });
  }

  async function handleSaveDevice(device) {
    const draft = deviceDrafts[device.id] || deviceToDraft(device);
    const payload = {
      display_mode: draft.display_mode,
      layout_preset: draft.layout_preset,
      refresh_interval_seconds: Number(draft.refresh_interval_seconds),
    };
    if (Object.prototype.hasOwnProperty.call(draft, 'layout_config')) payload.layout_config = draft.layout_config;
    const { ok, data } = await api.apiUpdateDisplayDevice(familyId, device.id, payload);
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
                    onChange={(patch) => updateDraft(device.id, patch, device)}
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
                  draft={{
                    display_mode: newMode,
                    layout_preset: newPreset,
                    refresh_interval_seconds: newRefresh,
                    layout_config: newLayout,
                  }}
                  messages={messages}
                  onChange={(patch) => {
                    if (patch.display_mode) {
                      setNewMode(patch.display_mode);
                      if (patch.display_mode === 'eink' && newPreset === 'hearth') setNewPreset('eink_compact');
                      setNewLayout(null);
                    }
                    if (patch.layout_preset) {
                      setNewPreset(patch.layout_preset);
                      // Resetting layout_config keeps the slot editor in sync with the freshly chosen preset.
                      setNewLayout(null);
                    }
                    if (patch.refresh_interval_seconds) setNewRefresh(Number(patch.refresh_interval_seconds));
                    if (Object.prototype.hasOwnProperty.call(patch, 'layout_config')) {
                      setNewLayout(patch.layout_config);
                    }
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

// Mirrors the canonical preset definitions in backend/app/core/display_layouts.py
// so the composer can render mini-previews and seed the slot editor without an
// extra API round-trip. The backend remains the source of truth and re-validates
// every saved layout, so any drift here is corrected server-side.
const PRESET_LAYOUTS = {
  hearth: {
    columns: 3, rows: 3,
    widgets: [
      { type: 'home_header', x: 0, y: 0, w: 1, h: 2 },
      { type: 'focus', x: 0, y: 2, w: 1, h: 1 },
      { type: 'agenda', x: 1, y: 0, w: 1, h: 3 },
      { type: 'birthdays', x: 2, y: 0, w: 1, h: 1 },
      { type: 'members', x: 2, y: 1, w: 1, h: 2 },
    ],
  },
  agenda_first: {
    columns: 3, rows: 3,
    widgets: [
      { type: 'agenda', x: 0, y: 0, w: 2, h: 3 },
      { type: 'home_header', x: 2, y: 0, w: 1, h: 2 },
      { type: 'birthdays', x: 2, y: 2, w: 1, h: 1 },
    ],
  },
  family_board: {
    columns: 3, rows: 3,
    widgets: [
      { type: 'home_header', x: 0, y: 0, w: 1, h: 2 },
      { type: 'members', x: 1, y: 0, w: 2, h: 2 },
      { type: 'agenda', x: 0, y: 2, w: 2, h: 1 },
      { type: 'birthdays', x: 2, y: 2, w: 1, h: 1 },
    ],
  },
  eink_compact: {
    columns: 2, rows: 3,
    widgets: [
      { type: 'home_header', x: 0, y: 0, w: 2, h: 1 },
      { type: 'agenda', x: 0, y: 1, w: 2, h: 1 },
      { type: 'birthdays', x: 0, y: 2, w: 1, h: 1 },
      { type: 'members', x: 1, y: 2, w: 1, h: 1 },
    ],
  },
  eink_agenda: {
    columns: 1, rows: 3,
    widgets: [
      { type: 'home_header', x: 0, y: 0, w: 1, h: 1 },
      { type: 'agenda', x: 0, y: 1, w: 1, h: 1 },
      { type: 'birthdays', x: 0, y: 2, w: 1, h: 1 },
    ],
  },
};

const ALLOWED_WIDGETS = ['home_header', 'identity', 'clock', 'focus', 'agenda', 'birthdays', 'members'];

function deviceToDraft(device) {
  return {
    display_mode: device.display_mode || 'tablet',
    layout_preset: device.layout_preset || 'hearth',
    refresh_interval_seconds: device.refresh_interval_seconds || (device.display_mode === 'eink' ? 900 : 60),
    layout_config: device.layout_config || null,
  };
}

function displayModeLabel(mode, messages) {
  return mode === 'eink' ? t(messages, 'display_mode_eink') : t(messages, 'display_mode_tablet');
}

function layoutPresetLabel(preset, messages) {
  return t(messages, `display_layout_${preset || 'hearth'}`);
}

function widgetLabel(widget, messages) {
  return t(messages, `display_widget_${widget}`);
}

function effectiveLayout(draft) {
  if (draft.layout_config && Array.isArray(draft.layout_config.widgets)) return draft.layout_config;
  return PRESET_LAYOUTS[draft.layout_preset] || PRESET_LAYOUTS.hearth;
}

function PresetMiniPreview({ preset, layout }) {
  return (
    <div
      className="display-layout-preview"
      data-testid={`display-layout-preview-${preset}`}
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${layout.columns}, 1fr)`,
        gridTemplateRows: `repeat(${layout.rows}, 1fr)`,
        gap: 2,
      }}
    >
      {layout.widgets.map((widget, idx) => (
        <span
          key={`${widget.type}-${idx}`}
          className="display-layout-preview-cell"
          data-widget-type={widget.type}
          style={{
            gridColumn: `${widget.x + 1} / span ${widget.w}`,
            gridRow: `${widget.y + 1} / span ${widget.h}`,
          }}
        />
      ))}
    </div>
  );
}

function DisplayConfigControls({ draft, messages, onChange, onSave = null }) {
  const layout = effectiveLayout(draft);

  function updateSlot(index, patch) {
    const nextWidgets = layout.widgets.map((widget, i) => {
      if (i !== index) return widget;
      return normalizeSlot({ ...widget, ...patch }, layout);
    });
    onChange({ layout_config: { columns: layout.columns, rows: layout.rows, widgets: nextWidgets } });
  }

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
        <div
          className="display-layout-card-grid"
          role="radiogroup"
          aria-label={t(messages, 'display_layout_label')}
        >
          {LAYOUT_PRESETS.map((preset) => {
            const presetLayout = PRESET_LAYOUTS[preset];
            const selected = draft.layout_preset === preset;
            return (
              <button
                key={preset}
                type="button"
                className={`display-layout-card${selected ? ' display-layout-card--selected' : ''}`}
                aria-pressed={selected ? 'true' : 'false'}
                data-testid={`display-layout-card-${preset}`}
                onClick={() => onChange({ layout_preset: preset })}
              >
                <PresetMiniPreview preset={preset} layout={presetLayout} />
                <span className="display-layout-card-label">{layoutPresetLabel(preset, messages)}</span>
              </button>
            );
          })}
        </div>
        {/* Backward-compatible select for screen readers and keyboard-only flows.
            The card grid above mirrors its state. */}
        <select
          className="form-input display-layout-select-fallback"
          value={draft.layout_preset}
          onChange={(e) => onChange({ layout_preset: e.target.value })}
          data-testid="display-layout-select"
          aria-label={t(messages, 'display_layout_label')}
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

      <div className="form-field" data-testid="display-live-preview">
        <label>{t(messages, 'display_live_preview_label')}</label>
        <div className="display-live-preview-body">
          <strong className="display-live-preview-title">{layoutPresetLabel(draft.layout_preset, messages)}</strong>
          <PresetMiniPreview preset={`live-${draft.layout_preset}`} layout={layout} />
          <ul className="display-live-preview-slots">
            {layout.widgets.map((widget, idx) => (
              <li key={`${widget.type}-${idx}`}>
                {widgetLabel(widget.type, messages)} · {widget.w}×{widget.h} @ ({widget.x},{widget.y})
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="form-field">
        <label>{t(messages, 'display_slot_editor_label')}</label>
        <div className="display-slot-editor">
          {layout.widgets.map((widget, idx) => (
            <div
              key={idx}
              className="display-slot-editor-row"
              data-testid={`display-slot-editor-row-${idx}`}
            >
              <select
                className="form-input"
                value={ALLOWED_WIDGETS.includes(widget.type) ? widget.type : ALLOWED_WIDGETS[0]}
                onChange={(e) => updateSlot(idx, { type: e.target.value })}
                data-testid={`display-slot-editor-row-${idx}-type`}
                aria-label={t(messages, 'display_slot_widget_label')}
              >
                {ALLOWED_WIDGETS.map((kind) => (
                  <option key={kind} value={kind}>{widgetLabel(kind, messages)}</option>
                ))}
              </select>
              <input
                type="number"
                className="form-input"
                min={0}
                max={Math.max(0, layout.columns - 1)}
                value={widget.x}
                onChange={(e) => updateSlot(idx, { x: clampNum(e.target.value, 0, layout.columns - 1, widget.x) })}
                data-testid={`display-slot-editor-row-${idx}-x`}
                aria-label={`${t(messages, 'display_slot_x_label')} ${idx + 1}`}
              />
              <input
                type="number"
                className="form-input"
                min={0}
                max={Math.max(0, layout.rows - 1)}
                value={widget.y}
                onChange={(e) => updateSlot(idx, { y: clampNum(e.target.value, 0, layout.rows - 1, widget.y) })}
                data-testid={`display-slot-editor-row-${idx}-y`}
                aria-label={`${t(messages, 'display_slot_y_label')} ${idx + 1}`}
              />
              <input
                type="number"
                className="form-input"
                min={1}
                max={Math.max(1, layout.columns - widget.x)}
                value={widget.w}
                onChange={(e) => updateSlot(idx, { w: clampNum(e.target.value, 1, Math.max(1, layout.columns - widget.x), widget.w) })}
                data-testid={`display-slot-editor-row-${idx}-w`}
                aria-label={`${t(messages, 'display_slot_w_label')} ${idx + 1}`}
              />
              <input
                type="number"
                className="form-input"
                min={1}
                max={Math.max(1, layout.rows - widget.y)}
                value={widget.h}
                onChange={(e) => updateSlot(idx, { h: clampNum(e.target.value, 1, Math.max(1, layout.rows - widget.y), widget.h) })}
                data-testid={`display-slot-editor-row-${idx}-h`}
                aria-label={`${t(messages, 'display_slot_h_label')} ${idx + 1}`}
              />
            </div>
          ))}
        </div>
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

function normalizeSlot(widget, layout) {
  const x = clampNum(widget.x, 0, Math.max(0, layout.columns - 1), 0);
  const y = clampNum(widget.y, 0, Math.max(0, layout.rows - 1), 0);
  const w = clampNum(widget.w, 1, Math.max(1, layout.columns - x), 1);
  const h = clampNum(widget.h, 1, Math.max(1, layout.rows - y), 1);
  return {
    type: ALLOWED_WIDGETS.includes(widget.type) ? widget.type : ALLOWED_WIDGETS[0],
    x,
    y,
    w,
    h,
  };
}

function clampNum(raw, lo, hi, fallback) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(hi, Math.max(lo, Math.trunc(n)));
}
