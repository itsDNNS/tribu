import { useState, useEffect, useCallback } from 'react';
import { Check, Copy, X, Link, Trash2 } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { useToast } from '../../contexts/ToastContext';
import { copyTextToClipboard, errorText } from '../../lib/helpers';
import { t } from '../../lib/i18n';
import * as api from '../../lib/api';
import ConfirmDialog from '../ConfirmDialog';

export default function InviteSection() {
  const { familyId, messages, demoMode } = useApp();
  const { success: toastSuccess, error: toastError } = useToast();
  const [invites, setInvites] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [rolePreset, setRolePreset] = useState('member');
  const [isAdultPreset, setIsAdultPreset] = useState(false);
  const [expiryDays, setExpiryDays] = useState(7);
  const [maxUses, setMaxUses] = useState('');
  const [createdUrl, setCreatedUrl] = useState(null);
  const [copied, setCopied] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);

  // Base URL settings
  const [baseUrl, setBaseUrl] = useState('');
  const [baseUrlEnv, setBaseUrlEnv] = useState('');
  const [baseUrlEffective, setBaseUrlEffective] = useState('');

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
    const payload = {
      role_preset: rolePreset,
      is_adult_preset: isAdultPreset,
      expires_in_days: expiryDays,
    };
    if (maxUses) payload.max_uses = parseInt(maxUses);
    const { ok, data } = await api.apiCreateInvitation(familyId, payload);
    if (!ok) {
      toastError(errorText(data?.detail, t(messages, 'toast.error'), messages));
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
    setConfirmAction({
      title: t(messages, 'invite_revoke'),
      message: t(messages, 'invite_revoke_confirm'),
      danger: true,
      action: async () => {
        const { ok, data } = await api.apiRevokeInvitation(familyId, inviteId);
        if (!ok) {
          toastError(errorText(data?.detail, t(messages, 'toast.error'), messages));
        } else {
          await loadInvites();
        }
        setConfirmAction(null);
      },
    });
  }

  async function handleSaveBaseUrl() {
    const { ok } = await api.apiSetBaseUrl(baseUrl);
    if (ok) {
      toastSuccess(t(messages, 'toast.saved'));
      await loadBaseUrl();
    }
  }

  async function handleCopyUrl() {
    if (!createdUrl) return;
    if (!await copyTextToClipboard(createdUrl)) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function inviteStatus(inv) {
    if (inv.revoked) return { label: t(messages, 'invite_status_revoked'), color: 'var(--text-muted)' };
    if (new Date(inv.expires_at) < new Date()) return { label: t(messages, 'invite_status_expired'), color: 'var(--text-muted)' };
    if (inv.max_uses && inv.use_count >= inv.max_uses) return { label: t(messages, 'invite_status_used_up'), color: 'var(--text-muted)' };
    return { label: t(messages, 'invite_status_active'), color: 'var(--success)' };
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
          <h1 className="view-title">{t(messages, 'invite_title')}</h1>
        </div>
      </div>
      <p className="invite-intro">{t(messages, 'invite_intro')}</p>
      {/* Base URL setting */}
      {!demoMode && (
        <div className="settings-section adm-section-gap">
          <div className="adm-col-layout">
            <span className="adm-field-title">{t(messages, 'base_url_title')}</span>
            <small className="adm-field-hint">{t(messages, 'base_url_hint')}</small>
            <input
              className="form-input"
              type="url"
              placeholder="https://tribu.example.com"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
            />
            {baseUrlEnv && (
              <small className="adm-field-hint-sm">
                {t(messages, 'base_url_env')}: {baseUrlEnv}
              </small>
            )}
            <small className="adm-field-hint-sm">
              {t(messages, 'base_url_effective')}: {baseUrlEffective}
            </small>
            <button className="btn-primary adm-self-start" onClick={handleSaveBaseUrl}>
              {t(messages, 'base_url_save')}
            </button>
          </div>
        </div>
      )}

      {/* Created URL banner */}
      {createdUrl && (
        <div className="adm-success-banner">
          <div className="adm-banner-header">
            <Check size={16} className="adm-icon-success" />
            <span className="adm-banner-title">{t(messages, 'invite_link_created')}</span>
          </div>
          <p className="adm-banner-warning">
            {t(messages, 'invite_link_hint')}
          </p>
          <p className="adm-banner-warning">
            {t(messages, 'invite_link_share_hint')}
          </p>
          <div className="adm-banner-row">
            <code className="token-display">{createdUrl}</code>
            <button className="btn-ghost adm-banner-no-shrink" onClick={handleCopyUrl}>
              {copied ? <><Check size={14} /> {t(messages, 'invite_copied')}</> : <><Copy size={14} /> {t(messages, 'invite_copy')}</>}
            </button>
          </div>
          <button
            className="adm-banner-dismiss"
            onClick={() => { setCreatedUrl(null); setCopied(false); }}
          >
            <X size={12} className="adm-icon-middle" /> {t(messages, 'dismiss')}
          </button>
        </div>
      )}

      {/* Invite list */}
      <div className="settings-section adm-section-gap">
        {invites.length === 0 && <p className="adm-empty">{t(messages, 'invite_no_invites')}</p>}
        {invites.map((inv) => {
          const status = inviteStatus(inv);
          return (
            <div key={inv.id} className="adm-list-item">
              <div>
                <div className="adm-list-item-header">
                  <Link size={14} className="adm-list-item-icon" />
                  <span className="adm-list-item-role">{inv.role_preset}</span>
                  <span className="adm-list-item-status" style={{ color: status.color }}>{status.label}</span>
                </div>
                <div className="adm-list-item-meta">
                  {inv.max_uses
                    ? t(messages, 'invite_uses').replace('{count}', inv.use_count).replace('{max}', inv.max_uses)
                    : t(messages, 'invite_uses_unlimited').replace('{count}', inv.use_count)
                  }
                  {' · '}{new Date(inv.expires_at).toLocaleDateString()}
                </div>
              </div>
              {!inv.revoked && new Date(inv.expires_at) > new Date() && (
                <button className="btn-ghost adm-revoke-btn" onClick={() => handleRevoke(inv.id)}>
                  <Trash2 size={14} /> {t(messages, 'invite_revoke')}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Create invite form */}
      {!demoMode && (
        <div className="adm-section-gap">
          {showCreate ? (
            <form onSubmit={handleCreate}>
              <div className="settings-section adm-form-grid">
                <div className="form-field">
                  <label>{t(messages, 'invite_role')}</label>
                  <select className="form-input" value={rolePreset} onChange={(e) => setRolePreset(e.target.value)}>
                    <option value="member">{t(messages, 'member')}</option>
                    <option value="admin">Admin</option>
                  </select>
                  <small className="invite-helper-text">{t(messages, 'invite_role_helper')}</small>
                </div>
                <label className="set-checkbox-label">
                  <input type="checkbox" checked={isAdultPreset} onChange={(e) => setIsAdultPreset(e.target.checked)} />
                  {t(messages, 'invite_is_adult')}
                </label>
                <small className="invite-helper-text">{t(messages, 'invite_adult_helper')}</small>
                <div className="form-field">
                  <label>{t(messages, 'invite_expiry_days')}</label>
                  <input className="form-input adm-input-narrow" type="number" min={1} max={90} value={expiryDays} onChange={(e) => setExpiryDays(parseInt(e.target.value) || 7)} />
                </div>
                <div className="form-field">
                  <label>{t(messages, 'invite_max_uses')}</label>
                  <input className="form-input adm-input-narrow" type="number" min={1} max={1000} value={maxUses} onChange={(e) => setMaxUses(e.target.value)} placeholder="-" />
                </div>
                <div className="set-btn-row">
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
