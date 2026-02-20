import { useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';

export default function Home() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [familyName, setFamilyName] = useState('');
  const [token, setToken] = useState('');
  const [msg, setMsg] = useState('');

  async function register(e) {
    e.preventDefault();
    setMsg('');
    const res = await fetch(`${API}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, display_name: displayName, family_name: familyName }),
    });
    const data = await res.json();
    if (!res.ok) return setMsg(data.detail || 'Register fehlgeschlagen');
    setToken(data.access_token);
    setMsg('Registrierung erfolgreich');
  }

  async function login(e) {
    e.preventDefault();
    setMsg('');
    const res = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) return setMsg(data.detail || 'Login fehlgeschlagen');
    setToken(data.access_token);
    setMsg('Login erfolgreich');
  }

  return (
    <main style={{ fontFamily: 'Inter, sans-serif', maxWidth: 900, margin: '40px auto', padding: '0 16px' }}>
      <h1>Tribu</h1>
      <p>Dein Familien Organizer gegen Alltagschaos.</p>

      <section style={{ marginTop: 24, padding: 16, border: '1px solid #ddd', borderRadius: 8 }}>
        <h2>Auth Test</h2>
        <form onSubmit={register} style={{ display: 'grid', gap: 8, maxWidth: 420 }}>
          <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <input type="password" placeholder="Passwort" value={password} onChange={(e) => setPassword(e.target.value)} required />
          <input placeholder="Dein Name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
          <input placeholder="Familienname" value={familyName} onChange={(e) => setFamilyName(e.target.value)} required />
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit">Registrieren</button>
            <button type="button" onClick={login}>Login</button>
          </div>
        </form>
        {msg && <p style={{ marginTop: 10 }}>{msg}</p>}
        {token && <p style={{ marginTop: 10, wordBreak: 'break-all' }}><strong>Token:</strong> {token}</p>}
      </section>

      <section style={{ marginTop: 24 }}>
        <h2>Dokumentation</h2>
        <ul>
          <li>docs/ARCHITECTURE.md</li>
          <li>docs/ROADMAP.md</li>
          <li>docs/CHANGELOG.md</li>
        </ul>
      </section>
    </main>
  );
}
