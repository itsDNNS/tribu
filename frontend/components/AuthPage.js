import { useState } from 'react';
import { useApp } from '../contexts/AppContext';
import { errorText } from '../lib/helpers';
import { t } from '../lib/i18n';
import { styles } from '../lib/styles';
import * as api from '../lib/api';

export default function AuthPage() {
  const { ui, messages, setLoggedIn } = useApp();

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
    if (!ok) return setMsg(errorText(data?.detail, 'Login fehlgeschlagen'));
    setLoggedIn(true);
  }

  async function register(e) {
    e.preventDefault();
    setMsg('');
    const { ok, data } = await api.apiRegister(email, password, displayName, familyName);
    if (!ok) return setMsg(errorText(data?.detail, 'Register fehlgeschlagen'));
    setLoggedIn(true);
    setMsg('Registrierung erfolgreich');
  }

  return (
    <main style={{ ...styles.page, background: '#f5f7fb' }}>
      <div style={styles.hero}><h1 style={{ margin: 0 }}>{t(messages, 'app_name')}</h1><p style={{ marginTop: 8 }}>{t(messages, 'tagline')}</p></div>
      <section style={styles.cardNarrow}>
        <h2>{authMode === 'login' ? t(messages, 'auth_login') : t(messages, 'auth_register')}</h2>
        {authMode === 'login' ? (
          <form onSubmit={login} style={styles.formGrid}>
            <input style={ui.input} placeholder={t(messages, 'email')} value={email} onChange={(e) => setEmail(e.target.value)} required />
            <input style={ui.input} type="password" placeholder={t(messages, 'password')} value={password} onChange={(e) => setPassword(e.target.value)} required />
            <button style={{ ...ui.primaryBtn, minHeight: 46, width: '100%' }} type="submit">{t(messages, 'login')}</button>
          </form>
        ) : (
          <form onSubmit={register} style={styles.formGrid}>
            <input style={ui.input} placeholder={t(messages, 'email')} value={email} onChange={(e) => setEmail(e.target.value)} required />
            <input style={ui.input} type="password" placeholder={t(messages, 'password')} value={password} onChange={(e) => setPassword(e.target.value)} required />
            <input style={ui.input} placeholder={t(messages, 'your_name')} value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
            <input style={ui.input} placeholder={t(messages, 'family_name')} value={familyName} onChange={(e) => setFamilyName(e.target.value)} required />
            <button style={{ ...ui.primaryBtn, minHeight: 46, width: '100%' }} type="submit">{t(messages, 'register')}</button>
          </form>
        )}
        <button style={{ ...ui.secondaryBtn, marginTop: 8, minHeight: 44, width: '100%' }} onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}>
          {authMode === 'login' ? t(messages, 'switch_to_register') : t(messages, 'switch_to_login')}
        </button>
        {msg && <p>{msg}</p>}
      </section>
    </main>
  );
}
