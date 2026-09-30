import { ArrowLeft, Cake, Mail, MapPin, Pencil, Phone, RefreshCw, StickyNote } from 'lucide-react';
import { t } from '../../lib/i18n';
import { avatarColor, birthdayDate, channels, daysUntil, initials, turningAge } from './contactUtils';

// Everything about one contact, with calling and writing one tap away.
export default function ContactDetail({ contact, messages, locale, canEdit, onEdit, onBack }) {
  const { emails, phones } = channels(contact);
  const hasBirthday = contact.birthday_month && contact.birthday_day;
  const days = hasBirthday ? daysUntil(contact.birthday_month, contact.birthday_day) : null;
  const turns = hasBirthday ? turningAge(contact.birthday_year, contact.birthday_month, contact.birthday_day) : null;

  return (
    <section className="contact-detail-pane" aria-labelledby="contact-detail-name">
      {onBack && (
        <button type="button" className="btn-ghost contact-detail-back" onClick={onBack}>
          <ArrowLeft size={16} aria-hidden="true" /> {t(messages, 'module.contacts.back')}
        </button>
      )}
      <header className="contact-detail-head">
        <div className="contact-detail-avatar" style={{ background: avatarColor(contact.full_name) }} aria-hidden="true">
          {initials(contact.full_name)}
        </div>
        <div className="contact-detail-title">
          <h2 id="contact-detail-name">{contact.full_name}</h2>
          {contact.organization && <p className="contact-detail-org">{contact.organization}</p>}
          {contact.synced && (
            <span className="contact-detail-source"><RefreshCw size={12} aria-hidden="true" /> {t(messages, 'module.contacts.synced')}</span>
          )}
        </div>
      </header>

      <div className="contact-detail-actions">
        {phones[0] && (
          <a className="btn-secondary" href={`tel:${phones[0].replace(/\s+/g, '')}`}>
            <Phone size={15} aria-hidden="true" /> {t(messages, 'module.contacts.call')}
          </a>
        )}
        {emails[0] && (
          <a className="btn-secondary" href={`mailto:${emails[0]}`}>
            <Mail size={15} aria-hidden="true" /> {t(messages, 'module.contacts.email_action')}
          </a>
        )}
        {canEdit && (
          <button type="button" className="btn-secondary" onClick={() => onEdit(contact)}>
            <Pencil size={15} aria-hidden="true" /> {t(messages, 'module.contacts.edit')}
          </button>
        )}
      </div>

      <dl className="contact-detail-fields">
        {phones.length > 0 && (
          <div className="contact-detail-field">
            <dt><Phone size={14} aria-hidden="true" /> {t(messages, 'module.contacts.form.phone')}</dt>
            {phones.map((phone) => (
              <dd key={phone}><a href={`tel:${phone.replace(/\s+/g, '')}`}>{phone}</a></dd>
            ))}
          </div>
        )}
        {emails.length > 0 && (
          <div className="contact-detail-field">
            <dt><Mail size={14} aria-hidden="true" /> {t(messages, 'module.contacts.form.email')}</dt>
            {emails.map((email) => (
              <dd key={email}><a href={`mailto:${email}`}>{email}</a></dd>
            ))}
          </div>
        )}
        {hasBirthday && (
          <div className="contact-detail-field">
            <dt><Cake size={14} aria-hidden="true" /> {t(messages, 'module.contacts.form.birthday')}</dt>
            <dd>
              {birthdayDate(contact.birthday_month, contact.birthday_day, locale)}
              {contact.birthday_year ? ` ${contact.birthday_year}` : ''}
              <span className="contact-detail-note">
                {' · '}
                {days === 0 ? t(messages, 'module.birthdays.today') : t(messages, 'module.birthdays.days_until').replace('{days}', days)}
                {turns !== null && ` · ${t(messages, 'module.contacts.turns').replace('{age}', turns)}`}
              </span>
            </dd>
          </div>
        )}
        {contact.addresses?.length > 0 && (
          <div className="contact-detail-field">
            <dt><MapPin size={14} aria-hidden="true" /> {t(messages, 'module.contacts.addresses')}</dt>
            {contact.addresses.map((address) => <dd key={address}>{address}</dd>)}
          </div>
        )}
        {contact.note && (
          <div className="contact-detail-field">
            <dt><StickyNote size={14} aria-hidden="true" /> {t(messages, 'module.contacts.note')}</dt>
            <dd className="contact-detail-multiline">{contact.note}</dd>
          </div>
        )}
      </dl>
    </section>
  );
}
