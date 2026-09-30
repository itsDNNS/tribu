import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Trash2, X } from 'lucide-react';
import { t } from '../../lib/i18n';
import { monthName } from './contactUtils';

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);

export function emptyDraft() {
  return { full_name: '', email: '', phone: '', birthday_month: '', birthday_day: '', birthday_year: '' };
}

export function draftFrom(contact) {
  return {
    full_name: contact.full_name || '',
    email: contact.email || '',
    phone: contact.phone || '',
    birthday_month: contact.birthday_month ? String(contact.birthday_month) : '',
    birthday_day: contact.birthday_day ? String(contact.birthday_day) : '',
    birthday_year: contact.birthday_year ? String(contact.birthday_year) : '',
  };
}

// The payload for the API, or an error key.
export function draftPayload(draft) {
  const name = draft.full_name.trim();
  if (!name) return { error: 'module.contacts.name_required' };
  const year = draft.birthday_year.trim();
  if (year && !/^\d{4}$/.test(year)) return { error: 'module.birthdays.year_invalid' };
  const hasDate = draft.birthday_month && draft.birthday_day;
  return {
    payload: {
      full_name: name,
      email: draft.email.trim() || null,
      phone: draft.phone.trim() || null,
      birthday_month: hasDate ? Number(draft.birthday_month) : null,
      birthday_day: hasDate ? Number(draft.birthday_day) : null,
      birthday_year: hasDate && year ? Number(year) : null,
    },
  };
}

function DeleteButton({ onDelete, label, messages }) {
  const [confirming, setConfirming] = useState(false);
  if (confirming) {
    return (
      <div className="modal-delete-confirm">
        <button type="button" className="btn-ghost modal-delete-danger" onClick={onDelete}>
          <Trash2 size={14} /> {label}
        </button>
        <button type="button" className="btn-ghost" onClick={() => setConfirming(false)}>{t(messages, 'cancel')}</button>
      </div>
    );
  }
  return (
    <button type="button" className="btn-ghost contact-delete-btn modal-delete-trigger" onClick={() => setConfirming(true)} aria-label={t(messages, 'delete')}>
      <Trash2 size={14} />
    </button>
  );
}

export default function ContactFormModal({ editing, draft, setDraft, onSubmit, onDelete, onClose, messages, locale }) {
  const overlayRef = useRef(null);
  const panelRef = useRef(null);
  const firstInputRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const change = (key) => (event) => setDraft((prev) => ({ ...prev, [key]: event.target.value }));

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
  }, []);

  return createPortal(
    <div ref={overlayRef} className="contact-modal-overlay" onClick={(e) => e.target === overlayRef.current && onClose()}>
      <div ref={panelRef} className="contact-modal-panel" role="dialog" aria-modal="true" aria-labelledby="contact-form-title">
        <div className="modal-header">
          <h2 id="contact-form-title" className="modal-title">{t(messages, editing ? 'module.contacts.edit' : 'module.contacts.add')}</h2>
          <button type="button" onClick={onClose} className="btn-ghost modal-close" aria-label={t(messages, 'close')}>
            <X size={18} />
          </button>
        </div>
        <form onSubmit={onSubmit} className="modal-form ui-sheet-form">
          <div className="ui-sheet-body">
            <div className="form-field">
              <label htmlFor="contact-name">{t(messages, 'module.contacts.form.name')} *</label>
              <input ref={firstInputRef} id="contact-name" className="form-input" value={draft.full_name} onChange={change('full_name')} required autoComplete="name" />
            </div>
            <div className="form-field">
              <label htmlFor="contact-phone">{t(messages, 'module.contacts.form.phone')}</label>
              <input id="contact-phone" type="tel" className="form-input" value={draft.phone} onChange={change('phone')} autoComplete="tel" />
            </div>
            <div className="form-field">
              <label htmlFor="contact-email">{t(messages, 'module.contacts.form.email')}</label>
              <input id="contact-email" type="email" className="form-input" value={draft.email} onChange={change('email')} autoComplete="email" />
            </div>
            <div className="form-field">
              <label id="contact-birthday-label">{t(messages, 'module.contacts.form.birthday')}</label>
              <div className="contact-birthday-row" role="group" aria-labelledby="contact-birthday-label">
                <select className="form-input" value={draft.birthday_day} onChange={change('birthday_day')} aria-label={t(messages, 'module.contacts.form.day')}>
                  <option value="">{t(messages, 'module.contacts.form.day')}</option>
                  {DAYS.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
                <select className="form-input" value={draft.birthday_month} onChange={change('birthday_month')} aria-label={t(messages, 'module.contacts.form.month')}>
                  <option value="">{t(messages, 'module.contacts.form.month')}</option>
                  {MONTHS.map((m) => <option key={m} value={m}>{monthName(m, locale)}</option>)}
                </select>
                <input
                  className="form-input"
                  inputMode="numeric"
                  maxLength={4}
                  placeholder="1985"
                  value={draft.birthday_year}
                  onChange={change('birthday_year')}
                  aria-label={t(messages, 'module.birthdays.form.year')}
                  disabled={!draft.birthday_month || !draft.birthday_day}
                />
              </div>
              <span className="set-field-hint">{t(messages, 'module.birthdays.form.year_hint')}</span>
            </div>
          </div>
          <div className="modal-actions ui-sheet-actions">
            {editing && <DeleteButton onDelete={onDelete} label={t(messages, 'module.contacts.delete')} messages={messages} />}
            <button type="button" className="btn-ghost" onClick={onClose}>{t(messages, 'cancel')}</button>
            <button type="submit" className="btn-primary">{t(messages, 'module.contacts.save')}</button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
