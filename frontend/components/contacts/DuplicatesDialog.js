import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link2, Users, X } from 'lucide-react';
import { t } from '../../lib/i18n';
import MemberAvatar from '../MemberAvatar';
import { avatarColor, birthdayDate, channels, initials } from './contactUtils';

// Goes through the possible duplicates one group at a time: pick the
// contact to keep and merge, or say they are different people. A contact
// that looks like a family member can be linked to them instead.
export default function DuplicatesDialog({ groups, contacts, members: familyList = [], messages, locale, onMerge, onDismiss, onLink, onClose, busy }) {
  const overlayRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const familyMembers = familyList;
  const byId = new Map(contacts.map((contact) => [contact.id, contact]));
  const group = groups[0];
  const groupContacts = group ? group.contact_ids.map((id) => byId.get(id)).filter(Boolean) : [];
  const [keepId, setKeepId] = useState(groupContacts[0]?.id);

  useEffect(() => {
    // The richest contact is the natural one to keep.
    const score = (c) => {
      const { emails, phones } = channels(c);
      return emails.length + phones.length + (c.birthday_month ? 1 : 0) + (c.addresses?.length || 0) + (c.synced ? 2 : 0);
    };
    const best = [...groupContacts].sort((a, b) => score(b) - score(a))[0];
    setKeepId(best?.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group?.contact_ids.join(',')]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onCloseRef.current(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const member = group?.member_user_id ? familyMembers.find((m) => m.user_id === group.member_user_id) : null;
  if (group && member && groupContacts.length === 1) {
    return createPortal(
      <MemberMatch
        {...{ overlayRef, onClose, messages, locale, group, contact: groupContacts[0], member, index: familyMembers.indexOf(member), onDismiss, onLink, busy }}
      />,
      document.body,
    );
  }
  if (!group || groupContacts.length < 2) return null;
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
          {groupContacts.map((contact) => {
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

function birthdayOf(member, locale) {
  const match = String(member?.date_of_birth || '').match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  return match ? `${birthdayDate(Number(match[2]), Number(match[3]), locale)} ${match[1]}` : '';
}

// "Is this contact Hannelore from the family?" Linked, they are one person
// with one birthday.
function MemberMatch({ overlayRef, onClose, messages, locale, group, contact, member, index, onDismiss, onLink, busy }) {
  const { emails, phones } = channels(contact);
  const contactBirthday = contact.birthday_month && contact.birthday_day
    ? `${birthdayDate(contact.birthday_month, contact.birthday_day, locale)}${contact.birthday_year ? ` ${contact.birthday_year}` : ''}`
    : '';
  return (
    <div ref={overlayRef} className="contact-modal-overlay" onClick={(e) => e.target === overlayRef.current && onClose()}>
      <div className="contact-modal-panel contact-duplicates-panel" role="dialog" aria-modal="true" aria-labelledby="contact-member-title">
        <div className="modal-header">
          <h2 id="contact-member-title" className="modal-title">{t(messages, 'module.contacts.member_title')}</h2>
          <button type="button" onClick={onClose} className="btn-ghost modal-close" aria-label={t(messages, 'close')}>
            <X size={18} />
          </button>
        </div>
        <p className="contact-duplicates-hint">
          {t(messages, 'module.contacts.member_hint').replace('{contact}', contact.full_name).replace('{member}', member.display_name)}
        </p>
        <div className="contact-duplicates-reasons">
          {group.reasons.map((reason) => (
            <span key={reason} className="contact-duplicates-reason">{t(messages, `module.contacts.reason_${reason}`)}</span>
          ))}
        </div>
        <div className="contact-member-pair">
          <div className="contact-member-card family">
            <MemberAvatar member={member} index={index} size={36} />
            <span className="contact-duplicate-text">
              <strong>{member.display_name}</strong>
              <span className="contact-member-kind"><Users size={12} aria-hidden="true" /> {t(messages, 'module.birthdays.member_tag')}</span>
              {member.email && <span>{member.email}</span>}
              {birthdayOf(member, locale) && <span>{birthdayOf(member, locale)}</span>}
            </span>
          </div>
          <span className="contact-member-link" aria-hidden="true"><Link2 size={16} /></span>
          <div className="contact-member-card">
            <span className="contact-list-avatar" style={{ background: avatarColor(contact.full_name) }} aria-hidden="true">{initials(contact.full_name)}</span>
            <span className="contact-duplicate-text">
              <strong>{contact.full_name}</strong>
              {contact.synced && <span className="contact-member-kind">{t(messages, 'module.contacts.synced')}</span>}
              {[...phones, ...emails].map((value) => <span key={value}>{value}</span>)}
              {contactBirthday && <span>{contactBirthday}</span>}
            </span>
          </div>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn-ghost" disabled={busy} onClick={() => onDismiss(group)}>
            {t(messages, 'module.contacts.not_duplicates')}
          </button>
          <button type="button" className="btn-primary" disabled={busy} onClick={() => onLink(contact.id, member.user_id)}>
            <Link2 size={15} aria-hidden="true" /> {t(messages, 'module.contacts.member_link')}
          </button>
        </div>
      </div>
    </div>
  );
}
