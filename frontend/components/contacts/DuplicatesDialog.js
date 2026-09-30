import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { t } from '../../lib/i18n';
import { avatarColor, birthdayDate, channels, initials } from './contactUtils';

// Goes through the possible duplicates one group at a time: pick the
// contact to keep and merge, or say they are different people.
export default function DuplicatesDialog({ groups, contacts, messages, locale, onMerge, onDismiss, onClose, busy }) {
  const overlayRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const byId = new Map(contacts.map((contact) => [contact.id, contact]));
  const group = groups[0];
  const members = group ? group.contact_ids.map((id) => byId.get(id)).filter(Boolean) : [];
  const [keepId, setKeepId] = useState(members[0]?.id);

  useEffect(() => {
    // The richest contact is the natural one to keep.
    const score = (c) => {
      const { emails, phones } = channels(c);
      return emails.length + phones.length + (c.birthday_month ? 1 : 0) + (c.addresses?.length || 0) + (c.synced ? 2 : 0);
    };
    const best = [...members].sort((a, b) => score(b) - score(a))[0];
    setKeepId(best?.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group?.contact_ids.join(',')]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onCloseRef.current(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  if (!group || members.length < 2) return null;
  return createPortal(
    <div ref={overlayRef} className="contact-modal-overlay" onClick={(e) => e.target === overlayRef.current && onClose()}>
      <div className="contact-modal-panel contact-duplicates-panel" role="dialog" aria-modal="true" aria-labelledby="contact-duplicates-title">
        <div className="modal-header">
          <h2 id="contact-duplicates-title" className="modal-title">{t(messages, 'module.contacts.merge_title')}</h2>
          <button type="button" onClick={onClose} className="btn-ghost modal-close" aria-label={t(messages, 'close')}>
            <X size={18} />
          </button>
        </div>
        <p className="contact-duplicates-hint">{t(messages, 'module.contacts.merge_hint')}</p>
        <div className="contact-duplicates-reasons">
          {group.reasons.map((reason) => (
            <span key={reason} className="contact-duplicates-reason">{t(messages, `module.contacts.reason_${reason}`)}</span>
          ))}
        </div>
        <div className="contact-duplicates-list" role="radiogroup" aria-label={t(messages, 'module.contacts.keep')}>
          {members.map((contact) => {
            const { emails, phones } = channels(contact);
            const checked = contact.id === keepId;
            return (
              <label key={contact.id} className={`contact-duplicate-option${checked ? ' selected' : ''}`}>
                <input type="radio" name="contact-keep" checked={checked} onChange={() => setKeepId(contact.id)} />
                <span className="contact-list-avatar" style={{ background: avatarColor(contact.full_name) }} aria-hidden="true">{initials(contact.full_name)}</span>
                <span className="contact-duplicate-text">
                  <strong>{contact.full_name}</strong>
                  {[...phones, ...emails].map((value) => <span key={value}>{value}</span>)}
                  {contact.birthday_month && contact.birthday_day && (
                    <span>{birthdayDate(contact.birthday_month, contact.birthday_day, locale)}{contact.birthday_year ? ` ${contact.birthday_year}` : ''}</span>
                  )}
                  {contact.synced && <span className="contact-duplicate-source">{t(messages, 'module.contacts.synced')}</span>}
                </span>
                {checked && <span className="contact-duplicate-keep">{t(messages, 'module.contacts.keep')}</span>}
              </label>
            );
          })}
        </div>
        <div className="modal-actions">
          <button type="button" className="btn-ghost" disabled={busy} onClick={() => onDismiss(group)}>
            {t(messages, 'module.contacts.not_duplicates')}
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={busy || !keepId}
            onClick={() => onMerge(keepId, group.contact_ids.filter((id) => id !== keepId))}
          >
            {t(messages, 'module.contacts.merge')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
