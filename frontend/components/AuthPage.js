import { useState } from 'react';
import { ShieldCheck, Users, Play } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { errorText } from '../lib/helpers';
import { t } from '../lib/i18n';
import * as api from '../lib/api';

export default function AuthPage() {
  const { messages, setLoggedIn, enterDemo } = useApp();

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
      <div className="auth-container">
        <div className="auth-brand">
          <div className="auth-logo">
            <Users size={32} color="white" />
          </div>
          <h1>Tribu</h1>
          <p>{t(messages, 'tagline')}</p>
        </div>

        <div className="auth-card glass glow-purple">
          <div className="auth-tabs">
            <button
              className={`auth-tab${authMode === 'login' ? ' active' : ''}`}
              onClick={() => setAuthMode('login')}
            >
              {t(messages, 'auth_login')}
            </button>
            <button
              className={`auth-tab${authMode === 'register' ? ' active' : ''}`}
              onClick={() => setAuthMode('register')}
            >
              {t(messages, 'auth_register')}
            </button>
          </div>

          {authMode === 'login' ? (
            <form onSubmit={login} className="auth-form">
              <div className="form-field">
                <label>{t(messages, 'email')}</label>
                <input className="form-input" type="email" placeholder="name@family.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div className="form-field">
                <label>{t(messages, 'password')}</label>
                <input className="form-input" type="password" placeholder={t(messages, 'password')} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} maxLength={128} />
              </div>
              <button className="btn-primary" type="submit">{t(messages, 'login')}</button>
            </form>
          ) : (
            <form onSubmit={register} className="auth-form">
              <div className="form-field">
                <label>{t(messages, 'email')}</label>
                <input className="form-input" type="email" placeholder="name@family.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div className="form-field">
                <label>{t(messages, 'password')}</label>
                <input className="form-input" type="password" placeholder={t(messages, 'password')} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} maxLength={128} />
                <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{t(messages, 'password_hint')}</small>
              </div>
              <div className="form-field">
                <label>{t(messages, 'your_name')}</label>
                <input className="form-input" type="text" placeholder="Dennis" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
              </div>
              <div className="form-field">
                <label>{t(messages, 'family_name')}</label>
                <input className="form-input" type="text" placeholder="Müller Family" value={familyName} onChange={(e) => setFamilyName(e.target.value)} required />
              </div>
              <button className="btn-primary" type="submit">{t(messages, 'register')}</button>
            </form>
          )}

          <div className="auth-divider">{t(messages, 'auth_selfhosted')}</div>

          {msg && <p style={{ marginTop: 12, fontSize: '0.88rem', color: 'var(--danger)' }}>{msg}</p>}

          <button className="btn-demo" type="button" onClick={enterDemo}>
            <Play size={15} />
            {t(messages, 'demo_try')}
          </button>
        </div>

        <div className="auth-footer">
          <ShieldCheck size={14} />
          {t(messages, 'auth_footer')}
        </div>
      </div>
    </div>
  );
}
