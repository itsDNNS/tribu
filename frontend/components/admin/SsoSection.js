import { useEffect, useState, useCallback } from 'react';
import { Check, KeyRound, ShieldCheck, ShieldAlert, PlugZap } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { useToast } from '../../contexts/ToastContext';
import { errorText } from '../../lib/helpers';
import { t } from '../../lib/i18n';
import * as api from '../../lib/api';

// Render this inside the existing AdminView. Gated on demoMode so the
// demo never shows the panel (admin endpoints refuse demo sessions
// anyway, but rendering the form would be visually misleading).
export default function SsoSection() {
  const { messages, demoMode } = useApp();
  const { success: toastSuccess, error: toastError } = useToast();

  const [presets, setPresets] = useState([]);
  const [cfg, setCfg] = useState(null);
  // The client_secret field uses "" to mean "keep existing". The UI
  // clearly marks when a secret is already stored via
  // client_secret_set; explicit-clear goes through the Clear button
  // which sends an empty string with an explicit clear flag.
  const [secretDraft, setSecretDraft] = useState('');
  const [secretClearPending, setSecretClearPending] = useState(false);
  const [testState, setTestState] = useState({ loading: false, result: null });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (demoMode) return;
    const [p, c] = await Promise.all([api.apiGetOidcPresets(), api.apiGetOidcConfig()]);
    if (p.ok) setPresets(p.data);
    if (c.ok) {
      setCfg(c.data);
      setSecretClearPending(false);
      setSecretDraft('');
    }
  }, [demoMode]);

  useEffect(() => { load(); }, [load]);

  if (demoMode || !cfg) return null;

  function update(field, value) {
    setCfg((prev) => ({ ...prev, [field]: value }));
  }

  async function handleTest() {
    setTestState({ loading: true, result: null });
    const { ok, data } = await api.apiTestOidcDiscovery(cfg.issuer || '');
    setTestState({ loading: false, result: { ok: ok && data?.ok, error: data?.error || '' } });
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    const payload = {
      enabled: !!cfg.enabled,
      preset: cfg.preset,
      button_label: cfg.button_label || '',
      issuer: cfg.issuer || '',
      client_id: cfg.client_id || '',
      scopes: cfg.scopes || 'openid profile email',
      allow_signup: !!cfg.allow_signup,
      disable_password_login: !!cfg.disable_password_login,
    };
    if (secretClearPending) {
      payload.client_secret = '';
    } else if (secretDraft) {
      payload.client_secret = secretDraft;
    }
    const { ok, data } = await api.apiUpdateOidcConfig(payload);
    setSaving(false);
    if (!ok) {
      toastError(errorText(data?.detail, t(messages, 'toast.error'), messages));
      return;
    }
    toastSuccess(t(messages, 'sso.saved'));
    setCfg(data);
    setSecretDraft('');
    setSecretClearPending(false);
  }

  const selectedPreset = presets.find((p) => p.id === cfg.preset) || null;
  const redirectUri = typeof window !== 'undefined'
    ? `${window.location.origin}/auth/oidc/callback`
    : '';

  return (
    <form className="settings-section sso-section" onSubmit={handleSave} data-testid="sso-admin-section">
      <div className="admin-section-header">
        <KeyRound size={16} />
        <h2>{t(messages, 'sso.title')}</h2>
      </div>
      <p className="adm-form-desc">{t(messages, 'sso.desc')}</p>

      <label className="set-checkbox-label">
        <input
          type="checkbox"
          checked={!!cfg.enabled}
          onChange={(e) => update('enabled', e.target.checked)}
          data-testid="sso-enabled-toggle"
        />
        {t(messages, 'sso.enabled')}
      </label>

      <div className="form-field">
        <label>{t(messages, 'sso.preset')}</label>
        <select
          className="form-input"
          value={cfg.preset}
          onChange={(e) => update('preset', e.target.value)}
          data-testid="sso-preset-select"
        >
          {presets.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <small>{t(messages, 'sso.preset_hint')}</small>
        {selectedPreset?.hint && (
          <small style={{ display: 'block', marginTop: 4, color: 'var(--text-muted)' }}>
            {selectedPreset.hint}
          </small>
        )}
      </div>

      <div className="form-field">
        <label>{t(messages, 'sso.issuer')}</label>
        <input
          className="form-input"
          type="url"
          value={cfg.issuer || ''}
          placeholder={selectedPreset?.issuer_placeholder || ''}
          onChange={(e) => update('issuer', e.target.value)}
          data-testid="sso-issuer-input"
        />
      </div>

      <div className="form-field">
        <label>{t(messages, 'sso.client_id')}</label>
        <input
          className="form-input"
          type="text"
          value={cfg.client_id || ''}
          onChange={(e) => update('client_id', e.target.value)}
        />
      </div>

      <div className="form-field">
        <label>{t(messages, 'sso.client_secret')}</label>
        <input
          className="form-input"
          type="password"
          value={secretDraft}
          placeholder={cfg.client_secret_set ? '••••••••••' : ''}
          onChange={(e) => { setSecretDraft(e.target.value); setSecretClearPending(false); }}
          autoComplete="off"
        />
        {cfg.client_secret_set && !secretClearPending && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
            <small style={{ color: 'var(--text-muted)' }}>{t(messages, 'sso.client_secret_set')}</small>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => { setSecretClearPending(true); setSecretDraft(''); }}
            >
              {t(messages, 'sso.client_secret_clear')}
            </button>
          </div>
        )}
        {secretClearPending && (
          <small style={{ color: 'var(--warning, #c05621)' }}>{t(messages, 'sso.client_secret_clear')}</small>
        )}
      </div>

      <div className="form-field">
        <label>{t(messages, 'sso.button_label')}</label>
        <input
          className="form-input"
          type="text"
          value={cfg.button_label || ''}
          placeholder={selectedPreset?.button_label || ''}
          onChange={(e) => update('button_label', e.target.value)}
        />
        <small>{t(messages, 'sso.button_label_hint')}</small>
      </div>

      <div className="form-field">
        <label>{t(messages, 'sso.scopes')}</label>
        <input
          className="form-input"
          type="text"
          value={cfg.scopes || ''}
          onChange={(e) => update('scopes', e.target.value)}
        />
        <small>{t(messages, 'sso.scopes_hint')}</small>
      </div>

      <label className="set-checkbox-label">
        <input
          type="checkbox"
          checked={!!cfg.allow_signup}
          onChange={(e) => update('allow_signup', e.target.checked)}
        />
        {t(messages, 'sso.allow_signup')}
      </label>
      <small style={{ display: 'block', marginTop: -6, marginBottom: 8 }}>{t(messages, 'sso.allow_signup_hint')}</small>

      <label className="set-checkbox-label">
        <input
          type="checkbox"
          checked={!!cfg.disable_password_login}
          onChange={(e) => update('disable_password_login', e.target.checked)}
        />
        {t(messages, 'sso.disable_password_login')}
      </label>
      <small style={{ display: 'block', marginTop: -6, marginBottom: 8 }}>{t(messages, 'sso.disable_password_login_hint')}</small>

      {redirectUri && (
        <small style={{ display: 'block', marginTop: 8, marginBottom: 8, color: 'var(--text-muted)' }}>
          {t(messages, 'sso.redirect_uri_hint').replace('{url}', redirectUri)}
        </small>
      )}

      <div className="set-btn-row" style={{ gap: 8 }}>
        <button type="submit" className="btn-primary" disabled={saving}>
          <Check size={14} /> {t(messages, 'sso.save')}
        </button>
        <button
          type="button"
          className="btn-ghost"
          onClick={handleTest}
          disabled={testState.loading || !cfg.issuer}
        >
          <PlugZap size={14} /> {t(messages, 'sso.test')}
        </button>
      </div>

      {testState.result && testState.result.ok && (
        <div className="adm-success-banner" role="status" style={{ marginTop: 12 }}>
          <ShieldCheck size={14} /> {t(messages, 'sso.test_ok')}
        </div>
      )}
      {testState.result && !testState.result.ok && (
        <div className="adm-success-banner" role="alert" style={{ marginTop: 12, background: 'var(--danger-bg, #fee)', color: 'var(--danger)' }}>
          <ShieldAlert size={14} /> {t(messages, 'sso.test_fail').replace('{error}', testState.result.error || 'unknown')}
        </div>
      )}
    </form>
  );
}
