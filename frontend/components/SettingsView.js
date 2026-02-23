import { Moon, Sun, Languages } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { t } from '../lib/i18n';
import * as api from '../lib/api';

export default function SettingsView() {
  const { theme, setTheme, lang, setLang, availableThemes, messages, ui, loggedIn, setProfileImage } = useApp();

  function onProfileImage(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const value = String(reader.result || '');
      setProfileImage(value);
      if (loggedIn) {
        await api.apiUpdateProfileImage(value);
      }
    };
    reader.readAsDataURL(file);
  }

  return (
    <div style={ui.card}>
      <h2>{t(messages, 'settings')}</h2>
      <label style={{ display: 'block', marginBottom: 8 }}>{t(messages, 'theme')}</label>
      <div style={{ display: 'grid', gap: 8 }}>
        <select style={ui.input} value={theme} onChange={(e) => setTheme(e.target.value)}>
          {availableThemes.map((th) => (
            <option key={th.id} value={th.key}>{th.name}</option>
          ))}
        </select>
        <button style={{ ...ui.secondaryBtn, display: 'inline-flex', alignItems: 'center', gap: 8 }} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          {theme === 'dark' ? t(messages, 'switch_to_light') : t(messages, 'switch_to_dark')}
        </button>
      </div>
      <div style={{ marginTop: 14 }}>
        <label style={{ display: 'block', marginBottom: 8 }}>{t(messages, 'language')}</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={ui.secondaryBtn} onClick={() => setLang('de')}><Languages size={16} /> DE</button>
          <button style={ui.secondaryBtn} onClick={() => setLang('en')}><Languages size={16} /> EN</button>
        </div>
      </div>
      <div style={{ marginTop: 14 }}>
        <label>{t(messages, 'profile_image')}</label>
        <input type="file" accept="image/*" onChange={onProfileImage} />
      </div>
    </div>
  );
}
