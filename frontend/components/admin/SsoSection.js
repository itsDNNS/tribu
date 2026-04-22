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
  // Use the backend's computed callback URL. Deriving from
  // window.location.origin would diverge from the real redirect_uri
  // Tribu sends to the IdP whenever BASE_URL env or x-forwarded
  // headers are in play.
  const redirectUri = cfg.effective_callback_url || '';

  return (
    <form className="settings-section sso-section" onSubmit={handleSave} data-testid="sso-admin-section">
      <div className="admin-section-header">
        <KeyRound size={16} />
        <h2>{t(messages, 'sso.title')}</h2>
      </div>
      <p className="adm-form-desc">{t(messages, 'sso.desc')}</p>

      <div className="sso-checkbox-field">
        <label className="set-checkbox-label">
          <input
            type="checkbox"
            checked={!!cfg.enabled}
            onChange={(e) => update('enabled', e.target.checked)}
            data-testid="sso-enabled-toggle"
          />
          {t(messages, 'sso.enabled')}
        </label>
      </div>

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
        <small className="sso-hint">{t(messages, 'sso.preset_hint')}</small>
        {selectedPreset?.hint && (
          <small className="sso-hint">{selectedPreset.hint}</small>
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
          <div className="sso-secret-actions">
            <small className="sso-hint">{t(messages, 'sso.client_secret_set')}</small>
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
          <small className="sso-hint sso-hint-warning">{t(messages, 'sso.client_secret_clear')}</small>
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
        <small className="sso-hint">{t(messages, 'sso.button_label_hint')}</small>
      </div>

      <div className="form-field">
        <label>{t(messages, 'sso.scopes')}</label>
        <input
          className="form-input"
          type="text"
          value={cfg.scopes || ''}
          onChange={(e) => update('scopes', e.target.value)}
        />
        <small className="sso-hint">{t(messages, 'sso.scopes_hint')}</small>
      </div>

      <div className="sso-checkbox-field">
        <label className="set-checkbox-label">
          <input
            type="checkbox"
            checked={!!cfg.allow_signup}
            onChange={(e) => update('allow_signup', e.target.checked)}
          />
          {t(messages, 'sso.allow_signup')}
        </label>
        <small className="sso-hint">{t(messages, 'sso.allow_signup_hint')}</small>
      </div>

      <div className="sso-checkbox-field">
        <label className="set-checkbox-label">
          <input
            type="checkbox"
            checked={!!cfg.disable_password_login}
            onChange={(e) => update('disable_password_login', e.target.checked)}
          />
          {t(messages, 'sso.disable_password_login')}
        </label>
        <small className="sso-hint">{t(messages, 'sso.disable_password_login_hint')}</small>
      </div>

      {redirectUri && (
        <div className="sso-callback-box" data-testid="sso-callback-hint">
          <small className="sso-hint">
            {t(messages, 'sso.redirect_uri_hint').replace('{url}', redirectUri)}
          </small>
        </div>
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
