import { useState, useEffect, useRef, Fragment } from 'react';
import { createPortal } from 'react-dom';
import { Plus, UserPlus, X, Trash2, Cake } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { useContacts } from '../hooks/useContacts';
import { useBirthdays, birthdayAge } from '../hooks/useBirthdays';
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

function contactDetails(contact) {
  const emailValues = Array.isArray(contact.email_values) && contact.email_values.length > 0
    ? contact.email_values
    : contact.email ? [contact.email] : [];
  const phoneValues = Array.isArray(contact.phone_values) && contact.phone_values.length > 0
    ? contact.phone_values
    : contact.phone ? [contact.phone] : [];
  return [...emailValues, ...phoneValues];
}

function DeleteButton({ onDelete, label, messages }) {
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <div className="modal-delete-confirm">
        <button type="button" className="btn-ghost modal-delete-danger" onClick={onDelete}>
          <Trash2 size={14} /> {label}
        </button>
        <button type="button" className="btn-ghost" onClick={() => setConfirming(false)}>
          {t(messages, 'cancel')}
        </button>
      </div>
    );
  }

  return (
    <button type="button" className="btn-ghost contact-delete-btn modal-delete-trigger" onClick={() => setConfirming(true)} aria-label={t(messages, 'delete')}>
      <Trash2 size={14} />
    </button>
  );
}

function FormModal({ id, title, onClose, onSubmit, saveKey, deleteButton, messages, children }) {
  const overlayRef = useRef(null);
  const panelRef = useRef(null);
  const firstInputRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    firstInputRef.current?.focus();
    function handleKeyDown(e) {
      if (e.key === 'Escape') { onCloseRef.current(); return; }
      if (e.key === 'Tab' && panelRef.current) {
        const focusable = panelRef.current.querySelectorAll('button, input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return createPortal(
    <div ref={overlayRef} className="contact-modal-overlay" onClick={(e) => e.target === overlayRef.current && onClose()}>
      <div ref={panelRef} className="contact-modal-panel" role="dialog" aria-modal="true" aria-labelledby={id}>
        <div className="modal-header">
          <h2 id={id} className="modal-title">{title}</h2>
          <button type="button" onClick={onClose} className="btn-ghost modal-close" aria-label={t(messages, 'close')}>
            <X size={18} />
          </button>
        </div>
        <form onSubmit={onSubmit} className="modal-form">
          {typeof children === 'function' ? children(firstInputRef) : children}
          <div className="modal-actions">
            {deleteButton}
            <button type="button" className="btn-ghost" onClick={onClose}>{t(messages, 'cancel')}</button>
            <button type="submit" className="btn-primary">{t(messages, saveKey)}</button>
          </div>
        </form>
      </div>
    </div>,
    document.body
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
        <div className="contacts-grid">
          {contactsHook.contacts.length > 0 ? (
            Array.from(
              [...contactsHook.contacts].sort((a, b) => (a.full_name || '').localeCompare(b.full_name || '', 'de')).reduce((map, c) => {
                const letter = (c.full_name || '?')[0].toUpperCase();
                if (!map.has(letter)) map.set(letter, []);
                map.get(letter).push(c);
                return map;
              }, new Map())
            ).map(([letter, group]) => (
              <Fragment key={letter}>
                <div className="contacts-section-letter">{letter}</div>
                {group.map((c) => {
                  const initials = (c.full_name || '?').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
                  const details = contactDetails(c);
                  return (
                    <div
                      key={c.id}
                      className={`contact-card${canEdit ? ' contact-card-clickable' : ''}`}
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
                        {details.map((detail) => (
                          <div key={detail} className="contact-detail">{detail}</div>
                        ))}
                        {c.birthday_month && c.birthday_day && (
                          <div className="contact-birthday">
                            <Cake size={12} aria-hidden="true" /> {c.birthday_day}.{c.birthday_month}.
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </Fragment>
            ))
          ) : (
            <div className="contacts-empty">
              <div className="contacts-empty-text">{t(messages, 'module.contacts.no_contacts')}</div>
              {!demoMode && !isChild && (
                <div className="contacts-empty-actions">
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
        <div className="birthdays-grid">
          {birthdaysHook.birthdays.length > 0 ? (
            Array.from(grouped).map(([month, items]) => (
              <Fragment key={month}>
                <div className="birthdays-section-month">{monthNames[month - 1]}</div>
                {items.map((b) => {
                  const days = daysUntilBirthday(b.month, b.day);
                  const initials = (b.person_name || '?').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
                  const dateStr = `${String(b.day).padStart(2, '0')}.${String(b.month).padStart(2, '0')}.`;
                  const age = birthdayAge(b);
                  return (
                    <div
                      key={b.id}
                      className={`birthday-card${canEdit ? ' birthday-card-clickable' : ''}`}
                      onClick={canEdit ? () => birthdaysHook.openEdit(b) : undefined}
                      role={canEdit ? 'button' : undefined}
                      tabIndex={canEdit ? 0 : undefined}
                      onKeyDown={canEdit ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); birthdaysHook.openEdit(b); } } : undefined}
                    >
                      <div className="birthday-avatar" style={{ background: getAvatarColor(b.person_name) }}>
                        {initials}
                      </div>
                      <div className="birthday-info">
                        <div className="birthday-name">
                          {b.person_name}
                          {age !== null && <span className="birthday-age"> · {t(messages, 'module.birthdays.age_years').replace('{age}', age)}</span>}
                        </div>
                        <div className="birthday-date"><Cake size={12} aria-hidden="true" /> {dateStr}</div>
                      </div>
                      <div className={`birthday-countdown${days === 0 ? ' birthday-today' : ''}`}>
                        {days === 0
                          ? t(messages, 'module.birthdays.today')
                          : t(messages, 'module.birthdays.days_until').replace('{days}', days)}
                      </div>
                    </div>
                  );
                })}
              </Fragment>
            ))
          ) : (
            <div className="contacts-empty">
              <div className="contacts-empty-text">{t(messages, 'module.birthdays.no_birthdays')}</div>
              {!demoMode && !isChild && (
                <div className="contacts-empty-actions">
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
        <FormModal
          id="contact-form-title"
          title={t(messages, contactsHook.editingContact ? 'module.contacts.edit' : 'module.contacts.add')}
          onClose={contactsHook.resetForm}
          onSubmit={contactsHook.editingContact ? contactsHook.updateContact : contactsHook.createContact}
          isEditing={!!contactsHook.editingContact}
          saveKey="module.contacts.save"
          deleteButton={contactsHook.editingContact && (
            <DeleteButton onDelete={() => contactsHook.deleteContact(contactsHook.editingContact)} label={t(messages, 'module.contacts.delete')} messages={messages} />
          )}
          messages={messages}
        >
          {(firstInputRef) => (
            <>
              <div className="form-field">
                <label htmlFor="contact-name">{t(messages, 'module.contacts.form.name')} *</label>
                <input ref={firstInputRef} id="contact-name" className="form-input" value={contactsHook.contactName} onChange={(e) => contactsHook.setContactName(e.target.value)} required autoComplete="name" />
              </div>
              <div className="form-field">
                <label htmlFor="contact-email">{t(messages, 'module.contacts.form.email')}</label>
                <input id="contact-email" type="email" className="form-input" value={contactsHook.contactEmail} onChange={(e) => contactsHook.setContactEmail(e.target.value)} autoComplete="email" />
              </div>
              <div className="form-field">
                <label htmlFor="contact-phone">{t(messages, 'module.contacts.form.phone')}</label>
                <input id="contact-phone" type="tel" className="form-input" value={contactsHook.contactPhone} onChange={(e) => contactsHook.setContactPhone(e.target.value)} autoComplete="tel" />
              </div>
              <div className="form-field">
                <label>{t(messages, 'module.contacts.form.birthday')}</label>
                <div className="modal-date-row">
                  <select className="form-input" value={contactsHook.contactBirthdayMonth} onChange={(e) => contactsHook.setContactBirthdayMonth(e.target.value)} aria-label={t(messages, 'module.contacts.form.month')}>
                    <option value="">{t(messages, 'module.contacts.form.month')}</option>
                    {MONTHS.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                  <select className="form-input" value={contactsHook.contactBirthdayDay} onChange={(e) => contactsHook.setContactBirthdayDay(e.target.value)} aria-label={t(messages, 'module.contacts.form.day')}>
                    <option value="">{t(messages, 'module.contacts.form.day')}</option>
                    {DAYS.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
              </div>
            </>
          )}
        </FormModal>
      )}

      {birthdaysHook.showForm && (
        <FormModal
          id="birthday-form-title"
          title={t(messages, birthdaysHook.editingBirthday ? 'module.birthdays.edit' : 'module.birthdays.add')}
          onClose={birthdaysHook.resetForm}
          onSubmit={birthdaysHook.editingBirthday ? birthdaysHook.updateBirthday : birthdaysHook.createBirthday}
          isEditing={!!birthdaysHook.editingBirthday}
          saveKey="module.birthdays.save"
          deleteButton={birthdaysHook.editingBirthday && (
            <DeleteButton onDelete={() => birthdaysHook.deleteBirthday(birthdaysHook.editingBirthday)} label={t(messages, 'module.birthdays.delete')} messages={messages} />
          )}
          messages={messages}
        >
          {(firstInputRef) => {
            const monthNames = MONTH_NAMES[lang] || MONTH_NAMES.en;
            return (
              <>
                <div className="form-field">
                  <label htmlFor="birthday-name">{t(messages, 'module.birthdays.form.name')} *</label>
                  <input ref={firstInputRef} id="birthday-name" className="form-input" value={birthdaysHook.personName} onChange={(e) => birthdaysHook.setPersonName(e.target.value)} required autoComplete="name" />
                </div>
                <div className="form-field">
                  <label>{t(messages, 'module.birthdays.form.date')} *</label>
                  <div className="modal-date-row">
                    <select className="form-input" value={birthdaysHook.birthdayMonth} onChange={(e) => birthdaysHook.setBirthdayMonth(e.target.value)} aria-label={t(messages, 'module.birthdays.form.month')} required>
                      <option value="">{t(messages, 'module.birthdays.form.month')}</option>
                      {MONTHS.map((m) => <option key={m} value={m}>{monthNames[m - 1]}</option>)}
                    </select>
                    <select className="form-input" value={birthdaysHook.birthdayDay} onChange={(e) => birthdaysHook.setBirthdayDay(e.target.value)} aria-label={t(messages, 'module.birthdays.form.day')} required>
                      <option value="">{t(messages, 'module.birthdays.form.day')}</option>
                      {DAYS.map((d) => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                </div>
                <div className="form-field">
                  <label htmlFor="birthday-year">{t(messages, 'module.birthdays.form.year')}</label>
                  <input
                    id="birthday-year"
                    className="form-input"
                    type="number"
                    inputMode="numeric"
                    min={1900}
                    step={1}
                    placeholder="1985"
                    value={birthdaysHook.birthdayYear}
                    onChange={(e) => birthdaysHook.setBirthdayYear(e.target.value)}
                  />
                  <span className="set-field-hint">{t(messages, 'module.birthdays.form.year_hint')}</span>
                </div>
              </>
            );
          }}
        </FormModal>
      )}
    </div>
  );
}
