import { useState } from 'react';
import { Users, CalendarDays, ShoppingCart, CheckSquare, CheckCircle, Globe } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { t } from '../lib/i18n';
import { COLOR_PALETTE } from '../lib/member-colors';
import * as api from '../lib/api';

const STEPS = ['welcome', 'profile', 'tour', 'done'];

const TOUR_FEATURES = [
  { icon: CalendarDays, titleKey: 'onboarding.tour_calendar', descKey: 'onboarding.tour_calendar_desc' },
  { icon: ShoppingCart, titleKey: 'onboarding.tour_shopping', descKey: 'onboarding.tour_shopping_desc' },
  { icon: CheckSquare, titleKey: 'onboarding.tour_tasks', descKey: 'onboarding.tour_tasks_desc' },
];

export default function OnboardingWizard() {
  const {
    messages, me, setMe, families, familyId, members,
    lang, setLang, availableLanguages,
  } = useApp();

  const [step, setStep] = useState(0);
  const [selectedColor, setSelectedColor] = useState(null);
  const [saving, setSaving] = useState(false);

  const currentStep = STEPS[step];
  const currentFamily = families.find((f) => String(f.family_id) === String(familyId));
  const familyName = currentFamily?.family_name || 'Tribu';

  // Colors already taken by other members
  const takenColors = new Set(
    members.filter((m) => m.user_id !== me?.user_id && m.color).map((m) => m.color)
  );

  const nextStep = () => setStep((s) => Math.min(s + 1, STEPS.length - 1));
  const prevStep = () => setStep((s) => Math.max(s - 1, 0));

  const saveColor = async () => {
    if (!selectedColor || !familyId) return;
    setSaving(true);
    await api.apiSetMemberColor(familyId, selectedColor);
    setSaving(false);
  };

  const handleNext = async () => {
    if (currentStep === 'profile' && selectedColor) {
      await saveColor();
    }
    nextStep();
  };

  const finish = async () => {
    setSaving(true);
    await api.apiCompleteOnboarding();
    setMe((prev) => ({ ...prev, has_completed_onboarding: true }));
    setSaving(false);
  };

  const skip = async () => {
    setSaving(true);
    await api.apiCompleteOnboarding();
    setMe((prev) => ({ ...prev, has_completed_onboarding: true }));
    setSaving(false);
  };

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

  const dots = (
    <div className="setup-steps">
      {STEPS.map((_, i) => (
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
        </div>

        <div className="auth-card glass glow-purple">
          {dots}

          {/* Step 1: Welcome */}
          {currentStep === 'welcome' && (
            <div style={{ textAlign: 'center' }}>
              <h2 style={{ margin: '0 0 8px', fontSize: '1.3rem' }}>
                {t(messages, 'onboarding.welcome_title').replace('{family}', familyName)}
              </h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: 24 }}>
                {t(messages, 'onboarding.welcome_subtitle')}
              </p>
              <button className="btn-primary" style={{ width: '100%' }} onClick={nextStep}>
                {t(messages, 'onboarding.get_started')}
              </button>
              <button className="btn-link" style={{ width: '100%', marginTop: 8 }} onClick={skip} disabled={saving}>
                {t(messages, 'onboarding.skip')}
              </button>
            </div>
          )}

          {/* Step 2: Profile */}
          {currentStep === 'profile' && (
            <div>
              <h2 style={{ textAlign: 'center', margin: '0 0 16px', fontSize: '1.2rem' }}>
                {t(messages, 'onboarding.profile_title')}
              </h2>
              <div className="form-field" style={{ marginBottom: 16 }}>
                <label htmlFor="onboarding-name">{t(messages, 'your_name')}</label>
                <input
                  id="onboarding-name"
                  className="form-input"
                  type="text"
                  value={me?.display_name || ''}
                  disabled
                />
              </div>
              <div className="form-field" style={{ marginBottom: 20 }}>
                <label>{t(messages, 'onboarding.choose_color')}</label>
                <div className="onboarding-color-picker">
                  {COLOR_PALETTE.map((color) => {
                    const taken = takenColors.has(color);
                    return (
                      <button
                        key={color}
                        className={`onboarding-color-chip${selectedColor === color ? ' active' : ''}${taken ? ' taken' : ''}`}
                        style={{ background: color }}
                        onClick={() => !taken && setSelectedColor(color)}
                        disabled={taken}
                        aria-label={color}
                        title={taken ? t(messages, 'color_taken_by').replace('{name}', members.find((m) => m.color === color)?.display_name || '') : color}
                      />
                    );
                  })}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn-secondary" style={{ flex: 1 }} onClick={prevStep}>
                  {t(messages, 'onboarding.back')}
                </button>
                <button className="btn-primary" style={{ flex: 1 }} onClick={handleNext} disabled={saving}>
                  {t(messages, 'onboarding.next')}
                </button>
              </div>
              <button className="btn-link" style={{ width: '100%', marginTop: 8 }} onClick={skip} disabled={saving}>
                {t(messages, 'onboarding.skip')}
              </button>
            </div>
          )}

          {/* Step 3: Tour */}
          {currentStep === 'tour' && (
            <div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
                {TOUR_FEATURES.map((feat) => (
                  <div key={feat.titleKey} className="onboarding-feature-card">
                    <div className="onboarding-feature-icon">
                      <feat.icon size={24} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{t(messages, feat.titleKey)}</div>
                      <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{t(messages, feat.descKey)}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn-secondary" style={{ flex: 1 }} onClick={prevStep}>
                  {t(messages, 'onboarding.back')}
                </button>
                <button className="btn-primary" style={{ flex: 1 }} onClick={nextStep}>
                  {t(messages, 'onboarding.next')}
                </button>
              </div>
              <button className="btn-link" style={{ width: '100%', marginTop: 8 }} onClick={skip} disabled={saving}>
                {t(messages, 'onboarding.skip')}
              </button>
            </div>
          )}

          {/* Step 4: Done */}
          {currentStep === 'done' && (
            <div style={{ textAlign: 'center' }}>
              <CheckCircle size={48} style={{ color: 'var(--success)', marginBottom: 12 }} />
              <h2 style={{ margin: '0 0 8px', fontSize: '1.3rem' }}>{t(messages, 'onboarding.done_title')}</h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: 24 }}>
                {t(messages, 'onboarding.done_subtitle')}
              </p>
              <button className="btn-primary" style={{ width: '100%' }} onClick={finish} disabled={saving}>
                {t(messages, 'onboarding.go_to_dashboard')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
