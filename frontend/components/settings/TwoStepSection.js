import { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { useToast } from '../../contexts/ToastContext';
import { copyTextToClipboard, downloadBlob, errorText } from '../../lib/helpers';
import { t } from '../../lib/i18n';
import * as api from '../../lib/api';
import DisplayPairingQr from '../admin/DisplayPairingQr';

const LOW_RECOVERY_CODES = 3;

export default function TwoStepSection() {
  const { messages, demoMode } = useApp();
  const { success: toastSuccess } = useToast();
  const [status, setStatus] = useState(null);
  // idle → password → scan → codes (setup); idle → disable (turning off)
  const [step, setStep] = useState('idle');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [setup, setSetup] = useState(null);
  const [recoveryCodes, setRecoveryCodes] = useState([]);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function loadStatus() {
    const { ok, data } = await api.apiGetMfaStatus();
    if (ok) setStatus(data);
  }

  useEffect(() => {
    if (!demoMode) loadStatus();
  }, [demoMode]);

  if (!status?.available && !status?.enabled) return null;

  function reset(nextStep = 'idle') {
    setStep(nextStep);
    setPassword('');
    setCode('');
    setError('');
  }

  async function submit(call, onSuccess) {
    setBusy(true);
    setError('');
    try {
      const { ok, data } = await call();
      if (!ok) {
        setError(errorText(data?.detail, t(messages, 'toast.error'), messages));
        return;
      }
      await onSuccess(data);
    } catch {
      setError(t(messages, 'toast.error'));
    } finally {
      setBusy(false);
    }
  }

  const startSetup = (e) => {
    e.preventDefault();
    submit(() => api.apiStartMfaSetup(password), (data) => {
      setSetup(data);
      reset('scan');
    });
  };

  const confirmSetup = (e) => {
    e.preventDefault();
    submit(() => api.apiConfirmMfa(setup.setup_token, code), async (data) => {
      setRecoveryCodes(data.recovery_codes);
      setSetup(null);
      setSaved(false);
      reset('codes');
      await loadStatus();
    });
  };

  const finishSetup = () => {
    setRecoveryCodes([]);
    reset();
    toastSuccess(t(messages, 'two_step.enabled_toast'));
  };

  const disable = (e) => {
    e.preventDefault();
    submit(() => api.apiDisableMfa(password, code), async () => {
      reset();
      await loadStatus();
      toastSuccess(t(messages, 'two_step.disabled_toast'));
    });
  };

  function downloadCodes() {
    downloadBlob(new Blob([`${recoveryCodes.join('\n')}\n`], { type: 'text/plain' }), 'tribu-recovery-codes.txt');
  }

  async function copy(value) {
    if (await copyTextToClipboard(value)) toastSuccess(t(messages, 'token_copied'));
  }

  const passwordField = (
    <div className="set-field-group">
      <label className="set-label" htmlFor="two-step-password">{t(messages, 'password')}</label>
      <input
        id="two-step-password"
        className="form-input"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete="current-password"
        required
      />
    </div>
  );

  const codeField = (labelKey) => (
    <div className="set-field-group">
      <label className="set-label" htmlFor="two-step-code">{t(messages, labelKey)}</label>
      <input
        id="two-step-code"
        className="form-input"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        autoComplete="one-time-code"
        spellCheck={false}
        maxLength={32}
        required
      />
    </div>
  );

  const cancelButton = (
    <button type="button" className="btn-secondary" onClick={() => { setSetup(null); reset(); }} disabled={busy}>
      {t(messages, 'cancel')}
    </button>
  );

  return (
    <div className="settings-section" data-testid="two-step-section">
      <div className="settings-section-title">
        <ShieldCheck size={16} /> {t(messages, 'two_step.title')}
        <span className={`two-step-state${status.enabled ? ' on' : ''}`}>
          {t(messages, status.enabled ? 'two_step.on' : 'two_step.off')}
        </span>
      </div>
      <p className="set-section-desc">{t(messages, 'two_step.desc')}</p>

      {step === 'idle' && (
        <div className="set-password-form">
          {status.enabled && (
            <p className="set-field-hint">
              {t(messages, 'two_step.codes_left').replace('{count}', status.recovery_codes_remaining)}
              {status.recovery_codes_remaining <= LOW_RECOVERY_CODES && ` ${t(messages, 'two_step.codes_low')}`}
            </p>
          )}
          <p className="set-field-hint">{t(messages, 'two_step.admin_help')}</p>
          {status.enabled ? (
            <button type="button" className="btn-secondary" onClick={() => reset('disable')}>{t(messages, 'two_step.turn_off')}</button>
          ) : (
            <button type="button" className="btn-primary" onClick={() => reset('password')}>{t(messages, 'two_step.turn_on')}</button>
          )}
        </div>
      )}

      {step === 'password' && (
        <form onSubmit={startSetup} className="set-password-form">
          <p className="set-field-hint">{t(messages, 'two_step.password_prompt')}</p>
          {passwordField}
          {error && <div className="set-password-error" role="alert">{error}</div>}
          <div className="two-step-actions">
            <button type="submit" className="btn-primary" disabled={busy || !password}>{t(messages, 'two_step.continue')}</button>
            {cancelButton}
          </div>
        </form>
      )}

      {step === 'scan' && setup && (
        <form onSubmit={confirmSetup} className="set-password-form">
          <p className="set-field-hint">{t(messages, 'two_step.scan')}</p>
          <DisplayPairingQr value={setup.otpauth_uri} label={t(messages, 'two_step.qr_label')} />
          <p className="set-field-hint">
            {t(messages, 'two_step.manual')} <code className="two-step-secret">{setup.secret.match(/.{1,4}/g).join(' ')}</code>
          </p>
          {/* Setting up in the installed app on the same phone: nothing to scan, so hand the key to the authenticator directly. */}
          <div className="two-step-actions">
            <a className="btn-secondary" href={setup.otpauth_uri}>{t(messages, 'two_step.open_app')}</a>
            <button type="button" className="btn-secondary" onClick={() => copy(setup.secret)}>{t(messages, 'two_step.copy_key')}</button>
          </div>
          {codeField('two_step.code_label')}
          {error && <div className="set-password-error" role="alert">{error}</div>}
          <div className="two-step-actions">
            <button type="submit" className="btn-primary" disabled={busy || !code}>{t(messages, 'two_step.confirm')}</button>
            {cancelButton}
          </div>
        </form>
      )}

      {step === 'codes' && (
        <div className="set-password-form">
          <strong>{t(messages, 'two_step.codes_title')}</strong>
          <p className="set-field-hint">{t(messages, 'two_step.codes_desc')}</p>
          <ul className="two-step-codes" data-testid="two-step-recovery-codes">
            {recoveryCodes.map((item) => <li key={item}><code>{item}</code></li>)}
          </ul>
          <div className="two-step-actions">
            <button type="button" className="btn-secondary" onClick={downloadCodes}>{t(messages, 'two_step.download')}</button>
            <button type="button" className="btn-secondary" onClick={() => copy(recoveryCodes.join('\n'))}>{t(messages, 'two_step.copy_codes')}</button>
          </div>
          <label className="two-step-check">
            <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
            {t(messages, 'two_step.codes_saved')}
          </label>
          <button type="button" className="btn-primary" disabled={!saved} onClick={finishSetup}>{t(messages, 'two_step.done')}</button>
        </div>
      )}

      {step === 'disable' && (
        <form onSubmit={disable} className="set-password-form">
          <p className="set-field-hint">{t(messages, 'two_step.disable_desc')}</p>
          {passwordField}
          {codeField('two_step.code_or_recovery')}
          {error && <div className="set-password-error" role="alert">{error}</div>}
          <div className="two-step-actions">
            <button type="submit" className="btn-primary" disabled={busy || !password || !code}>{t(messages, 'two_step.turn_off')}</button>
            {cancelButton}
          </div>
        </form>
      )}
    </div>
  );
}
