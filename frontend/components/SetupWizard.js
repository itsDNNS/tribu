import { useCallback, useRef, useState } from 'react';
import { Users, ShieldCheck, Upload, CheckCircle, Globe, AlertCircle } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { errorText } from '../lib/helpers';
import { t } from '../lib/i18n';
import { listThemes } from '../lib/themes';
import { listLanguages } from '../lib/i18n';
import * as api from '../lib/api';

const STEPS_FRESH = ['welcome', 'admin', 'family', 'prefs', 'done'];
const STEPS_RESTORE = ['welcome', 'restore'];

export default function SetupWizard() {
  const {
    messages, setLoggedIn, setNeedsSetup,
    theme, setTheme, lang, setLang,
    availableThemes, availableLanguages,
  } = useApp();

  const [step, setStep] = useState(0);
  const [path, setPath] = useState(null); // 'fresh' or 'restore'
  const [msg, setMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Admin fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');

  // Family field
  const [familyName, setFamilyName] = useState('');

  // Restore
  const [restoreFile, setRestoreFile] = useState(null);
  const [restoreMeta, setRestoreMeta] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  const steps = path === 'restore' ? STEPS_RESTORE : STEPS_FRESH;
  const currentStep = steps[step];

  const choosePath = (p) => {
    setPath(p);
    setStep(1);
    setMsg('');
  };

  const nextStep = () => {
    setMsg('');
    setStep((s) => Math.min(s + 1, steps.length - 1));
  };

  // --- Restore ---
  const handleFile = (file) => {
    if (!file) return;
    if (!file.name.endsWith('.tar.gz')) {
      setMsg(t(messages, 'setup_restore_invalid_file'));
      return;
    }
    setRestoreFile(file);
    setMsg('');
  };

  const onDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    handleFile(e.dataTransfer.files[0]);
  }, [messages]);

  const handleRestore = async () => {
    if (!restoreFile) return;
    setSubmitting(true);
    setMsg('');
    const { ok, data } = await api.apiRestoreBackup(restoreFile);
    setSubmitting(false);
    if (!ok) return setMsg(errorText(data?.detail, t(messages, 'setup_restore_failed')));
    setRestoreMeta(data);
  };

  // --- Register ---
  const handleRegister = async (e) => {
    e.preventDefault();
    setMsg('');
    setSubmitting(true);
    const { ok, data } = await api.apiRegister(email, password, displayName, familyName);
    setSubmitting(false);
    if (!ok) return setMsg(errorText(data?.detail, t(messages, 'setup_admin_failed')));
    nextStep();
  };

  // --- Done ---
  const finish = () => {
    setNeedsSetup(false);
    setLoggedIn(true);
  };

  const finishRestore = () => {
    setNeedsSetup(false);
  };

  // --- Language toggle (top-right corner) ---
  const langToggle = (
    <div className="setup-lang-toggle">
      <Globe size={14} />
      <select
        value={lang}
        onChange={(e) => setLang(e.target.value)}
        aria-label={t(messages, 'language')}
      >
        {availableLanguages.map((l) => (
          <option key={l.key} value={l.key}>{l.key.toUpperCase()}</option>
        ))}
      </select>
    </div>
  );

  // --- Step indicator dots ---
  const dots = (
    <div className="setup-steps">
      {steps.map((_, i) => (
        <div key={i} className={`setup-dot${i === step ? ' active' : ''}${i < step ? ' done' : ''}`} />
      ))}
    </div>
  );

  return (
    <div className="auth-page">
      {langToggle}
      <div className="auth-container">
        <div className="auth-brand">
          <div className="auth-logo">
            <Users size={32} color="white" aria-hidden="true" />
          </div>
          <h1>Tribu</h1>
          <p>{t(messages, 'tagline')}</p>
        </div>

        <div className="auth-card glass glow-purple">
          {dots}

          {/* Step 0: Welcome */}
          {currentStep === 'welcome' && (
            <div style={{ textAlign: 'center' }}>
              <h2 style={{ margin: '0 0 8px', fontSize: '1.3rem' }}>{t(messages, 'setup_welcome_title')}</h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: 24 }}>
                {t(messages, 'setup_welcome_desc')}
              </p>
              <div style={{ display: 'grid', gap: 12 }}>
                <button className="btn-primary" onClick={() => choosePath('fresh')}>
                  {t(messages, 'setup_welcome_fresh')}
                </button>
                <button className="btn-secondary" onClick={() => choosePath('restore')}>
                  <Upload size={16} style={{ marginRight: 8, verticalAlign: '-3px' }} />
                  {t(messages, 'setup_welcome_restore')}
                </button>
              </div>
            </div>
          )}

          {/* Restore step */}
          {currentStep === 'restore' && !restoreMeta && (
            <div>
              <h2 style={{ textAlign: 'center', margin: '0 0 16px', fontSize: '1.2rem' }}>
                {t(messages, 'setup_restore_title')}
              </h2>
              <div
                className={`setup-upload-zone${dragOver ? ' drag-over' : ''}`}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                onClick={() => fileInputRef.current?.click()}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
              >
                <Upload size={32} style={{ color: 'var(--text-muted)', marginBottom: 8 }} />
                <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                  {t(messages, 'setup_restore_drop')}
                </p>
                <small style={{ color: 'var(--text-muted)' }}>.tar.gz</small>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".tar.gz,.gz"
                  style={{ display: 'none' }}
                  onChange={(e) => handleFile(e.target.files[0])}
                />
              </div>
              {restoreFile && (
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: 8 }}>
                  {restoreFile.name} ({(restoreFile.size / 1024).toFixed(0)} KB)
                </p>
              )}
              <button
                className="btn-primary"
                style={{ width: '100%', marginTop: 16 }}
                disabled={!restoreFile || submitting}
                onClick={handleRestore}
              >
                {submitting ? t(messages, 'setup_restore_restoring') : t(messages, 'setup_restore_start')}
              </button>
              <button
                className="btn-link"
                style={{ marginTop: 8, width: '100%' }}
                onClick={() => { setStep(0); setPath(null); setRestoreFile(null); setMsg(''); }}
              >
                {t(messages, 'setup_back')}
              </button>
            </div>
          )}

          {/* Restore success */}
          {currentStep === 'restore' && restoreMeta && (
            <div style={{ textAlign: 'center' }}>
              <CheckCircle size={48} style={{ color: 'var(--success)', marginBottom: 12 }} />
              <h2 style={{ margin: '0 0 8px', fontSize: '1.2rem' }}>{t(messages, 'setup_restore_success')}</h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: 16 }}>
                {restoreMeta.created_at && t(messages, 'setup_restore_date').replace('{date}', new Date(restoreMeta.created_at).toLocaleDateString())}
              </p>
              <button className="btn-primary" style={{ width: '100%' }} onClick={finishRestore}>
                {t(messages, 'setup_restore_login')}
              </button>
            </div>
          )}

          {/* Create Admin */}
          {currentStep === 'admin' && (
            <div>
              <h2 style={{ textAlign: 'center', margin: '0 0 16px', fontSize: '1.2rem' }}>
                {t(messages, 'setup_admin_title')}
              </h2>
              <form onSubmit={(e) => { e.preventDefault(); nextStep(); }} className="auth-form">
                <div className="form-field">
                  <label htmlFor="setup-email">{t(messages, 'email')}</label>
                  <input id="setup-email" className="form-input" type="email" placeholder="name@family.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
                </div>
                <div className="form-field">
                  <label htmlFor="setup-password">{t(messages, 'password')}</label>
                  <input id="setup-password" className="form-input" type="password" placeholder={t(messages, 'password')} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} maxLength={128} />
                  <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{t(messages, 'password_hint')}</small>
                </div>
                <div className="form-field">
                  <label htmlFor="setup-name">{t(messages, 'your_name')}</label>
                  <input id="setup-name" className="form-input" type="text" placeholder="Dennis" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
                </div>
                <button className="btn-primary" type="submit">{t(messages, 'setup_admin_next')}</button>
              </form>
            </div>
          )}

          {/* Create Family */}
          {currentStep === 'family' && (
            <div>
              <h2 style={{ textAlign: 'center', margin: '0 0 16px', fontSize: '1.2rem' }}>
                {t(messages, 'setup_family_title')}
              </h2>
              <form onSubmit={handleRegister} className="auth-form">
                <div className="form-field">
                  <label htmlFor="setup-family">{t(messages, 'family_name')}</label>
                  <input id="setup-family" className="form-input" type="text" placeholder={t(messages, 'setup_family_placeholder')} value={familyName} onChange={(e) => setFamilyName(e.target.value)} required />
                </div>
                <button className="btn-primary" type="submit" disabled={submitting}>
                  {t(messages, 'setup_family_create')}
                </button>
              </form>
            </div>
          )}

          {/* Preferences */}
          {currentStep === 'prefs' && (
            <div>
              <h2 style={{ textAlign: 'center', margin: '0 0 16px', fontSize: '1.2rem' }}>
                {t(messages, 'setup_prefs_title')}
              </h2>
              <div className="form-field" style={{ marginBottom: 16 }}>
                <label>{t(messages, 'theme')}</label>
                <div className="setup-theme-grid">
                  {availableThemes.map((th) => (
                    <button
                      key={th.id}
                      className={`setup-theme-card${theme === th.id ? ' active' : ''}`}
                      onClick={() => setTheme(th.id)}
                      type="button"
                    >
                      <div className="setup-theme-preview" style={{ background: th.tokens?.['--void'] || '#fff', borderColor: th.tokens?.['--amethyst'] || '#7c3aed' }} />
                      <span>{th.name}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="form-field" style={{ marginBottom: 20 }}>
                <label>{t(messages, 'language')}</label>
                <select
                  className="form-input"
                  value={lang}
                  onChange={(e) => setLang(e.target.value)}
                >
                  {availableLanguages.map((l) => (
                    <option key={l.key} value={l.key}>{l.name}</option>
                  ))}
                </select>
              </div>
              <button className="btn-primary" style={{ width: '100%' }} onClick={nextStep}>
                {t(messages, 'setup_prefs_next')}
              </button>
              <button className="btn-link" style={{ width: '100%', marginTop: 8 }} onClick={nextStep}>
                {t(messages, 'setup_prefs_skip')}
              </button>
            </div>
          )}

          {/* Done */}
          {currentStep === 'done' && (
            <div style={{ textAlign: 'center' }}>
              <CheckCircle size={48} style={{ color: 'var(--success)', marginBottom: 12 }} />
              <h2 style={{ margin: '0 0 8px', fontSize: '1.3rem' }}>{t(messages, 'setup_done_title')}</h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: 24 }}>
                {t(messages, 'setup_done_desc')}
              </p>
              <button className="btn-primary" style={{ width: '100%' }} onClick={finish}>
                {t(messages, 'setup_done_go')}
              </button>
            </div>
          )}

          {msg && (
            <p role="alert" style={{ marginTop: 12, fontSize: '0.88rem', color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <AlertCircle size={16} /> {msg}
            </p>
          )}
        </div>

        <div className="auth-footer">
          <ShieldCheck size={14} aria-hidden="true" />
          {t(messages, 'auth_footer')}
        </div>
      </div>
    </div>
  );
}
