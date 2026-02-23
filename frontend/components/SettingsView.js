import { User, Palette, Globe, ShieldCheck } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { t } from '../lib/i18n';
import * as api from '../lib/api';

const THEME_DESCS = {
  en: { light: 'Warm and inviting', dark: 'Subtle and dark', 'midnight-glass': 'Glassmorphism, deep violet' },
  de: { light: 'Warm und einladend', dark: 'Dezent und dunkel', 'midnight-glass': 'Glassmorphism, tiefes Violett' },
};
const THEME_PREVIEWS = {
  light: { bg: '#f8f6f3', surface: '#ffffff', accent: '#7c3aed' },
  dark: { bg: '#0f172a', surface: '#1e293b', accent: '#7c3aed' },
  'midnight-glass': { bg: '#06080f', surface: '#111628', accent: '#7c3aed' },
};

export default function SettingsView() {
  const { theme, setTheme, lang, setLang, availableThemes, messages, me, isAdmin, loggedIn, setProfileImage } = useApp();

  const initials = (me?.display_name || 'U').charAt(0).toUpperCase();

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
    <div>
      <div className="view-header">
        <div>
          <div className="view-title">{t(messages, 'settings')}</div>
          <div className="view-subtitle">{t(messages, 'settings_subtitle')}</div>
        </div>
      </div>

      <div className="settings-grid stagger">
        {/* Profile Section */}
        <div className="settings-section glass">
          <div className="settings-section-title"><User size={16} /> {t(messages, 'profile')}</div>
          <div className="profile-row">
            <div className="profile-avatar">{initials}</div>
            <div className="profile-info">
              <div className="profile-name">{me?.display_name || 'User'}</div>
              <div className="profile-email">{me?.email || ''}</div>
              <div className="profile-role">{isAdmin ? 'Admin' : t(messages, 'member')}</div>
            </div>
          </div>
          <div style={{ marginTop: 'var(--space-md)' }}>
            <label style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', display: 'block', marginBottom: 'var(--space-sm)' }}>
              {t(messages, 'profile_image')}
            </label>
            <input type="file" accept="image/*" onChange={onProfileImage} style={{ fontSize: '0.88rem' }} />
          </div>
        </div>

        {/* Theme Section */}
        <div className="settings-section glass">
          <div className="settings-section-title"><Palette size={16} /> {t(messages, 'theme')}</div>
          <div className="theme-grid">
            {availableThemes.map((th) => {
              const preview = THEME_PREVIEWS[th.key] || {};
              const isActive = theme === th.key;
              return (
                <div
                  key={th.key}
                  className={`theme-item${isActive ? ' active' : ' theme-item-inactive'}`}
                  onClick={() => setTheme(th.key)}
                >
                  <div
                    className="theme-preview"
                    style={{
                      background: `linear-gradient(135deg, ${preview.bg || '#111'} 50%, ${preview.surface || '#222'} 50%)`,
                      boxShadow: isActive ? `0 0 0 2px ${preview.accent || 'var(--amethyst)'}` : undefined,
                    }}
                  />
                  <div className="theme-item-info">
                    <div className="theme-item-name">{th.name}</div>
                    <div className="theme-item-desc">{(THEME_DESCS[lang] || THEME_DESCS.en)[th.key] || ''}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Language Section */}
        <div className="settings-section glass">
          <div className="settings-section-title"><Globe size={16} /> {t(messages, 'language')}</div>
          <div className="lang-toggle">
            <button className={`lang-btn${lang === 'de' ? ' active' : ''}`} onClick={() => setLang('de')}>Deutsch</button>
            <button className={`lang-btn${lang === 'en' ? ' active' : ''}`} onClick={() => setLang('en')}>English</button>
          </div>
        </div>

        {/* Privacy Section */}
        <div className="settings-section glass">
          <div className="settings-section-title"><ShieldCheck size={16} /> {t(messages, 'privacy')}</div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', lineHeight: 1.6 }}>
            {t(messages, 'privacy_note')}
          </p>
        </div>
      </div>
    </div>
  );
}
