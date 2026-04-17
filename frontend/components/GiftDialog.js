import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { t } from '../lib/i18n';
import { GIFT_STATUSES, GIFT_OCCASIONS } from '../hooks/useGifts';

function statusLabel(messages, status) {
  return t(messages, `module.gifts.status.${status}`);
}

function occasionLabel(messages, occasion) {
  if (!occasion) return '';
  return t(messages, `module.gifts.occasion.${occasion}`, occasion);
}

export default function GiftDialog({ open, onClose, messages, members, form, setForm, onSubmit, isEditing }) {
  const dialogRef = useRef(null);
  const firstFieldRef = useRef(null);
  const previousFocusRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    previousFocusRef.current = document.activeElement;
    firstFieldRef.current?.focus();
    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        onCloseRef.current();
        return;
      }
      if (e.key === 'Tab' && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll(
          'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), a[href]',
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previousFocusRef.current?.focus?.();
    };
  }, [open]);

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
        <form className="gift-form" onSubmit={onSubmit}>
          <div className="gift-form-grid">
            <input
              ref={firstFieldRef}
              className="form-input gift-form-row-full"
              placeholder={t(messages, 'module.gifts.title_placeholder')}
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
              value={form.url}
              onChange={(e) => setForm({ ...form, url: e.target.value })}
            />
            <textarea
              className="form-input gift-form-notes"
              placeholder={t(messages, 'module.gifts.notes_placeholder')}
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
