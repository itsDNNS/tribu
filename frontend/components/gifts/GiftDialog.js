import { useMemo, useRef, useState } from 'react';
import { Heart, Lightbulb, Link2, Loader2, Lock, Trash2, Wand2, X } from 'lucide-react';
import { t } from '../../lib/i18n';
import { errorText } from '../../lib/helpers';
import {
  centsToInput, createEmptyGiftForm, formFromGift, GIFT_OCCASIONS, isoDate, nextBirthday, nextHoliday,
  payloadFromForm, startOfToday, birthdayKey, recipientKey, recipientLinks,
} from '../../lib/gifts';
import RewardsDialog from '../rewards/RewardsDialog';
import MemberAvatar from '../MemberAvatar';
import { occasionLabel } from './parts';

/**
 * Add or change an idea or a wish. A product link comes first: Tribu reads
 * the name, the picture and the price from the shop's page.
 */
export default function GiftDialog({
  messages, members, contacts, birthdays, me, isAdult, gift, initial, onSave, onDelete, onPreview, onClose,
}) {
  const meId = me?.user_id;
  const editing = Boolean(gift);
  const forMe = Boolean(gift?.for_me);
  const [form, setForm] = useState(() => (gift ? formFromGift(gift) : createEmptyGiftForm(initial || {})));
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [site, setSite] = useState('');
  const titleRef = useRef(null);
  const set = (patch) => setForm((prev) => ({ ...prev, ...patch }));
  const links = useMemo(() => recipientLinks(contacts, members), [contacts, members]);
  const today = startOfToday();

  const ownWish = form.kind === 'wish' && (form.recipient === `u:${meId}` || forMe);
  // Children wish for themselves; an idea is never for oneself.
  const canPickRecipient = !forMe && (isAdult || form.kind === 'idea');
  const people = members.filter((member) => (form.kind === 'idea' ? member.user_id !== meId : true));
  const recipientName = (() => {
    if (form.recipient.startsWith('u:')) return members.find((member) => `u:${member.user_id}` === form.recipient)?.display_name || '';
    if (form.recipient.startsWith('c:')) return contacts.find((contact) => `c:${contact.id}` === form.recipient)?.full_name || '';
    return form.recipient === 'name' ? form.for_person_name : '';
  })();

  function birthdayDateFor(recipient, name) {
    const key = recipient === 'name' ? recipientKey({ for_person_name: name }, links) : recipient;
    const birthday = birthdays.find((item) => birthdayKey(item, links).key === key);
    return birthday ? isoDate(nextBirthday(birthday.month, birthday.day, today)) : '';
  }

  function pickKind(kind) {
    const patch = { kind };
    if (kind === 'wish' && !isAdult) patch.recipient = `u:${meId}`;
    if (kind === 'idea' && form.recipient === `u:${meId}`) patch.recipient = '';
    if (kind === 'wish' && !form.recipient) patch.recipient = `u:${meId}`;
    set(patch);
  }

  function pickRecipient(recipient) {
    const patch = { recipient };
    if (form.occasion === 'birthday') patch.occasion_date = birthdayDateFor(recipient, form.for_person_name);
    set(patch);
  }

  function typeName(value) {
    const contact = contacts.find((item) => item.full_name.toLocaleLowerCase() === value.trim().toLocaleLowerCase());
    const recipient = contact ? (contact.member_user_id ? `u:${contact.member_user_id}` : `c:${contact.id}`) : 'name';
    const patch = { for_person_name: value, recipient: recipient === `u:${meId}` && form.kind === 'idea' ? 'name' : recipient };
    if (form.occasion === 'birthday') patch.occasion_date = birthdayDateFor(patch.recipient, value);
    set(patch);
  }

  function pickOccasion(occasion) {
    const patch = { occasion };
    if (occasion === 'birthday') patch.occasion_date = birthdayDateFor(form.recipient, form.for_person_name) || form.occasion_date;
    else if (occasion === 'christmas' || occasion === 'easter') patch.occasion_date = isoDate(nextHoliday(occasion, today));
    else if (!occasion) patch.occasion_date = '';
    set(patch);
  }

  async function readLink() {
    const url = form.url.trim();
    if (!/^https?:\/\//i.test(url) || reading) return;
    setReading(true);
    setPreviewError('');
    const { ok, data } = await onPreview(url);
    setReading(false);
    if (!ok) {
      setPreviewError(errorText(data?.detail, t(messages, 'module.gifts.preview_failed'), messages));
      return;
    }
    setSite(data.site || '');
    set({
      title: form.title.trim() ? form.title : (data.title || ''),
      image: data.image || form.image,
      price: data.price_cents != null ? centsToInput(data.price_cents) : form.price,
      currency: data.currency || form.currency,
    });
    titleRef.current?.focus();
  }

  async function submit() {
    if (!form.title.trim() || busy) return;
    if (form.recipient === 'name' && !form.for_person_name.trim()) return;
    setBusy(true);
    const payload = payloadFromForm(form, { includeNotes: !ownWish });
    if (editing) {
      if (forMe) {
        for (const key of ['kind', 'for_user_id', 'for_contact_id', 'for_person_name']) delete payload[key];
      } else if (!isAdult && gift.created_by_user_id !== meId) {
        delete payload.kind;
      }
    }
    const ok = await onSave(payload, gift);
    setBusy(false);
    if (ok) onClose();
  }

  const heading = editing
    ? t(messages, form.kind === 'wish' ? 'module.gifts.edit_wish' : 'module.gifts.edit_idea')
    : t(messages, form.kind === 'wish' ? 'module.gifts.new_wish' : 'module.gifts.new_idea');
  const hint = form.kind === 'wish'
    ? t(messages, ownWish ? 'module.gifts.wish_hint_own' : 'module.gifts.wish_hint')
    : (recipientName ? t(messages, 'module.gifts.idea_hint_name').replace('{name}', recipientName.split(' ')[0]) : t(messages, 'module.gifts.idea_hint'));

  return (
    <RewardsDialog
      id="gifts-edit"
      title={heading}
      closeLabel={t(messages, 'close')}
      onClose={onClose}
      onSubmit={submit}
      initialFocusRef={editing ? titleRef : undefined}
      actions={(
        <>
          {editing && onDelete && (
            <button type="button" className="btn-ghost rewards-danger" onClick={() => onDelete(gift)}>
              <Trash2 size={15} aria-hidden="true" /> {t(messages, 'module.gifts.delete')}
            </button>
          )}
          <button type="button" className="btn-ghost" onClick={onClose}>{t(messages, 'cancel')}</button>
          <button type="submit" className="btn-primary" disabled={!form.title.trim() || busy}>
            {editing ? t(messages, 'module.gifts.save') : t(messages, form.kind === 'wish' ? 'module.gifts.add_wish' : 'module.gifts.add_idea')}
          </button>
        </>
      )}
    >
      {!editing || (isAdult && !forMe) ? (
        <div className="gifts-kind-toggle" role="radiogroup" aria-label={t(messages, 'module.gifts.kind_label')}>
          {[['idea', Lightbulb, 'module.gifts.kind_idea'], ['wish', Heart, 'module.gifts.kind_wish']].map(([kind, Icon, label]) => (
            <button
              key={kind}
              type="button"
              role="radio"
              aria-checked={form.kind === kind}
              className={`gifts-kind-option ${kind}${form.kind === kind ? ' active' : ''}`}
              onClick={() => pickKind(kind)}
            >
              <Icon size={16} aria-hidden="true" /> {t(messages, label)}
            </button>
          ))}
        </div>
      ) : null}
      <p className="gifts-dialog-hint"><Lock size={13} aria-hidden="true" /> {hint}</p>

      <div className="rewards-field">
        <label className="rewards-field-label" htmlFor="gift-url">{t(messages, 'module.gifts.link_label')}</label>
        <div className="gifts-link-row">
          <span className="gifts-link-input">
            <Link2 size={16} aria-hidden="true" />
            <input
              id="gift-url"
              type="url"
              inputMode="url"
              className="form-input"
              placeholder="https://"
              value={form.url}
              onChange={(e) => { set({ url: e.target.value }); setPreviewError(''); }}
              onPaste={(e) => {
                const pasted = e.clipboardData?.getData('text') || '';
                if (/^https?:\/\//i.test(pasted.trim())) setTimeout(() => document.getElementById('gift-read-link')?.click(), 0);
              }}
            />
          </span>
          <button
            id="gift-read-link"
            type="button"
            className="btn-secondary gifts-read-btn"
            onClick={readLink}
            disabled={!/^https?:\/\//i.test(form.url.trim()) || reading}
          >
            {reading ? <Loader2 size={15} className="gifts-spin" aria-hidden="true" /> : <Wand2 size={15} aria-hidden="true" />}
            {t(messages, 'module.gifts.read_link')}
          </button>
        </div>
        {previewError && <span className="gifts-field-error" role="alert">{previewError}</span>}
        {!previewError && !form.image && <span className="rewards-field-hint">{t(messages, 'module.gifts.link_hint')}</span>}
      </div>

      {form.image && (
        <div className="gifts-preview">
          <img src={form.image} alt="" />
          <span className="gifts-preview-copy">
            <strong>{form.title || t(messages, 'module.gifts.title_label')}</strong>
            {site && <small>{site}</small>}
          </span>
          <button type="button" className="rewards-icon-btn subtle" onClick={() => set({ image: null })} aria-label={t(messages, 'module.gifts.remove_image')}>
            <X size={15} aria-hidden="true" />
          </button>
        </div>
      )}

      <div className="rewards-field">
        <label className="rewards-field-label" htmlFor="gift-title">{t(messages, 'module.gifts.title_label')}</label>
        <input
          id="gift-title"
          ref={titleRef}
          className="form-input"
          value={form.title}
          onChange={(e) => set({ title: e.target.value })}
          placeholder={t(messages, 'module.gifts.title_placeholder')}
          maxLength={200}
          required
        />
      </div>

      {canPickRecipient && (
        <fieldset className="rewards-field">
          <legend>{t(messages, form.kind === 'wish' ? 'module.gifts.wish_for' : 'module.gifts.idea_for')}</legend>
          <div className="rewards-people" role="radiogroup" aria-label={t(messages, 'module.gifts.recipient')}>
            {people.map((member) => {
              const value = `u:${member.user_id}`;
              return (
                <button
                  key={member.user_id}
                  type="button"
                  role="radio"
                  aria-checked={form.recipient === value}
                  className={`rewards-person${form.recipient === value ? ' selected' : ''}`}
                  onClick={() => pickRecipient(value)}
                >
                  <MemberAvatar member={member} index={members.indexOf(member)} size={30} />
                  {member.user_id === meId ? t(messages, 'module.gifts.me') : member.display_name.split(' ')[0]}
                </button>
              );
            })}
            <button
              type="button"
              role="radio"
              aria-checked={!form.recipient.startsWith('u:') && form.recipient !== ''}
              className={`rewards-person gifts-someone${!form.recipient.startsWith('u:') && form.recipient !== '' ? ' selected' : ''}`}
              onClick={() => typeName(form.for_person_name || '')}
            >
              {t(messages, 'module.gifts.someone_else')}
            </button>
          </div>
          {(form.recipient === 'name' || form.recipient.startsWith('c:')) && (
            <>
              <input
                className="form-input"
                list="gift-contacts"
                value={form.for_person_name || recipientName}
                onChange={(e) => typeName(e.target.value)}
                placeholder={t(messages, 'module.gifts.someone_placeholder')}
                aria-label={t(messages, 'module.gifts.someone_else')}
                maxLength={120}
              />
              <datalist id="gift-contacts">
                {contacts.map((contact) => <option key={contact.id} value={contact.full_name} />)}
              </datalist>
            </>
          )}
        </fieldset>
      )}

      <fieldset className="rewards-field">
        <legend>{t(messages, 'module.gifts.occasion_label')}</legend>
        <div className="rewards-presets" role="radiogroup" aria-label={t(messages, 'module.gifts.occasion_label')}>
          {['', ...GIFT_OCCASIONS].map((occasion) => (
            <button
              key={occasion || 'none'}
              type="button"
              role="radio"
              aria-checked={form.occasion === occasion}
              className={`rewards-preset gifts-occasion-chip${form.occasion === occasion ? ' selected' : ''}`}
              onClick={() => pickOccasion(occasion)}
            >
              {occasion ? occasionLabel(messages, occasion) : t(messages, 'module.gifts.occasion_none')}
            </button>
          ))}
        </div>
        {form.occasion === 'other' && (
          <input
            className="form-input"
            value={form.occasion_label}
            onChange={(e) => set({ occasion_label: e.target.value })}
            placeholder={t(messages, 'module.gifts.occasion_other_placeholder')}
            aria-label={t(messages, 'module.gifts.occasion_other_placeholder')}
            maxLength={40}
          />
        )}
        {form.occasion && (
          <label className="gifts-inline-field">
            <span>{t(messages, 'module.gifts.occasion_date')}</span>
            <input className="form-input" type="date" value={form.occasion_date} onChange={(e) => set({ occasion_date: e.target.value })} />
          </label>
        )}
      </fieldset>

      <div className="gifts-two">
        <div className="rewards-field">
          <label className="rewards-field-label" htmlFor="gift-price">{t(messages, 'module.gifts.price_label')}</label>
          <span className="gifts-price-input">
            <input
              id="gift-price"
              className="form-input"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={form.price}
              onChange={(e) => set({ price: e.target.value })}
              placeholder="0,00"
            />
            <span aria-hidden="true">{form.currency || 'EUR'}</span>
          </span>
        </div>
      </div>

      <div className="rewards-field">
        <label className="rewards-field-label" htmlFor="gift-description">{t(messages, 'module.gifts.details_label')}</label>
        <textarea
          id="gift-description"
          className="form-input"
          rows={2}
          value={form.description}
          onChange={(e) => set({ description: e.target.value })}
          placeholder={t(messages, 'module.gifts.details_placeholder')}
        />
      </div>

      {!ownWish && (
        <div className="rewards-field">
          <label className="rewards-field-label" htmlFor="gift-notes">{t(messages, 'module.gifts.notes_label')}</label>
          <textarea
            id="gift-notes"
            className="form-input"
            rows={2}
            value={form.notes}
            onChange={(e) => set({ notes: e.target.value })}
            placeholder={t(messages, 'module.gifts.notes_placeholder')}
          />
          <span className="rewards-field-hint">{t(messages, 'module.gifts.notes_hint')}</span>
        </div>
      )}
    </RewardsDialog>
  );
}

/** An occasion's budget; only grown-ups see it. */
export function BudgetDialog({ messages, occasion, title, onSave, onClose }) {
  const [amount, setAmount] = useState(occasion.budget_cents != null ? String(Math.round(occasion.budget_cents / 100)) : '');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);

  async function save(value) {
    if (busy) return;
    setBusy(true);
    const ok = await onSave(occasion, value);
    setBusy(false);
    if (ok) onClose();
  }

  const cents = amount.trim() === '' ? null : Math.round(Number(amount.replace(',', '.')) * 100);
  return (
    <RewardsDialog
      id="gifts-budget"
      title={t(messages, 'module.gifts.budget_title').replace('{name}', title)}
      closeLabel={t(messages, 'close')}
      onClose={onClose}
      onSubmit={() => save(Number.isFinite(cents) ? cents : null)}
      initialFocusRef={inputRef}
      actions={(
        <>
          {occasion.budget_cents != null && (
            <button type="button" className="btn-ghost rewards-danger" onClick={() => save(null)}>
              {t(messages, 'module.gifts.budget_remove')}
            </button>
          )}
          <button type="button" className="btn-ghost" onClick={onClose}>{t(messages, 'cancel')}</button>
          <button type="submit" className="btn-primary" disabled={busy || (cents != null && !Number.isFinite(cents))}>{t(messages, 'module.gifts.save')}</button>
        </>
      )}
    >
      <p className="rewards-dialog-copy">{t(messages, 'module.gifts.budget_hint')}</p>
      <div className="rewards-field">
        <label className="rewards-field-label" htmlFor="gift-budget">{t(messages, 'module.gifts.budget_label')}</label>
        <span className="gifts-price-input">
          <input
            id="gift-budget"
            ref={inputRef}
            className="form-input"
            type="number"
            inputMode="decimal"
            min="0"
            step="1"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <span aria-hidden="true">EUR</span>
        </span>
      </div>
    </RewardsDialog>
  );
}
