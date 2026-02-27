import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Plus, UserPlus, X, Trash2, Cake } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { useContacts } from '../hooks/useContacts';
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

function ContactFormModal({ hook, messages, isEditing }) {
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

  return createPortal(
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="contact-form-title"
      className="contact-modal-overlay"
      onClick={handleOverlayClick}
    >
      <div className="glass contact-modal-panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-lg)' }}>
          <h2 id="contact-form-title" style={{ fontWeight: 600, fontSize: '1.1rem', margin: 0 }}>
            {t(messages, isEditing ? 'module.contacts.edit' : 'module.contacts.add')}
          </h2>
          <button type="button" onClick={hook.resetForm} className="btn-ghost" style={{ padding: 6, minHeight: 'auto' }} aria-label={t(messages, 'module.contacts.close')}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={isEditing ? hook.updateContact : hook.createContact} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
          <div className="form-field">
            <label htmlFor="contact-name">{t(messages, 'module.contacts.form.name')} *</label>
            <input
              ref={nameRef}
              id="contact-name"
              className="form-input"
              style={{ width: '100%' }}
              value={hook.contactName}
              onChange={(e) => hook.setContactName(e.target.value)}
              required
              autoComplete="name"
            />
          </div>

          <div className="form-field">
            <label htmlFor="contact-email">{t(messages, 'module.contacts.form.email')}</label>
            <input
              id="contact-email"
              type="email"
              className="form-input"
              style={{ width: '100%' }}
              value={hook.contactEmail}
              onChange={(e) => hook.setContactEmail(e.target.value)}
              autoComplete="email"
            />
          </div>

          <div className="form-field">
            <label htmlFor="contact-phone">{t(messages, 'module.contacts.form.phone')}</label>
            <input
              id="contact-phone"
              type="tel"
              className="form-input"
              style={{ width: '100%' }}
              value={hook.contactPhone}
              onChange={(e) => hook.setContactPhone(e.target.value)}
              autoComplete="tel"
            />
          </div>

          <div className="form-field">
            <label>{t(messages, 'module.contacts.form.birthday')}</label>
            <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
              <select
                className="form-input"
                style={{ flex: 1 }}
                value={hook.contactBirthdayMonth}
                onChange={(e) => hook.setContactBirthdayMonth(e.target.value)}
                aria-label={t(messages, 'module.contacts.form.month')}
              >
                <option value="">{t(messages, 'module.contacts.form.month')}</option>
                {MONTHS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
              <select
                className="form-input"
                style={{ flex: 1 }}
                value={hook.contactBirthdayDay}
                onChange={(e) => hook.setContactBirthdayDay(e.target.value)}
                aria-label={t(messages, 'module.contacts.form.day')}
              >
                <option value="">{t(messages, 'module.contacts.form.day')}</option>
                {DAYS.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 'var(--space-sm)', justifyContent: 'flex-end', marginTop: 'var(--space-sm)' }}>
            {isEditing && (
              <ContactDeleteButton hook={hook} messages={messages} />
            )}
            <button type="button" className="btn-ghost" onClick={hook.resetForm}>
              {t(messages, 'cancel')}
            </button>
            <button type="submit" className="btn-primary">
              {t(messages, 'module.contacts.save')}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
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

  return createPortal(
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
              <BirthdayDeleteButton hook={hook} messages={messages} />
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
    </div>,
    document.body
  );
}

function ContactDeleteButton({ hook, messages }) {
  const [confirming, setConfirming] = React.useState(false);

  if (confirming) {
    return (
      <div style={{ display: 'flex', gap: 'var(--space-xs)', marginRight: 'auto' }}>
        <button
          type="button"
          className="btn-ghost"
          style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}
          onClick={() => hook.deleteContact(hook.editingContact)}
        >
          <Trash2 size={14} /> {t(messages, 'module.contacts.delete')}
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

function BirthdayDeleteButton({ hook, messages }) {
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

export default function ContactsView() {
  const { messages, demoMode, setActiveView, isChild, lang } = useApp();
  const contactsHook = useContacts();
  const birthdaysHook = useBirthdays();
  const canEdit = !isChild;
  const [activeTab, setActiveTab] = useState('contacts');

  const monthNames = MONTH_NAMES[lang] || MONTH_NAMES.en;

  // Group birthdays by month
  const grouped = new Map();
  for (const b of [...birthdaysHook.birthdays].sort((a, c) => a.month - c.month || a.day - c.day)) {
    if (!grouped.has(b.month)) grouped.set(b.month, []);
    grouped.get(b.month).push(b);
  }

  return (
    <div>
      <div className="view-header">
        <div>
          <h1 className="view-title">{t(messages, 'contacts')}</h1>
          <div className="view-subtitle">
            {activeTab === 'contacts'
              ? `${contactsHook.contacts.length} ${t(messages, 'contacts')}`
              : `${birthdaysHook.birthdays.length} ${t(messages, 'module.birthdays.name')}`}
          </div>
        </div>
        {canEdit && (
          <button
            className="btn-primary"
            onClick={activeTab === 'contacts' ? contactsHook.openCreate : birthdaysHook.openCreate}
            style={{ fontSize: '0.85rem' }}
          >
            <Plus size={16} /> {t(messages, activeTab === 'contacts' ? 'module.contacts.add' : 'module.birthdays.add')}
          </button>
        )}
      </div>

      <div className="contacts-tab-toggle">
        <button
          className={`contacts-tab-btn${activeTab === 'contacts' ? ' active' : ''}`}
          onClick={() => setActiveTab('contacts')}
        >
          {t(messages, 'contacts_tab_contacts')}
        </button>
        <button
          className={`contacts-tab-btn${activeTab === 'birthdays' ? ' active' : ''}`}
          onClick={() => setActiveTab('birthdays')}
        >
          <Cake size={14} /> {t(messages, 'contacts_tab_birthdays')}
        </button>
      </div>

      {activeTab === 'contacts' ? (
        <div className="contacts-grid stagger">
          {contactsHook.contacts.length > 0 ? (
            Array.from(
              [...contactsHook.contacts].sort((a, b) => (a.full_name || '').localeCompare(b.full_name || '', 'de')).reduce((map, c) => {
                const letter = (c.full_name || '?')[0].toUpperCase();
                if (!map.has(letter)) map.set(letter, []);
                map.get(letter).push(c);
                return map;
              }, new Map())
            ).map(([letter, group]) => (
              <React.Fragment key={letter}>
                <div className="contacts-section-letter">{letter}</div>
                {group.map((c) => {
                  const initials = (c.full_name || '?').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
                  return (
                    <div
                      key={c.id}
                      className={`contact-card glass-sm${canEdit ? ' contact-card-clickable' : ''}`}
                      onClick={canEdit ? () => contactsHook.openEdit(c) : undefined}
                      role={canEdit ? 'button' : undefined}
                      tabIndex={canEdit ? 0 : undefined}
                      onKeyDown={canEdit ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); contactsHook.openEdit(c); } } : undefined}
                    >
                      <div className="contact-avatar" style={{ background: getAvatarColor(c.full_name) }}>
                        {initials}
                      </div>
                      <div className="contact-info">
                        <div className="contact-name">{c.full_name}</div>
                        {(c.email || c.phone) && (
                          <div className="contact-detail">{c.email || c.phone}</div>
                        )}
                        {c.birthday_month && c.birthday_day && (
                          <div className="contact-birthday">
                            🎂 {c.birthday_day}.{c.birthday_month}.
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </React.Fragment>
            ))
          ) : (
            <div className="glass-sm" style={{ padding: 'var(--space-xl)', textAlign: 'center', gridColumn: '1 / -1' }}>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>{t(messages, 'module.contacts.no_contacts')}</div>
              {!demoMode && !isChild && (
                <div style={{ display: 'flex', gap: 'var(--space-sm)', justifyContent: 'center', marginTop: 'var(--space-md)' }}>
                  <button className="btn-primary" onClick={contactsHook.openCreate}>
                    <Plus size={15} /> {t(messages, 'module.contacts.add')}
                  </button>
                  <button className="btn-ghost" onClick={() => setActiveView('settings')}>
                    <UserPlus size={15} /> {t(messages, 'module.contacts.import_cta')}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="birthdays-grid stagger">
          {birthdaysHook.birthdays.length > 0 ? (
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
                      onClick={canEdit ? () => birthdaysHook.openEdit(b) : undefined}
                      role={canEdit ? 'button' : undefined}
                      tabIndex={canEdit ? 0 : undefined}
                      onKeyDown={canEdit ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); birthdaysHook.openEdit(b); } } : undefined}
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
                  <button className="btn-primary" onClick={birthdaysHook.openCreate}>
                    <Plus size={15} /> {t(messages, 'module.birthdays.add')}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {contactsHook.showForm && (
        <ContactFormModal
          hook={contactsHook}
          messages={messages}
          isEditing={!!contactsHook.editingContact}
        />
      )}

      {birthdaysHook.showForm && (
        <BirthdayFormModal
          hook={birthdaysHook}
          messages={messages}
          isEditing={!!birthdaysHook.editingBirthday}
          lang={lang}
        />
      )}
    </div>
  );
}
