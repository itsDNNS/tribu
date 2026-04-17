import { useRef } from 'react';
import { X, Cake } from 'lucide-react';
import { t } from '../lib/i18n';
import { GIFT_OCCASIONS, GIFT_STATUSES } from '../lib/gifts';
import { useDialogFocusTrap } from '../hooks/useDialogFocusTrap';

function statusLabel(messages, status) {
  return t(messages, `module.gifts.status.${status}`);
}

function occasionLabel(messages, occasion) {
  if (!occasion) return '';
  return t(messages, `module.gifts.occasion.${occasion}`, occasion);
}

export default function GiftDialog({
  open,
  onClose,
  messages,
  members,
  form,
  setForm,
  onSubmit,
  isEditing,
  upcomingBirthdays = [],
  onPickBirthday,
}) {
  const dialogRef = useRef(null);
  const firstFieldRef = useRef(null);
  useDialogFocusTrap({ open, containerRef: dialogRef, initialFocusRef: firstFieldRef, onClose });

  if (!open) return null;

  const titleId = 'gift-dialog-title';
  const heading = isEditing ? t(messages, 'module.gifts.edit_title') : t(messages, 'module.gifts.add');

  return (
    <div className="cal-dialog-backdrop" onClick={onClose}>
      <div
        ref={dialogRef}
        className="gift-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="gift-dialog-header">
          <h2 id={titleId} className="gift-dialog-title">{heading}</h2>
          <button
            type="button"
            className="gift-dialog-close"
            onClick={onClose}
            aria-label={t(messages, 'module.gifts.cancel')}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        {!isEditing && upcomingBirthdays.length > 0 && (
          <div className="gift-birthday-picker" role="group" aria-label={t(messages, 'module.gifts.upcoming_birthdays')}>
            <div className="gift-birthday-picker-label">
              <Cake size={14} aria-hidden="true" />
              {t(messages, 'module.gifts.upcoming_birthdays')}
            </div>
            <div className="gift-birthday-picker-chips">
              {upcomingBirthdays.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  className="gift-birthday-chip"
                  onClick={() => onPickBirthday?.(b)}
                >
                  <span className="gift-birthday-chip-name">{b.person_name}</span>
                  <span className="gift-birthday-chip-date">{b.iso}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        <form className="gift-form" onSubmit={onSubmit}>
          <div className="gift-form-grid">
            <input
              ref={firstFieldRef}
              className="form-input gift-form-row-full"
              placeholder={t(messages, 'module.gifts.title_placeholder')}
              aria-label={t(messages, 'module.gifts.title_aria')}
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              required
              maxLength={200}
            />
            <select
              className="form-input"
              value={form.for_user_id}
              onChange={(e) => setForm({ ...form, for_user_id: e.target.value, for_person_name: '' })}
              aria-label={t(messages, 'module.gifts.recipient')}
            >
              <option value="">{t(messages, 'module.gifts.recipient_any')}</option>
              {members.map((m) => (
                <option key={m.user_id} value={m.user_id}>{m.display_name}</option>
              ))}
            </select>
            <input
              className="form-input"
              placeholder={t(messages, 'module.gifts.external_recipient')}
              aria-label={t(messages, 'module.gifts.external_recipient')}
              value={form.for_person_name}
              onChange={(e) => setForm({ ...form, for_person_name: e.target.value, for_user_id: '' })}
              disabled={!!form.for_user_id}
              maxLength={120}
            />
            <select
              className="form-input"
              value={form.occasion}
              onChange={(e) => setForm({ ...form, occasion: e.target.value })}
              aria-label={t(messages, 'module.gifts.occasion_aria')}
            >
              <option value="">{t(messages, 'module.gifts.occasion_none')}</option>
              {GIFT_OCCASIONS.map((o) => (
                <option key={o} value={o}>{occasionLabel(messages, o)}</option>
              ))}
            </select>
            <input
              className="form-input"
              type="date"
              value={form.occasion_date}
              onChange={(e) => setForm({ ...form, occasion_date: e.target.value })}
              aria-label={t(messages, 'module.gifts.occasion_date')}
            />
            <input
              className="form-input"
              type="number"
              step="0.01"
              min="0"
              placeholder={t(messages, 'module.gifts.price_placeholder')}
              aria-label={t(messages, 'module.gifts.price_aria')}
              value={form.price_eur}
              onChange={(e) => setForm({ ...form, price_eur: e.target.value })}
            />
            <select
              className="form-input"
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
              aria-label={t(messages, 'module.gifts.status_aria')}
            >
              {GIFT_STATUSES.map((s) => (
                <option key={s} value={s}>{statusLabel(messages, s)}</option>
              ))}
            </select>
            <input
              className="form-input gift-form-url"
              type="url"
              placeholder={t(messages, 'module.gifts.url_placeholder')}
              aria-label={t(messages, 'module.gifts.url_aria')}
              value={form.url}
              onChange={(e) => setForm({ ...form, url: e.target.value })}
            />
            <textarea
              className="form-input gift-form-notes"
              placeholder={t(messages, 'module.gifts.notes_placeholder')}
              aria-label={t(messages, 'module.gifts.notes_aria')}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
          <div className="gift-form-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              {t(messages, 'module.gifts.cancel')}
            </button>
            <button type="submit" className="btn btn-primary">
              {isEditing ? t(messages, 'module.gifts.save') : t(messages, 'module.gifts.add')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
