import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { Users, ShieldCheck, AlertCircle, Globe, KeyRound } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { errorText } from '../../lib/helpers';
import { t } from '../../lib/i18n';
import { apiGetInviteInfo, apiRegisterWithInvite, apiGetOidcPublicConfig } from '../../lib/api';

export default function InvitePage() {
  const router = useRouter();
  const { token } = router.query;
  const { messages, setLoggedIn, lang, setLang, availableLanguages } = useApp();

  const [loading, setLoading] = useState(true);
  const [info, setInfo] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [msg, setMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sso, setSso] = useState({ enabled: false, ready: false, button_label: '', password_login_disabled: false });

  useEffect(() => {
    if (!router.isReady) return;
    if (!token) { setLoading(false); return; }
    Promise.all([
      apiGetInviteInfo(token),
      apiGetOidcPublicConfig(),
    ]).then(([invRes, ssoRes]) => {
      if (invRes.ok) setInfo(invRes.data);
      if (ssoRes.ok && ssoRes.data) setSso(ssoRes.data);
      setLoading(false);
    });
  }, [router.isReady, token]);

  async function handleRegister(e) {
    e.preventDefault();
    setMsg('');
    setSubmitting(true);
    const { ok, data } = await apiRegisterWithInvite({
      token,
      email,
      password,
      display_name: displayName,
    });
    setSubmitting(false);
    if (!ok) return setMsg(errorText(data?.detail, t(messages, 'toast.registration_failed'), messages));
    setLoggedIn(true);
    router.push('/');
  }

  if (loading) {
    return (
      <div className="auth-page">
        <div className="auth-container">
          <div className="auth-brand">
            <div className="auth-logo"><Users size={32} color="white" aria-hidden="true" /></div>
            <h1>Tribu</h1>
          </div>
        </div>
      </div>
    );
  }

  if (!info || !info.valid) {
    return (
      <div className="auth-page">
        <div className="auth-container">
          <div className="auth-brand">
            <div className="auth-logo"><Users size={32} color="white" aria-hidden="true" /></div>
            <h1>Tribu</h1>
          </div>
          <div className="auth-card glass glow-purple" style={{ textAlign: 'center' }}>
            <AlertCircle size={48} style={{ color: 'var(--danger)', marginBottom: 12 }} />
            <p style={{ marginBottom: 16 }}>{t(messages, 'invite_page_invalid')}</p>
            <a href="/" className="btn-primary" style={{ display: 'inline-block', textDecoration: 'none' }}>
              {t(messages, 'invite_page_back')}
            </a>
          </div>
        </div>
      </div>
    );
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
          <div className="auth-logo"><Users size={32} color="white" aria-hidden="true" /></div>
          <h1>Tribu</h1>
          <p>{t(messages, 'tagline')}</p>
        </div>

        <div className="auth-card glass glow-purple">
          <div style={{ textAlign: 'center', marginBottom: 16 }}>
            <small style={{ color: 'var(--text-muted)' }}>{t(messages, 'invite_page_joining')}</small>
            <h2 style={{ margin: '4px 0 0', fontSize: '1.3rem' }}>{info.family_name}</h2>
          </div>

          {sso.ready && (
            <>
              <div className="sso-login-box" style={{ marginBottom: 12 }}>
                <a
                  className="btn-primary sso-login-btn"
                  href={`/auth/oidc/login?invite=${encodeURIComponent(String(token || ''))}`}
                  data-testid="sso-invite-button"
                >
                  <KeyRound size={15} aria-hidden="true" />
                  {sso.button_label || t(messages, 'invite_page_register')}
                </a>
              </div>
              {!sso.password_login_disabled && <div className="auth-divider">{t(messages, 'auth_selfhosted')}</div>}
            </>
          )}

          {!sso.password_login_disabled && (
          <form onSubmit={handleRegister} className="auth-form">
            <div className="form-field">
              <label htmlFor="invite-email">{t(messages, 'email')}</label>
              <input id="invite-email" className="form-input" type="email" placeholder="name@family.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="form-field">
              <label htmlFor="invite-password">{t(messages, 'password')}</label>
              <input id="invite-password" className="form-input" type="password" placeholder={t(messages, 'password')} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} maxLength={128} />
              <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{t(messages, 'password_hint')}</small>
            </div>
            <div className="form-field">
              <label htmlFor="invite-name">{t(messages, 'your_name')}</label>
              <input id="invite-name" className="form-input" type="text" placeholder={t(messages, 'name_placeholder')} value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
            </div>
            <button className="btn-primary" type="submit" disabled={submitting}>
              {t(messages, 'invite_page_register')}
            </button>
          </form>
          )}

          <div className="auth-divider">{t(messages, 'auth_selfhosted')}</div>

          {msg && <p role="alert" style={{ marginTop: 12, fontSize: '0.88rem', color: 'var(--danger)' }}>{msg}</p>}
        </div>

        <div className="auth-footer">
          <ShieldCheck size={14} aria-hidden="true" />
          {t(messages, 'auth_footer')}
        </div>
      </div>
    </div>
  );
}
