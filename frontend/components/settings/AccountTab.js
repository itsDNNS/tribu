import { useState } from 'react';
import { User, Palette, Globe, Check } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { t, languageCompleteness } from '../../lib/i18n';
import * as api from '../../lib/api';

const THEME_DESCS = {
  en: { light: 'Warm and inviting', dark: 'Subtle and dark', 'midnight-glass': 'Glassmorphism, deep violet' },
  de: { light: 'Warm und einladend', dark: 'Dezent und dunkel', 'midnight-glass': 'Glassmorphism, tiefes Violett' },
};
const THEME_PREVIEWS = {
  light: { bg: '#f8f6f3', surface: '#ffffff', accent: '#7c3aed' },
  dark: { bg: '#0f172a', surface: '#1e293b', accent: '#7c3aed' },
  'midnight-glass': { bg: '#06080f', surface: '#111628', accent: '#7c3aed' },
};

export default function AccountTab() {
  const { theme, setTheme, lang, setLang, availableThemes, availableLanguages, messages, me, isAdmin, isChild, loggedIn, profileImage, setProfileImage } = useApp();
  const [imageSaved, setImageSaved] = useState(false);
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
      setImageSaved(true);
      setTimeout(() => setImageSaved(false), 2000);
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="settings-grid stagger">
      {/* Profile */}
      <div className="settings-section glass">
        <div className="settings-section-title"><User size={16} /> {t(messages, 'profile')}</div>
        <div className="profile-row">
          {profileImage ? (
            <img src={profileImage} alt="" className="profile-avatar" style={{ objectFit: 'cover' }} />
          ) : (
            <div className="profile-avatar">{initials}</div>
          )}
          <div className="profile-info">
            <div className="profile-name">{me?.display_name || 'User'}</div>
            <div className="profile-email">{me?.email || ''}</div>
            <div className="profile-role">{isAdmin ? 'Admin' : isChild ? t(messages, 'child') : t(messages, 'member')}</div>
          </div>
        </div>
        <div style={{ marginTop: 'var(--space-md)' }}>
          <label style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', display: 'block', marginBottom: 'var(--space-sm)' }}>
            {t(messages, 'profile_image')}
          </label>
          <input type="file" accept="image/*" onChange={onProfileImage} style={{ fontSize: '0.88rem' }} />
          {imageSaved && (
            <span style={{ marginLeft: 'var(--space-sm)', fontSize: '0.82rem', color: 'var(--success)' }}>
              <Check size={14} style={{ verticalAlign: 'middle' }} /> Saved!
            </span>
          )}
        </div>
      </div>

      {/* Theme */}
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
        <div style={{ marginTop: 'var(--space-md)' }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 'var(--space-sm)' }}>
            {t(messages, 'installed_themes')}
          </div>
          <div className="pack-list">
            {availableThemes.map((th) => (
              <div key={th.key} className="pack-card glass-sm">
                <div className="pack-card-header">
                  <span className="pack-card-name">{th.name}</span>
                  {theme === th.key && <span className="pack-badge">{t(messages, 'pack_active')}</span>}
                </div>
                <div className="pack-meta">
                  <span>{t(messages, 'pack_version')} {th.version}</span>
                  <span>{t(messages, 'pack_author')}: {th.author}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Language */}
      <div className="settings-section glass">
        <div className="settings-section-title"><Globe size={16} /> {t(messages, 'language')}</div>
        <div className="lang-toggle">
          <button className={`lang-btn${lang === 'de' ? ' active' : ''}`} onClick={() => setLang('de')}>Deutsch</button>
          <button className={`lang-btn${lang === 'en' ? ' active' : ''}`} onClick={() => setLang('en')}>English</button>
        </div>
        <div style={{ marginTop: 'var(--space-md)' }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 'var(--space-sm)' }}>
            {t(messages, 'installed_languages')}
          </div>
          <div className="pack-list">
            {availableLanguages.map((l) => {
              const comp = languageCompleteness(l.key);
              return (
                <div key={l.key} className="pack-card glass-sm">
                  <div className="pack-card-header">
                    <span className="pack-card-name">{l.nativeName}</span>
                    {lang === l.key && <span className="pack-badge">{t(messages, 'pack_active')}</span>}
                  </div>
                  <div className="pack-meta">
                    <span>{t(messages, 'pack_version')} {l.version}</span>
                    <span>{t(messages, 'pack_author')}: {l.author}</span>
                  </div>
                  <div className="pack-progress-row">
                    <span className="pack-progress-label">{t(messages, 'pack_completeness')}</span>
                    <div className="pack-progress">
                      <div className="pack-progress-fill" style={{ width: `${comp.percent}%` }} />
                    </div>
                    <span className="pack-progress-value">{comp.percent}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
