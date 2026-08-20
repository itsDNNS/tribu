import { useEffect, useState } from 'react';
import { Users, Play, Globe, CalendarDays, CheckSquare, ShoppingCart, Bell, Server, Lock, KeyRound } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { useToast } from '../contexts/ToastContext';
import { errorText } from '../lib/helpers';
import { t } from '../lib/i18n';
import * as api from '../lib/api';

// lucide-react dropped its brand icons in v1, so the GitHub mark is kept
// locally. It is decorative only: the link already carries a visible
// "GitHub" label, so the SVG stays aria-hidden.
function GithubMark({ size = 14 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M12 .5C5.73.5.5 5.73.5 12a11.5 11.5 0 0 0 7.86 10.92c.58.1.79-.25.79-.56v-2.17c-3.2.7-3.88-1.37-3.88-1.37-.53-1.34-1.29-1.7-1.29-1.7-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.56-.29-5.25-1.28-5.25-5.7 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.8 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.12 3.05.74.81 1.18 1.84 1.18 3.1 0 4.43-2.69 5.4-5.26 5.69.41.36.78 1.06.78 2.14v3.17c0 .31.2.67.8.56A11.5 11.5 0 0 0 23.5 12C23.5 5.73 18.27.5 12 .5Z" />
    </svg>
  );
}

// Translate a ?sso_error= tag from the callback redirect into a
// user-facing string. Unknown tags fall back to the generic message
// instead of echoing the raw tag so the page never renders an
// attacker-chosen string verbatim.
function ssoErrorMessage(tag, messages) {
  if (!tag) return '';
  const known = [
    'missing_state', 'invalid_state', 'state_mismatch', 'config_changed',
    'discovery_failed', 'provider_error', 'token_exchange_failed',
    'id_token_invalid', 'oidc_signup_disabled', 'oidc_id_token_invalid',
  ];
  const key = known.includes(tag) ? `sso.error.${tag}` : 'sso.error.generic';
  return t(messages, key);
}

export default function AuthPage() {
  const { messages, setLoggedIn, enterDemo, lang, setLang, availableLanguages } = useApp();
  const { error: toastError } = useToast();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [familyName, setFamilyName] = useState('');
  const [authMode, setAuthMode] = useState('login');
  const [msg, setMsg] = useState('');
  const [sso, setSso] = useState({ enabled: false, ready: false, button_label: '', password_login_disabled: false });
  const [ssoError, setSsoError] = useState('');

  useEffect(() => {
    api.apiGetOidcPublicConfig().then(({ ok, data }) => {
      if (ok && data) setSso(data);
    });
    // Surface ?sso_error=<tag> from the callback redirect once, then
    // scrub it from the URL so a reload does not keep showing it.
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      const tag = url.searchParams.get('sso_error');
      if (tag) {
        const message = ssoErrorMessage(tag, messages);
        setSsoError(message);
        toastError(message);
        url.searchParams.delete('sso_error');
        // Preserve Next.js router state (query cache, scroll position,
        // etc.) by passing the existing history.state back in. Passing
        // `{}` nukes it and can confuse future router.replace calls.
        window.history.replaceState(window.history.state, '', url.pathname + url.search);
      }
    }
    // We intentionally depend only on messages for the toast string;
    // re-running on language switch refreshes the localized label.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

  async function login(e) {
    e.preventDefault();
    setMsg('');
    const { ok, data } = await api.apiLogin(email, password);
    if (!ok) { setMsg(errorText(data?.detail, t(messages, 'toast.login_failed'), messages)); toastError(errorText(data?.detail, t(messages, 'toast.login_failed'), messages)); return; }
    setLoggedIn(true);
  }

  async function register(e) {
    e.preventDefault();
    setMsg('');
    const { ok, data } = await api.apiRegister(email, password, displayName, familyName);
    if (!ok) { setMsg(errorText(data?.detail, t(messages, 'toast.registration_failed'), messages)); toastError(errorText(data?.detail, t(messages, 'toast.registration_failed'), messages)); return; }
    setLoggedIn(true);
  }

  const features = [
    { icon: CalendarDays, title: t(messages, 'landing.feat_calendar'), desc: t(messages, 'landing.feat_calendar_desc'), tone: 'calendar' },
    { icon: CheckSquare, title: t(messages, 'landing.feat_tasks'), desc: t(messages, 'landing.feat_tasks_desc'), tone: 'tasks' },
    { icon: ShoppingCart, title: t(messages, 'landing.feat_shopping'), desc: t(messages, 'landing.feat_shopping_desc'), tone: 'shopping' },
    { icon: Bell, title: t(messages, 'landing.feat_notifications'), desc: t(messages, 'landing.feat_notifications_desc'), tone: 'notifications' },
  ];

  return (
    <div className="landing-page">
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

      {/* Hero */}
      <section className="landing-hero landing-welcome-mat">
        <div className="auth-logo auth-logo--warm">
          <Users size={32} aria-hidden="true" />
        </div>
        <div className="landing-paper-stack" aria-hidden="true">
          <span className="landing-paper-card landing-paper-card--calendar" />
          <span className="landing-paper-card landing-paper-card--tasks" />
          <span className="landing-paper-card landing-paper-card--shopping" />
        </div>
        <h1>{t(messages, 'landing.hero_title')}</h1>
        <p className="landing-hero-subtitle">{t(messages, 'landing.hero_subtitle')}</p>
        <div className="landing-hero-ctas">
          <button className="btn-primary" type="button" onClick={enterDemo}>
            <Play size={16} aria-hidden="true" />
            {t(messages, 'landing.cta_demo')}
          </button>
          <a className="btn-ghost" href="#auth">
            {t(messages, 'landing.cta_login')} ↓
          </a>
        </div>
      </section>

      {/* Features */}
      <section className="landing-features">
        {features.map((f, i) => (
          <div key={i} className={`landing-feature-card landing-feature-card--${f.tone}`} style={{ animationDelay: `${i * 0.1}s` }}>
            <div className="landing-feature-icon">
              <f.icon size={24} aria-hidden="true" />
            </div>
            <h3>{f.title}</h3>
            <p>{f.desc}</p>
          </div>
        ))}
      </section>

      {/* Trust Badges */}
      <section className="landing-trust">
        <div className="landing-trust-badge">
          <Server size={16} aria-hidden="true" />
          {t(messages, 'landing.trust_selfhosted')}
        </div>
        <div className="landing-trust-badge">
          <Lock size={16} aria-hidden="true" />
          {t(messages, 'landing.trust_privacy')}
        </div>
        <div className="landing-trust-badge">
          <Users size={16} aria-hidden="true" />
          {t(messages, 'landing.trust_families')}
        </div>
      </section>

      {/* Auth Section */}
      <section className="landing-auth" id="auth">
        <div className="auth-card auth-card--warm">
          {!(sso.ready && sso.password_login_disabled) && (
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
          )}

          {sso.ready && (
            <div className="sso-login-box">
              <a
                className="btn-primary sso-login-btn"
                href="/auth/oidc/login"
                data-testid="sso-login-button"
              >
                <KeyRound size={15} aria-hidden="true" />
                {sso.button_label || t(messages, 'login')}
              </a>
              {sso.password_login_disabled && (
                <p className="sso-password-disabled-hint" style={{ marginTop: 8, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  {t(messages, 'sso.password_disabled_hint')}
                </p>
              )}
            </div>
          )}

          {sso.ready && !(sso.ready && sso.password_login_disabled) && (
            <div className="auth-divider">{t(messages, 'auth_selfhosted')}</div>
          )}

          {ssoError && (
            <p role="alert" style={{ marginTop: 12, fontSize: '0.88rem', color: 'var(--danger)' }}>{ssoError}</p>
          )}

          {!(sso.ready && sso.password_login_disabled) && (authMode === 'login' ? (
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
          ))}

          {msg && <p role="alert" style={{ marginTop: 12, fontSize: '0.88rem', color: 'var(--danger)' }}>{msg}</p>}

          <div className="auth-divider">{t(messages, 'auth_selfhosted')}</div>

          <button className="btn-demo" type="button" onClick={enterDemo}>
            <Play size={15} aria-hidden="true" />
            {t(messages, 'demo_try')}
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <a href="https://github.com/itsDNNS/tribu" target="_blank" rel="noopener noreferrer" className="landing-footer-link">
          <GithubMark size={14} />
          GitHub
        </a>
        <span className="landing-footer-dot">·</span>
        <span>{t(messages, 'landing.footer_tagline')}</span>
      </footer>
    </div>
  );
}
