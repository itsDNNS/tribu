import React, { useEffect, useRef } from 'react';
import { Plus, X, Trash2 } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { useBirthdays } from '../hooks/useBirthdays';
import { t } from '../lib/i18n';

const AVATAR_COLORS = [
  'var(--member-1)', 'var(--member-2)', 'var(--member-3)', 'var(--member-4)',
  'var(--success)', 'var(--sapphire)', 'var(--warning)',
];

function getAvatarColor(name) {
  let hash = 0;
  for (let i = 0; i < (name || '').length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);

const MONTH_NAMES = {
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  de: ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'],
};

function daysUntilBirthday(month, day) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let next = new Date(now.getFullYear(), month - 1, day);
  if (next < today) next = new Date(now.getFullYear() + 1, month - 1, day);
  return Math.round((next - today) / (1000 * 60 * 60 * 24));
}

function BirthdayFormModal({ hook, messages, isEditing, lang }) {
  const overlayRef = useRef(null);
  const nameRef = useRef(null);

  useEffect(() => {
    nameRef.current?.focus();
    function handleKeyDown(e) {
      if (e.key === 'Escape') hook.resetForm();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [hook]);

  function handleOverlayClick(e) {
    if (e.target === overlayRef.current) hook.resetForm();
  }

  const monthNames = MONTH_NAMES[lang] || MONTH_NAMES.en;

  return (
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="birthday-form-title"
      className="contact-modal-overlay"
      onClick={handleOverlayClick}
    >
      <div className="glass contact-modal-panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-lg)' }}>
          <h2 id="birthday-form-title" style={{ fontWeight: 600, fontSize: '1.1rem', margin: 0 }}>
            {t(messages, isEditing ? 'module.birthdays.edit' : 'module.birthdays.add')}
          </h2>
          <button type="button" onClick={hook.resetForm} className="btn-ghost" style={{ padding: 6, minHeight: 'auto' }} aria-label={t(messages, 'module.birthdays.close')}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={isEditing ? hook.updateBirthday : hook.createBirthday} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
          <div className="form-field">
            <label htmlFor="birthday-name">{t(messages, 'module.birthdays.form.name')} *</label>
            <input
              ref={nameRef}
              id="birthday-name"
              className="form-input"
              style={{ width: '100%' }}
              value={hook.personName}
              onChange={(e) => hook.setPersonName(e.target.value)}
              required
              autoComplete="name"
            />
          </div>

          <div className="form-field">
            <label>{t(messages, 'module.birthdays.form.date')} *</label>
            <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
              <select
                className="form-input"
                style={{ flex: 1 }}
                value={hook.birthdayMonth}
                onChange={(e) => hook.setBirthdayMonth(e.target.value)}
                aria-label={t(messages, 'module.birthdays.form.month')}
                required
              >
                <option value="">{t(messages, 'module.birthdays.form.month')}</option>
                {MONTHS.map((m) => <option key={m} value={m}>{monthNames[m - 1]}</option>)}
              </select>
              <select
                className="form-input"
                style={{ flex: 1 }}
                value={hook.birthdayDay}
                onChange={(e) => hook.setBirthdayDay(e.target.value)}
                aria-label={t(messages, 'module.birthdays.form.day')}
                required
              >
                <option value="">{t(messages, 'module.birthdays.form.day')}</option>
                {DAYS.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 'var(--space-sm)', justifyContent: 'flex-end', marginTop: 'var(--space-sm)' }}>
            {isEditing && (
              <DeleteButton hook={hook} messages={messages} />
            )}
            <button type="button" className="btn-ghost" onClick={hook.resetForm}>
              {t(messages, 'cancel')}
            </button>
            <button type="submit" className="btn-primary">
              {t(messages, 'module.birthdays.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DeleteButton({ hook, messages }) {
  const [confirming, setConfirming] = React.useState(false);

  if (confirming) {
    return (
      <div style={{ display: 'flex', gap: 'var(--space-xs)', marginRight: 'auto' }}>
        <button
          type="button"
          className="btn-ghost"
          style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}
          onClick={() => hook.deleteBirthday(hook.editingBirthday)}
        >
          <Trash2 size={14} /> {t(messages, 'module.birthdays.delete')}
        </button>
        <button type="button" className="btn-ghost" onClick={() => setConfirming(false)}>
          {t(messages, 'cancel')}
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      className="btn-ghost contact-delete-btn"
      style={{ marginRight: 'auto' }}
      onClick={() => setConfirming(true)}
      aria-label={t(messages, 'delete')}
    >
      <Trash2 size={14} />
    </button>
  );
}

export default function BirthdaysView() {
  const { messages, demoMode, isChild, lang } = useApp();
  const hook = useBirthdays();
  const canEdit = !isChild;

  const monthNames = MONTH_NAMES[lang] || MONTH_NAMES.en;

  // Group birthdays by month
  const grouped = new Map();
  for (const b of [...hook.birthdays].sort((a, c) => a.month - c.month || a.day - c.day)) {
    if (!grouped.has(b.month)) grouped.set(b.month, []);
    grouped.get(b.month).push(b);
  }

  return (
    <div>
      <div className="view-header">
        <div>
          <h1 className="view-title">{t(messages, 'module.birthdays.name')}</h1>
          <div className="view-subtitle">{hook.birthdays.length} {t(messages, 'module.birthdays.name')}</div>
        </div>
        {canEdit && (
          <button className="btn-primary" onClick={hook.openCreate} style={{ fontSize: '0.85rem' }}>
            <Plus size={16} /> {t(messages, 'module.birthdays.add')}
          </button>
        )}
      </div>

      <div className="birthdays-grid stagger">
        {hook.birthdays.length > 0 ? (
          Array.from(grouped).map(([month, items]) => (
            <React.Fragment key={month}>
              <div className="birthdays-section-month">{monthNames[month - 1]}</div>
              {items.map((b) => {
                const days = daysUntilBirthday(b.month, b.day);
                const initials = (b.person_name || '?').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
                const dateStr = `${String(b.day).padStart(2, '0')}.${String(b.month).padStart(2, '0')}.`;
                return (
                  <div
                    key={b.id}
                    className={`birthday-card glass-sm${canEdit ? ' birthday-card-clickable' : ''}`}
                    onClick={canEdit ? () => hook.openEdit(b) : undefined}
                    role={canEdit ? 'button' : undefined}
                    tabIndex={canEdit ? 0 : undefined}
                    onKeyDown={canEdit ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); hook.openEdit(b); } } : undefined}
                  >
                    <div className="birthday-avatar" style={{ background: getAvatarColor(b.person_name) }}>
                      {initials}
                    </div>
                    <div className="birthday-info">
                      <div className="birthday-name">{b.person_name}</div>
                      <div className="birthday-date">🎂 {dateStr}</div>
                    </div>
                    <div className={`birthday-countdown${days === 0 ? ' birthday-today' : ''}`}>
                      {days === 0
                        ? t(messages, 'module.birthdays.today')
                        : t(messages, 'module.birthdays.days_until').replace('{days}', days)}
                    </div>
                  </div>
                );
              })}
            </React.Fragment>
          ))
        ) : (
          <div className="glass-sm" style={{ padding: 'var(--space-xl)', textAlign: 'center', gridColumn: '1 / -1' }}>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>{t(messages, 'module.birthdays.no_birthdays')}</div>
            {!demoMode && !isChild && (
              <div style={{ marginTop: 'var(--space-md)' }}>
                <button className="btn-primary" onClick={hook.openCreate}>
                  <Plus size={15} /> {t(messages, 'module.birthdays.add')}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {hook.showForm && (
        <BirthdayFormModal
          hook={hook}
          messages={messages}
          isEditing={!!hook.editingBirthday}
          lang={lang}
        />
      )}
    </div>
  );
}
