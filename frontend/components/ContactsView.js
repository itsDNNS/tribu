import React, { useEffect, useRef } from 'react';
import { Plus, UserPlus, X, Trash2 } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { useContacts } from '../hooks/useContacts';
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

  return (
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
              <DeleteButton hook={hook} messages={messages} />
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

export default function ContactsView() {
  const { messages, demoMode, setActiveView, isChild } = useApp();
  const hook = useContacts();
  const canEdit = !isChild;

  return (
    <div>
      <div className="view-header">
        <div>
          <h1 className="view-title">{t(messages, 'contacts')}</h1>
          <div className="view-subtitle">{hook.contacts.length} {t(messages, 'contacts')}</div>
        </div>
        {canEdit && (
          <button className="btn-primary" onClick={hook.openCreate} style={{ fontSize: '0.85rem' }}>
            <Plus size={16} /> {t(messages, 'module.contacts.add')}
          </button>
        )}
      </div>

      <div className="contacts-grid stagger">
        {hook.contacts.length > 0 ? (
          Array.from(
            [...hook.contacts].sort((a, b) => (a.full_name || '').localeCompare(b.full_name || '', 'de')).reduce((map, c) => {
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
                    onClick={canEdit ? () => hook.openEdit(c) : undefined}
                    role={canEdit ? 'button' : undefined}
                    tabIndex={canEdit ? 0 : undefined}
                    onKeyDown={canEdit ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); hook.openEdit(c); } } : undefined}
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
                <button className="btn-primary" onClick={hook.openCreate}>
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

      {hook.showForm && (
        <ContactFormModal
          hook={hook}
          messages={messages}
          isEditing={!!hook.editingContact}
        />
      )}
    </div>
  );
}
