import { useEffect, useMemo, useState } from 'react';
import { Smartphone, Copy, Check, ExternalLink, Activity, AlertTriangle, RefreshCw, Trash2 } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { copyTextToClipboard } from '../../lib/helpers';
import { t } from '../../lib/i18n';
import * as api from '../../lib/api';


const DAV_SCOPES = ['calendar:read', 'calendar:write', 'contacts:read', 'contacts:write'];

function tokenScopes(token) {
  if (!token?.scopes) return [];
  if (token.scopes === '*') return ['*'];
  return token.scopes.split(',').map(scope => scope.trim()).filter(Boolean);
}

function isDavToken(token) {
  const scopes = tokenScopes(token);
  return scopes.includes('*') || scopes.some(scope => DAV_SCOPES.includes(scope));
}

function scopeListForRenewal(token) {
  const scopes = tokenScopes(token);
  if (scopes.includes('*')) return ['*'];
  const davScopes = scopes.filter(scope => DAV_SCOPES.includes(scope));
  return davScopes.length ? davScopes : ['*'];
}

function failureLabel(messages, reason) {
  const safeReasons = new Set(['auth_failed', 'scope_mismatch', 'token_expired', 'malformed_request', 'not_found', 'server_error']);
  const key = safeReasons.has(reason) ? `phone_sync_failure_${reason}` : 'phone_sync_failure_unknown';
  return t(messages, key);
}

function formatDateTime(value, lang) {
  if (!value) return null;
  try {
    return new Date(value).toLocaleString(lang === 'de' ? 'de-DE' : 'en-US', {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return null;
  }
}

function HealthCard({ token, messages, lang, onRenew, onRevoke }) {
  const hasFailure = Boolean(token.last_dav_failure_at);
  const hasSuccess = Boolean(token.last_dav_success_at);
  return (
    <div className={`sync-health-card ${hasFailure ? 'sync-health-card-warning' : ''}`}>
      <div className="sync-health-card-main">
        <div className="sync-health-card-title-row">
          {hasFailure ? <AlertTriangle size={15} aria-hidden="true" /> : <Activity size={15} aria-hidden="true" />}
          <span className="sync-health-card-title">{token.name}</span>
        </div>
        <div className="sync-health-scope">{token.scopes === '*' ? t(messages, 'token_full_access') : token.scopes}</div>
        <div className="sync-health-meta">
          <span>{t(messages, 'phone_sync_last_success')}: {hasSuccess ? formatDateTime(token.last_dav_success_at, lang) : t(messages, 'token_never_used')}</span>
          {hasFailure && (
            <span>{t(messages, 'phone_sync_last_failure')}: {formatDateTime(token.last_dav_failure_at, lang)} · <span>{failureLabel(messages, token.last_dav_failure_reason)}</span></span>
          )}
        </div>
      </div>
      <div className="sync-health-actions">
        <button type="button" className="btn-ghost sync-health-action" onClick={() => onRenew(token)}>
          <RefreshCw size={14} aria-hidden="true" /> {t(messages, 'phone_sync_renew_token')}
        </button>
        <button type="button" className="btn-ghost sync-health-action sync-health-danger" onClick={() => onRevoke(token)}>
          <Trash2 size={14} aria-hidden="true" /> {t(messages, 'phone_sync_disable_token')}
        </button>
      </div>
    </div>
  );
}

function buildDavServerUrl() {
  const origin = typeof window !== 'undefined' && window.location ? window.location.origin : '';
  return `${origin}/dav`;
}

function CopyRow({ label, value, copyAria }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="sync-url-row">
      <div className="sync-url-label">{label}</div>
      <code className="sync-url-value">{value}</code>
      <button
        type="button"
        className="btn-sm sync-url-copy"
        aria-label={copyAria}
        onClick={async () => {
          if (!await copyTextToClipboard(value)) return;
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
      </button>
    </div>
  );
}

export default function PhoneSyncTab() {
  const { me, families, messages, lang, loggedIn, demoMode } = useApp();
  const email = me?.email || '';
  const serverUrl = buildDavServerUrl();
  const [tokens, setTokens] = useState([]);
  const [createdToken, setCreatedToken] = useState(null);
  const [loadingTokens, setLoadingTokens] = useState(false);
  const [tokenError, setTokenError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function loadTokens() {
      if (loggedIn === false || demoMode) return;
      setLoadingTokens(true);
      setTokenError(false);
      try {
        const res = await api.apiGetTokens();
        if (!cancelled && res.ok) setTokens(res.data || []);
        if (!cancelled && !res.ok) setTokenError(true);
      } catch {
        if (!cancelled) setTokenError(true);
      } finally {
        if (!cancelled) setLoadingTokens(false);
      }
    }
    loadTokens();
    return () => { cancelled = true; };
  }, [loggedIn, demoMode]);

  const davTokens = useMemo(() => tokens.filter(isDavToken), [tokens]);

  async function handleRenew(token) {
    setTokenError(false);
    try {
      const res = await api.apiCreateToken({
        name: `${token.name} ${t(messages, 'phone_sync_renewed_suffix')}`.trim(),
        scopes: scopeListForRenewal(token),
      });
      if (!res.ok) {
        setTokenError(true);
        return;
      }
      setCreatedToken(res.data?.token || null);
      const list = await api.apiGetTokens();
      if (list.ok) setTokens(list.data || []);
      if (!list.ok) setTokenError(true);
    } catch {
      setTokenError(true);
    }
  }

  async function handleRevoke(token) {
    if (!confirm(t(messages, 'phone_sync_disable_confirm'))) return;
    setTokenError(false);
    try {
      const res = await api.apiRevokeToken(token.id);
      if (res.ok) {
        setTokens(prev => prev.filter(item => item.id !== token.id));
      } else {
        setTokenError(true);
      }
    } catch {
      setTokenError(true);
    }
  }

  if (!email || !families.length) {
    return (
      <div className="settings-grid">
        <div className="settings-section">
          <div className="settings-section-title">
            <Smartphone size={16} />
            {t(messages, 'phone_sync_title')}
          </div>
          <p className="set-data-section-desc">{t(messages, 'phone_sync_empty')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="settings-grid">
      <div className="settings-section">
        <div className="settings-section-title">
          <Smartphone size={16} />
          {t(messages, 'phone_sync_title')}
        </div>
        <p className="set-data-section-desc">{t(messages, 'phone_sync_intro')}</p>

        <div className="sync-section-heading">{t(messages, 'phone_sync_auth_heading')}</div>
        <p className="set-data-section-desc">{t(messages, 'phone_sync_auth_body')}</p>
        <p className="set-data-section-desc">{t(messages, 'phone_sync_auth_hint')}</p>

        <CopyRow
          label={t(messages, 'phone_sync_server_label')}
          value={serverUrl}
          copyAria={t(messages, 'phone_sync_copy_server_aria')}
        />
        <CopyRow
          label={t(messages, 'phone_sync_username_label')}
          value={email}
          copyAria={t(messages, 'phone_sync_copy_username_aria')}
        />

        <div className="sync-family-block">
          <div className="sync-family-title">{t(messages, 'phone_sync_available_heading')}</div>
          <div className="set-data-section-desc">{t(messages, 'phone_sync_available_body')}</div>
        </div>

        <div className="sync-health-panel">
          <div className="sync-section-heading">{t(messages, 'phone_sync_health_heading')}</div>
          <p className="set-data-section-desc">{t(messages, 'phone_sync_health_body')}</p>
          {createdToken && (
            <div className="set-token-banner sync-health-token-banner">
              <div className="set-token-banner-header">
                <Check size={16} className="set-token-banner-icon" aria-hidden="true" />
                <span className="set-token-banner-title">{t(messages, 'phone_sync_token_ready')}</span>
              </div>
              <p className="set-token-banner-warning">{t(messages, 'token_created_warning')}</p>
              <code className="token-display">{createdToken}</code>
            </div>
          )}
          {loadingTokens && <p className="set-data-section-desc">{t(messages, 'loading')}</p>}
          {tokenError && <div className="sync-health-error">{t(messages, 'phone_sync_health_error')}</div>}
          {!loadingTokens && !tokenError && davTokens.length === 0 && (
            <div className="sync-health-empty">{t(messages, 'phone_sync_health_empty')}</div>
          )}
          <div className="sync-health-list">
            {davTokens.map(token => (
              <HealthCard
                key={token.id}
                token={token}
                messages={messages}
                lang={lang}
                onRenew={handleRenew}
                onRevoke={handleRevoke}
              />
            ))}
          </div>
        </div>

        <div className="sync-section-heading">{t(messages, 'phone_sync_ios_heading')}</div>
        <ol className="sync-steps">
          <li>{t(messages, 'phone_sync_ios_step1')}</li>
          <li>{t(messages, 'phone_sync_ios_step2')}</li>
          <li>{t(messages, 'phone_sync_ios_step3')}</li>
          <li>{t(messages, 'phone_sync_ios_step4')}</li>
        </ol>

        <div className="sync-section-heading">{t(messages, 'phone_sync_android_heading')}</div>
        <p className="set-data-section-desc">
          {t(messages, 'phone_sync_android_body')}
          {' '}
          <a
            className="sync-external-link"
            href="https://www.davx5.com/"
            target="_blank"
            rel="noopener noreferrer"
          >
            davx5.com <ExternalLink size={10} />
          </a>
        </p>
        <ol className="sync-steps">
          <li>{t(messages, 'phone_sync_android_step1')}</li>
          <li>{t(messages, 'phone_sync_android_step2')}</li>
          <li>{t(messages, 'phone_sync_android_step3')}</li>
        </ol>

        <div className="sync-section-heading">{t(messages, 'phone_sync_coexist_heading')}</div>
        <p className="set-data-section-desc">{t(messages, 'phone_sync_coexist_intro')}</p>
        <ul className="sync-steps sync-coexist">
          <li>{t(messages, 'phone_sync_coexist_apple')}</li>
          <li>{t(messages, 'phone_sync_coexist_google')}</li>
          <li>{t(messages, 'phone_sync_coexist_outlook')}</li>
        </ul>

        <div className="sync-section-heading">{t(messages, 'phone_sync_limits_heading')}</div>
        <ul className="sync-steps sync-limits">
          <li>{t(messages, 'phone_sync_limit_incremental')}</li>
          <li>{t(messages, 'phone_sync_limit_fields')}</li>
        </ul>
      </div>
    </div>
  );
}
