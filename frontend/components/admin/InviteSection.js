import { useState, useEffect, useCallback } from 'react';
import { Check, Copy, X, Link, Trash2 } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { useToast } from '../../contexts/ToastContext';
import { errorText } from '../../lib/helpers';
import { t } from '../../lib/i18n';
import * as api from '../../lib/api';

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
      toastError(errorText(data?.detail, 'Failed'));
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
      toastError(errorText(data?.detail, 'Failed'));
      return;
    }
    await loadInvites();
  }

  async function handleSaveBaseUrl() {
    const { ok } = await api.apiSetBaseUrl(baseUrl);
    if (ok) {
      toastSuccess(t(messages, 'toast.saved'));
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
              {t(messages, 'base_url_save')}
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
