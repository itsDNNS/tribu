import { useState } from 'react';
import { ShieldCheck, Users, Play, Globe } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { errorText } from '../lib/helpers';
import { t } from '../lib/i18n';
import * as api from '../lib/api';

export default function AuthPage() {
  const { messages, setLoggedIn, enterDemo, lang, setLang, availableLanguages } = useApp();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [familyName, setFamilyName] = useState('');
  const [authMode, setAuthMode] = useState('login');
  const [msg, setMsg] = useState('');

  async function login(e) {
    e.preventDefault();
    setMsg('');
    const { ok, data } = await api.apiLogin(email, password);
    if (!ok) return setMsg(errorText(data?.detail, 'Login failed'));
    setLoggedIn(true);
  }

  async function register(e) {
    e.preventDefault();
    setMsg('');
    const { ok, data } = await api.apiRegister(email, password, displayName, familyName);
    if (!ok) return setMsg(errorText(data?.detail, 'Registration failed'));
    setLoggedIn(true);
  }

  return (
    <div className="auth-page">
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
      <div className="auth-container">
        <div className="auth-brand">
          <div className="auth-logo">
            <Users size={32} color="white" aria-hidden="true" />
          </div>
          <h1>Tribu</h1>
          <p>{t(messages, 'tagline')}</p>
        </div>

        <div className="auth-card glass glow-purple">
          <div className="auth-tabs" role="tablist" aria-label={t(messages, 'aria.auth_mode')}>
            <button
              className={`auth-tab${authMode === 'login' ? ' active' : ''}`}
              onClick={() => setAuthMode('login')}
              role="tab"
              id="tab-login"
              aria-selected={authMode === 'login'}
              aria-controls="panel-login"
            >
              {t(messages, 'auth_login')}
            </button>
            <button
              className={`auth-tab${authMode === 'register' ? ' active' : ''}`}
              onClick={() => setAuthMode('register')}
              role="tab"
              id="tab-register"
              aria-selected={authMode === 'register'}
              aria-controls="panel-register"
            >
              {t(messages, 'auth_register')}
            </button>
          </div>

          {authMode === 'login' ? (
            <div role="tabpanel" id="panel-login" aria-labelledby="tab-login">
              <form onSubmit={login} className="auth-form">
                <div className="form-field">
                  <label htmlFor="login-email">{t(messages, 'email')}</label>
                  <input id="login-email" className="form-input" type="email" placeholder="name@family.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
                </div>
                <div className="form-field">
                  <label htmlFor="login-password">{t(messages, 'password')}</label>
                  <input id="login-password" className="form-input" type="password" placeholder={t(messages, 'password')} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} maxLength={128} />
                </div>
                <button className="btn-primary" type="submit">{t(messages, 'login')}</button>
              </form>
            </div>
          ) : (
            <div role="tabpanel" id="panel-register" aria-labelledby="tab-register">
              <form onSubmit={register} className="auth-form">
                <div className="form-field">
                  <label htmlFor="register-email">{t(messages, 'email')}</label>
                  <input id="register-email" className="form-input" type="email" placeholder="name@family.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
                </div>
                <div className="form-field">
                  <label htmlFor="register-password">{t(messages, 'password')}</label>
                  <input id="register-password" className="form-input" type="password" placeholder={t(messages, 'password')} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} maxLength={128} />
                  <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{t(messages, 'password_hint')}</small>
                </div>
                <div className="form-field">
                  <label htmlFor="register-name">{t(messages, 'your_name')}</label>
                  <input id="register-name" className="form-input" type="text" placeholder={t(messages, 'name_placeholder')} value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
                </div>
                <div className="form-field">
                  <label htmlFor="register-family">{t(messages, 'family_name')}</label>
                  <input id="register-family" className="form-input" type="text" placeholder={t(messages, 'setup_family_placeholder')} value={familyName} onChange={(e) => setFamilyName(e.target.value)} required />
                </div>
                <button className="btn-primary" type="submit">{t(messages, 'register')}</button>
              </form>
            </div>
          )}

          <div className="auth-divider">{t(messages, 'auth_selfhosted')}</div>

          {msg && <p role="alert" style={{ marginTop: 12, fontSize: '0.88rem', color: 'var(--danger)' }}>{msg}</p>}

          <button className="btn-demo" type="button" onClick={enterDemo}>
            <Play size={15} aria-hidden="true" />
            {t(messages, 'demo_try')}
          </button>
        </div>

        <div className="auth-footer">
          <ShieldCheck size={14} aria-hidden="true" />
          {t(messages, 'auth_footer')}
        </div>
      </div>
    </div>
  );
}
