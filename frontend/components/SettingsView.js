import { useState, useEffect, useCallback } from 'react';
import { User, Palette, Globe, ShieldCheck, Key, Plus, Trash2, Copy, Check, X } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { t } from '../lib/i18n';
import * as api from '../lib/api';

const THEME_DESCS = {
  en: { light: 'Warm and inviting', dark: 'Subtle and dark', 'midnight-glass': 'Glassmorphism, deep violet' },
  de: { light: 'Warm und einladend', dark: 'Dezent und dunkel', 'midnight-glass': 'Glassmorphism, tiefes Violett' },
};
const THEME_PREVIEWS = {
  light: { bg: '#f8f6f3', surface: '#ffffff', accent: '#7c3aed' },
  dark: { bg: '#0f172a', surface: '#1e293b', accent: '#7c3aed' },
  'midnight-glass': { bg: '#06080f', surface: '#111628', accent: '#7c3aed' },
};

const SCOPE_MODULES = [
  { key: 'calendar', label: 'Calendar' },
  { key: 'tasks', label: 'Tasks' },
  { key: 'contacts', label: 'Contacts' },
  { key: 'birthdays', label: 'Birthdays' },
  { key: 'families', label: 'Families' },
  { key: 'profile', label: 'Profile' },
];

export default function SettingsView() {
  const { theme, setTheme, lang, setLang, availableThemes, messages, me, isAdmin, loggedIn, demoMode, setProfileImage } = useApp();

  const initials = (me?.display_name || 'U').charAt(0).toUpperCase();

  // Token state
  const [tokens, setTokens] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newScopes, setNewScopes] = useState(['*']);
  const [newExpiry, setNewExpiry] = useState('');
  const [createdToken, setCreatedToken] = useState(null);
  const [copied, setCopied] = useState(false);

  const loadTokens = useCallback(async () => {
    if (!loggedIn || demoMode) return;
    const res = await api.apiGetTokens();
    if (res.ok) setTokens(res.data);
  }, [loggedIn, demoMode]);

  useEffect(() => { loadTokens(); }, [loadTokens]);

  function onProfileImage(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const value = String(reader.result || '');
      setProfileImage(value);
      if (loggedIn) {
        await api.apiUpdateProfileImage(value);
      }
    };
    reader.readAsDataURL(file);
  }

  function toggleFullAccess(checked) {
    setNewScopes(checked ? ['*'] : []);
  }

  function toggleModuleScope(mod, action, checked) {
    const scope = `${mod}:${action}`;
    setNewScopes(prev => {
      const filtered = prev.filter(s => s !== '*');
      if (checked) return [...filtered, scope];
      return filtered.filter(s => s !== scope);
    });
  }

  async function handleCreateToken(e) {
    e.preventDefault();
    const payload = {
      name: newName.trim(),
      scopes: newScopes.length ? newScopes : ['*'],
    };
    if (newExpiry) payload.expires_at = new Date(newExpiry).toISOString();

    const res = await api.apiCreateToken(payload);
    if (res.ok) {
      setCreatedToken(res.data.token);
      setShowCreate(false);
      setNewName('');
      setNewScopes(['*']);
      setNewExpiry('');
      loadTokens();
    }
  }

  async function handleRevoke(tokenId) {
    if (!confirm(t(messages, 'token_revoke_confirm'))) return;
    const res = await api.apiRevokeToken(tokenId);
    if (res.ok) {
      setTokens(prev => prev.filter(tk => tk.id !== tokenId));
    }
  }

  function handleCopy() {
    if (!createdToken) return;
    navigator.clipboard.writeText(createdToken);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function formatDate(iso) {
    if (!iso) return null;
    return new Date(iso).toLocaleDateString(lang === 'de' ? 'de-DE' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function formatScopes(scopeStr) {
    if (!scopeStr || scopeStr === '*') return t(messages, 'token_full_access');
    return scopeStr.split(',').join(', ');
  }

  const isFullAccess = newScopes.includes('*');

  return (
    <div>
      <div className="view-header">
        <div>
          <div className="view-title">{t(messages, 'settings')}</div>
          <div className="view-subtitle">{t(messages, 'settings_subtitle')}</div>
        </div>
      </div>

      <div className="settings-grid stagger">
        {/* Profile Section */}
        <div className="settings-section glass">
          <div className="settings-section-title"><User size={16} /> {t(messages, 'profile')}</div>
          <div className="profile-row">
            <div className="profile-avatar">{initials}</div>
            <div className="profile-info">
              <div className="profile-name">{me?.display_name || 'User'}</div>
              <div className="profile-email">{me?.email || ''}</div>
              <div className="profile-role">{isAdmin ? 'Admin' : t(messages, 'member')}</div>
            </div>
          </div>
          <div style={{ marginTop: 'var(--space-md)' }}>
            <label style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', display: 'block', marginBottom: 'var(--space-sm)' }}>
              {t(messages, 'profile_image')}
            </label>
            <input type="file" accept="image/*" onChange={onProfileImage} style={{ fontSize: '0.88rem' }} />
          </div>
        </div>

        {/* Theme Section */}
        <div className="settings-section glass">
          <div className="settings-section-title"><Palette size={16} /> {t(messages, 'theme')}</div>
          <div className="theme-grid">
            {availableThemes.map((th) => {
              const preview = THEME_PREVIEWS[th.key] || {};
              const isActive = theme === th.key;
              return (
                <div
                  key={th.key}
                  className={`theme-item${isActive ? ' active' : ' theme-item-inactive'}`}
                  onClick={() => setTheme(th.key)}
                >
                  <div
                    className="theme-preview"
                    style={{
                      background: `linear-gradient(135deg, ${preview.bg || '#111'} 50%, ${preview.surface || '#222'} 50%)`,
                      boxShadow: isActive ? `0 0 0 2px ${preview.accent || 'var(--amethyst)'}` : undefined,
                    }}
                  />
                  <div className="theme-item-info">
                    <div className="theme-item-name">{th.name}</div>
                    <div className="theme-item-desc">{(THEME_DESCS[lang] || THEME_DESCS.en)[th.key] || ''}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Language Section */}
        <div className="settings-section glass">
          <div className="settings-section-title"><Globe size={16} /> {t(messages, 'language')}</div>
          <div className="lang-toggle">
            <button className={`lang-btn${lang === 'de' ? ' active' : ''}`} onClick={() => setLang('de')}>Deutsch</button>
            <button className={`lang-btn${lang === 'en' ? ' active' : ''}`} onClick={() => setLang('en')}>English</button>
          </div>
        </div>

        {/* Privacy Section */}
        <div className="settings-section glass">
          <div className="settings-section-title"><ShieldCheck size={16} /> {t(messages, 'privacy')}</div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', lineHeight: 1.6 }}>
            {t(messages, 'privacy_note')}
          </p>
        </div>

        {/* API Tokens Section */}
        {!demoMode && (
          <div className="settings-section glass">
            <div className="settings-section-title"><Key size={16} /> {t(messages, 'api_tokens')}</div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: 1.5, marginBottom: 'var(--space-md)' }}>
              {t(messages, 'api_tokens_desc')}
            </p>

            {/* Token Created Banner */}
            {createdToken && (
              <div style={{
                background: 'rgba(16, 185, 129, 0.1)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                borderRadius: 'var(--radius-sm)',
                padding: 'var(--space-md)',
                marginBottom: 'var(--space-md)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: 'var(--space-sm)' }}>
                  <Check size={16} style={{ color: 'var(--success)' }} />
                  <span style={{ fontWeight: 600, fontSize: '0.88rem' }}>{t(messages, 'token_created')}</span>
                </div>
                <p style={{ color: 'var(--warning)', fontSize: '0.82rem', marginBottom: 'var(--space-sm)' }}>
                  {t(messages, 'token_created_warning')}
                </p>
                <div style={{ display: 'flex', gap: 'var(--space-sm)', alignItems: 'center' }}>
                  <code className="token-display">{createdToken}</code>
                  <button className="btn-ghost" onClick={handleCopy} style={{ flexShrink: 0 }}>
                    {copied ? <><Check size={14} /> {t(messages, 'token_copied')}</> : <><Copy size={14} /> {t(messages, 'token_copy')}</>}
                  </button>
                </div>
                <button
                  onClick={() => { setCreatedToken(null); setCopied(false); }}
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', marginTop: 'var(--space-sm)', fontSize: '0.78rem' }}
                >
                  <X size={12} style={{ verticalAlign: 'middle' }} /> Dismiss
                </button>
              </div>
            )}

            {/* Token List */}
            {tokens.length === 0 && !showCreate && (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontStyle: 'italic' }}>
                {t(messages, 'token_no_tokens')}
              </p>
            )}

            {tokens.map((tk) => (
              <div key={tk.id} className="glass-sm" style={{ padding: 'var(--space-md)', marginBottom: 'var(--space-sm)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.92rem' }}>{tk.name}</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                      {formatScopes(tk.scopes)}
                    </div>
                    <div style={{ display: 'flex', gap: 'var(--space-md)', marginTop: '6px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      <span>{t(messages, 'token_last_used')}: {tk.last_used_at ? formatDate(tk.last_used_at) : t(messages, 'token_never_used')}</span>
                      {tk.expires_at && <span>{t(messages, 'token_expires')}: {formatDate(tk.expires_at)}</span>}
                    </div>
                  </div>
                  <button
                    className="btn-ghost"
                    style={{ color: 'var(--danger)', flexShrink: 0 }}
                    onClick={() => handleRevoke(tk.id)}
                  >
                    <Trash2 size={14} /> {t(messages, 'token_revoke')}
                  </button>
                </div>
              </div>
            ))}

            {/* Create Form */}
            {showCreate ? (
              <form onSubmit={handleCreateToken} style={{ marginTop: 'var(--space-md)' }}>
                <div className="glass-sm" style={{ padding: 'var(--space-md)', display: 'grid', gap: 'var(--space-md)' }}>
                  <div className="form-field">
                    <label>{t(messages, 'token_name')}</label>
                    <input
                      className="form-input"
                      value={newName}
                      onChange={e => setNewName(e.target.value)}
                      placeholder={t(messages, 'token_name_placeholder')}
                      required
                      maxLength={100}
                    />
                  </div>

                  <div className="form-field">
                    <label>{t(messages, 'token_scopes')}</label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.88rem', cursor: 'pointer', marginBottom: '8px' }}>
                      <input type="checkbox" checked={isFullAccess} onChange={e => toggleFullAccess(e.target.checked)} />
                      {t(messages, 'token_full_access')}
                    </label>
                    {!isFullAccess && (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '6px' }}>
                        {SCOPE_MODULES.map(mod => (
                          <div key={mod.key} style={{ fontSize: '0.82rem' }}>
                            <div style={{ fontWeight: 500, marginBottom: '4px', color: 'var(--text-secondary)' }}>{mod.label}</div>
                            {['read', 'write'].map(action => (
                              <label key={action} style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', marginBottom: '2px' }}>
                                <input
                                  type="checkbox"
                                  checked={newScopes.includes(`${mod.key}:${action}`)}
                                  onChange={e => toggleModuleScope(mod.key, action, e.target.checked)}
                                />
                                {action}
                              </label>
                            ))}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="form-field">
                    <label>{t(messages, 'token_expiry')}</label>
                    <div style={{ display: 'flex', gap: 'var(--space-sm)', alignItems: 'center' }}>
                      <input
                        className="form-input"
                        type="date"
                        value={newExpiry}
                        onChange={e => setNewExpiry(e.target.value)}
                        min={new Date().toISOString().split('T')[0]}
                        style={{ flex: 1 }}
                      />
                      {newExpiry && (
                        <button type="button" className="btn-ghost" onClick={() => setNewExpiry('')}>
                          {t(messages, 'token_no_expiry')}
                        </button>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
                    <button type="submit" className="btn-sm" disabled={!newName.trim()}>
                      <Plus size={14} /> {t(messages, 'create_token')}
                    </button>
                    <button type="button" className="btn-ghost" onClick={() => setShowCreate(false)}>
                      Cancel
                    </button>
                  </div>
                </div>
              </form>
            ) : (
              <button
                className="btn-ghost"
                onClick={() => setShowCreate(true)}
                disabled={tokens.length >= 25}
                style={{ marginTop: 'var(--space-sm)' }}
              >
                <Plus size={14} /> {tokens.length >= 25 ? t(messages, 'token_limit_reached') : t(messages, 'create_token')}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
