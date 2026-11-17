import { useState, useEffect, useCallback, useId, useRef } from 'react';
import { Key, Plus, Trash2, Copy, Check, X } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { useToast } from '../../contexts/ToastContext';
import { copyTextToClipboard, parseServerInstant } from '../../lib/helpers';
import { t } from '../../lib/i18n';
import * as api from '../../lib/api';
import { FULL_ACCESS_SCOPE, formatTokenScopes, tokenScopeModulesFor } from '../../lib/tokenScopes';

export default function ApiTokensTab() {
  const { messages, lang, loggedIn, demoMode, isAdmin } = useApp();
  const { success: toastSuccess, error: toastError } = useToast();
  const scopeModules = tokenScopeModulesFor(isAdmin);

  const [tokens, setTokens] = useState([]);
  const id = useId();
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newScopes, setNewScopes] = useState([FULL_ACCESS_SCOPE]);
  const [newExpiry, setNewExpiry] = useState('');
  const [createdToken, setCreatedToken] = useState(null);
  const [copied, setCopied] = useState(false);
  // One request at a time: a double click must not create two tokens and
  // replace the secret of the first before it could be copied.
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  const loadTokens = useCallback(async () => {
    if (!loggedIn || demoMode) return;
    const res = await api.apiGetTokens();
    if (res.ok) setTokens(res.data);
  }, [loggedIn, demoMode]);

  useEffect(() => { loadTokens(); }, [loadTokens]);

  const isFullAccess = newScopes.includes(FULL_ACCESS_SCOPE);
  // Without Full access the token needs at least one module scope; an empty
  // list must never fall back to full access.
  const scopeMissing = !isFullAccess && newScopes.length === 0;

  function toggleFullAccess(checked) {
    setNewScopes(checked ? [FULL_ACCESS_SCOPE] : []);
  }

  function toggleModuleScope(mod, action, checked) {
    const scope = `${mod}:${action}`;
    setNewScopes(prev => {
      const filtered = prev.filter(s => s !== FULL_ACCESS_SCOPE);
      if (checked) return [...filtered, scope];
      return filtered.filter(s => s !== scope);
    });
  }

  async function handleCreateToken(e) {
    e.preventDefault();
    if (scopeMissing || submittingRef.current) return;
    const payload = {
      name: newName.trim(),
      scopes: newScopes,
    };
    if (newExpiry) payload.expires_at = new Date(newExpiry).toISOString();

    submittingRef.current = true;
    setSubmitting(true);
    let res;
    try {
      res = await api.apiCreateToken(payload);
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
    if (res.ok) {
      setCreatedToken(res.data.token);
      setShowCreate(false);
      setNewName('');
      setNewScopes([FULL_ACCESS_SCOPE]);
      setNewExpiry('');
      toastSuccess(t(messages, 'token_created'));
      loadTokens();
    } else {
      toastError(t(messages, 'toast.error'));
    }
  }

  async function handleRevoke(tokenId) {
    if (!confirm(t(messages, 'token_revoke_confirm'))) return;
    const res = await api.apiRevokeToken(tokenId);
    if (res.ok) {
      setTokens(prev => prev.filter(tk => tk.id !== tokenId));
      toastSuccess(t(messages, 'toast.token_revoked'));
    } else {
      toastError(t(messages, 'toast.error'));
    }
  }

  async function handleCopy() {
    if (!createdToken) return;
    if (!await copyTextToClipboard(createdToken)) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function formatDate(iso) {
    if (!iso) return null;
    return parseServerInstant(iso).toLocaleDateString(lang === 'de' ? 'de-DE' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  return (
    <div className="settings-grid">
      <div className="settings-section">
        <div className="settings-section-title"><Key size={16} /> {t(messages, 'api_tokens')}</div>
        <p className="set-token-section-desc">
          {t(messages, 'api_tokens_desc')}
        </p>

        {/* Token Created Banner */}
        {createdToken && (
          <div className="set-token-banner">
            <div className="set-token-banner-header">
              <Check size={16} className="set-token-banner-icon" />
              <span className="set-token-banner-title">{t(messages, 'token_created')}</span>
            </div>
            <p className="set-token-banner-warning">
              {t(messages, 'token_created_warning')}
            </p>
            <div className="set-token-banner-row">
              <code className="token-display">{createdToken}</code>
              <button className="btn-ghost set-token-no-shrink" onClick={handleCopy}>
                {copied ? <><Check size={14} /> {t(messages, 'token_copied')}</> : <><Copy size={14} /> {t(messages, 'token_copy')}</>}
              </button>
            </div>
            <button
              className="set-token-dismiss"
              onClick={() => { setCreatedToken(null); setCopied(false); }}
            >
              <X size={12} className="set-token-dismiss-icon" /> Dismiss
            </button>
          </div>
        )}

        {/* Token List */}
        {tokens.length === 0 && !showCreate && (
          <p className="set-token-empty">
            {t(messages, 'token_no_tokens')}
          </p>
        )}

        {tokens.map((tk) => (
          <div key={tk.id} className="settings-subsection set-token-item">
            <div className="set-token-item-row">
              <div>
                <div className="set-token-name">{tk.name}</div>
                <div className="set-token-scopes">
                  {formatTokenScopes(messages, tk.scopes)}
                </div>
                <div className="set-token-meta">
                  <span>{t(messages, 'token_last_used')}: {tk.last_used_at ? formatDate(tk.last_used_at) : t(messages, 'token_never_used')}</span>
                  {tk.expires_at && <span>{t(messages, 'token_expires')}: {formatDate(tk.expires_at)}</span>}
                </div>
              </div>
              <button
                className="btn-ghost set-token-revoke"
                onClick={() => handleRevoke(tk.id)}
              >
                <Trash2 size={14} /> {t(messages, 'token_revoke')}
              </button>
            </div>
          </div>
        ))}

        {/* Create Form */}
        {showCreate ? (
          <form onSubmit={handleCreateToken} className="set-token-create-form">
            <div className="settings-subsection set-token-form-grid">
              <div className="form-field">
                <label htmlFor={`${id}-name`}>{t(messages, 'token_name')}</label>
                <input
                  id={`${id}-name`}
                  className="form-input"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder={t(messages, 'token_name_placeholder')}
                  required
                  maxLength={100}
                />
              </div>

              <div className="form-field" role="group" aria-labelledby={`${id}-scopes`}>
                <label id={`${id}-scopes`}>{t(messages, 'token_scopes')}</label>
                <label className="set-token-scope-check">
                  <input type="checkbox" checked={isFullAccess} onChange={e => toggleFullAccess(e.target.checked)} />
                  {t(messages, 'token_full_access')}
                </label>
                {!isFullAccess && (
                  <div className="set-token-scope-grid">
                    {scopeModules.map(({ key: mod, actions }) => (
                      <div key={mod} className="set-token-scope-module" role="group" aria-labelledby={`${id}-scope-${mod}`}>
                        <div id={`${id}-scope-${mod}`} className="set-token-scope-label">{t(messages, `token_scope_${mod}`)}</div>
                        <div className="set-token-scope-actions">
                          {actions.map(action => (
                            <label key={action} className="set-token-scope-action">
                              <input
                                type="checkbox"
                                checked={newScopes.includes(`${mod}:${action}`)}
                                onChange={e => toggleModuleScope(mod, action, e.target.checked)}
                              />
                              {t(messages, `token_action_${action}`)}
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {scopeMissing && (
                  <p id={`${id}-scope-missing`} className="set-token-scope-missing" role="status">
                    {t(messages, 'token_scope_required')}
                  </p>
                )}
              </div>

              <div className="form-field">
                <label htmlFor={`${id}-expiry`}>{t(messages, 'token_expiry')}</label>
                <div className="set-token-expiry-row">
                  <input
                    id={`${id}-expiry`}
                    className="form-input set-token-expiry-input"
                    type="date"
                    value={newExpiry}
                    onChange={e => setNewExpiry(e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                  />
                  {newExpiry && (
                    <button type="button" className="btn-ghost" onClick={() => setNewExpiry('')}>
                      {t(messages, 'token_no_expiry')}
                    </button>
                  )}
                </div>
              </div>

              <div className="set-token-actions">
                <button
                  type="submit"
                  className="btn-sm"
                  disabled={!newName.trim() || scopeMissing || submitting}
                  aria-describedby={scopeMissing ? `${id}-scope-missing` : undefined}
                >
                  <Plus size={14} /> {t(messages, 'create_token')}
                </button>
                <button type="button" className="btn-ghost" onClick={() => setShowCreate(false)}>
                  {t(messages, 'cancel')}
                </button>
              </div>
            </div>
          </form>
        ) : (
          <button
            className="btn-ghost set-token-add-btn"
            onClick={() => setShowCreate(true)}
            disabled={tokens.length >= 25}
          >
            <Plus size={14} /> {tokens.length >= 25 ? t(messages, 'token_limit_reached') : t(messages, 'create_token')}
          </button>
        )}
      </div>
    </div>
  );
}
