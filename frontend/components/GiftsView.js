import { useState } from 'react';
import { Sparkles, ExternalLink, Edit2, Trash2, X, Check, Package, ShoppingBag, Gift as GiftIcon } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { useGifts, GIFT_STATUSES, GIFT_OCCASIONS } from '../hooks/useGifts';
import { t } from '../lib/i18n';
import MemberAvatar from './MemberAvatar';
import ConfirmDialog from './ConfirmDialog';

const STATUS_ICON = {
  idea: Sparkles,
  ordered: ShoppingBag,
  purchased: Package,
  gifted: GiftIcon,
};

function formatPrice(cents, currency) {
  if (cents == null) return '';
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency || 'EUR' }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency || 'EUR'}`;
  }
}

function statusLabel(messages, status) {
  return t(messages, `module.gifts.status.${status}`);
}

function occasionLabel(messages, occasion) {
  if (!occasion) return '';
  return t(messages, `module.gifts.occasion.${occasion}`, occasion);
}

function GiftCard({ gift, members, messages, onEdit, onDelete, onStatusChange }) {
  const recipient = gift.for_user_id ? members.find((m) => m.user_id === gift.for_user_id) : null;
  const recipientIdx = recipient ? members.indexOf(recipient) : 0;
  const StatusIcon = STATUS_ICON[gift.status] || Sparkles;

  return (
    <div className={`gift-card gift-status-${gift.status}`}>
      <div className="gift-card-header">
        <div className="gift-card-title-row">
          <StatusIcon size={16} className="gift-status-icon" aria-hidden="true" />
          <h3 className="gift-card-title">{gift.title}</h3>
        </div>
        <div className="gift-card-actions">
          <button
            type="button"
            className="gift-card-action"
            onClick={() => onEdit(gift)}
            aria-label={t(messages, 'module.gifts.edit_aria').replace('{title}', gift.title)}
          >
            <Edit2 size={14} />
          </button>
          <button
            type="button"
            className="gift-card-action gift-card-action-danger"
            onClick={() => onDelete(gift)}
            aria-label={t(messages, 'module.gifts.delete_aria').replace('{title}', gift.title)}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {gift.description && <p className="gift-card-description">{gift.description}</p>}

      <div className="gift-card-meta">
        {recipient && (
          <span className="gift-card-recipient">
            <MemberAvatar member={recipient} index={recipientIdx} size={20} />
            <span>{recipient.display_name}</span>
          </span>
        )}
        {!recipient && gift.for_person_name && (
          <span className="gift-card-recipient-text">{gift.for_person_name}</span>
        )}
        {gift.occasion && (
          <span className="gift-card-occasion">{occasionLabel(messages, gift.occasion)}</span>
        )}
        {gift.occasion_date && (
          <span className="gift-card-date">{gift.occasion_date}</span>
        )}
        {gift.current_price_cents != null && (
          <span className="gift-card-price">{formatPrice(gift.current_price_cents, gift.currency)}</span>
        )}
      </div>

      {gift.url && (
        <a className="gift-card-link" href={gift.url} target="_blank" rel="noopener noreferrer">
          <ExternalLink size={12} aria-hidden="true" />
          {t(messages, 'module.gifts.open_link')}
        </a>
      )}

      {gift.notes && <p className="gift-card-notes">{gift.notes}</p>}

      <div className="gift-card-footer">
        <select
          className="gift-status-select"
          value={gift.status}
          onChange={(e) => onStatusChange(gift.id, e.target.value)}
          aria-label={t(messages, 'module.gifts.status_aria')}
        >
          {GIFT_STATUSES.map((s) => (
            <option key={s} value={s}>{statusLabel(messages, s)}</option>
          ))}
        </select>
      </div>
    </div>
  );
}

export default function GiftsView() {
  const { familyId, families, members, messages, isChild, demoMode } = useApp();
  const g = useGifts();
  const [confirmAction, setConfirmAction] = useState(null);

  if (isChild || demoMode) {
    const label = isChild ? 'module.gifts.adult_only' : 'module.gifts.demo_blocked';
    return (
      <div className="view">
        <div className="view-header">
          <h1 className="view-title">{t(messages, 'module.gifts.name')}</h1>
        </div>
        <div className="empty-state">
          <Sparkles size={32} aria-hidden="true" />
          <p>{t(messages, label)}</p>
        </div>
      </div>
    );
  }

  const currentFamilyName = families.find((f) => String(f.family_id) === String(familyId))?.family_name || '';
  const isEditing = g.editingId != null;
  const adultMembers = members.filter((m) => m.is_adult !== false);

  return (
    <div>
      {confirmAction && (
        <ConfirmDialog
          title={confirmAction.title}
          message={confirmAction.message}
          confirmDanger={confirmAction.danger}
          onConfirm={confirmAction.action}
          onCancel={() => setConfirmAction(null)}
          messages={messages}
        />
      )}

      <div className="view-header">
        <div>
          <h1 className="view-title">{t(messages, 'module.gifts.name')}</h1>
          <div className="view-subtitle">{currentFamilyName}</div>
        </div>
      </div>

      <form className="gift-form" onSubmit={g.submitGift}>
        <div className="gift-form-grid">
          <input
            className="form-input"
            placeholder={t(messages, 'module.gifts.title_placeholder')}
            value={g.form.title}
            onChange={(e) => g.setForm({ ...g.form, title: e.target.value })}
            required
            maxLength={200}
          />
          <select
            className="form-input"
            value={g.form.for_user_id}
            onChange={(e) => g.setForm({ ...g.form, for_user_id: e.target.value, for_person_name: '' })}
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
            value={g.form.for_person_name}
            onChange={(e) => g.setForm({ ...g.form, for_person_name: e.target.value, for_user_id: '' })}
            disabled={!!g.form.for_user_id}
            maxLength={120}
          />
          <select
            className="form-input"
            value={g.form.occasion}
            onChange={(e) => g.setForm({ ...g.form, occasion: e.target.value })}
          >
            <option value="">{t(messages, 'module.gifts.occasion_none')}</option>
            {GIFT_OCCASIONS.map((o) => (
              <option key={o} value={o}>{occasionLabel(messages, o)}</option>
            ))}
          </select>
          <input
            className="form-input"
            type="date"
            value={g.form.occasion_date}
            onChange={(e) => g.setForm({ ...g.form, occasion_date: e.target.value })}
            aria-label={t(messages, 'module.gifts.occasion_date')}
          />
          <input
            className="form-input"
            type="number"
            step="0.01"
            min="0"
            placeholder={t(messages, 'module.gifts.price_placeholder')}
            value={g.form.price_eur}
            onChange={(e) => g.setForm({ ...g.form, price_eur: e.target.value })}
          />
          <input
            className="form-input gift-form-url"
            type="url"
            placeholder={t(messages, 'module.gifts.url_placeholder')}
            value={g.form.url}
            onChange={(e) => g.setForm({ ...g.form, url: e.target.value })}
          />
          <select
            className="form-input"
            value={g.form.status}
            onChange={(e) => g.setForm({ ...g.form, status: e.target.value })}
            aria-label={t(messages, 'module.gifts.status_aria')}
          >
            {GIFT_STATUSES.map((s) => (
              <option key={s} value={s}>{statusLabel(messages, s)}</option>
            ))}
          </select>
          <textarea
            className="form-input gift-form-notes"
            placeholder={t(messages, 'module.gifts.notes_placeholder')}
            value={g.form.notes}
            onChange={(e) => g.setForm({ ...g.form, notes: e.target.value })}
          />
        </div>
        <div className="gift-form-actions">
          <button type="submit" className="btn btn-primary">
            {isEditing ? t(messages, 'module.gifts.save') : t(messages, 'module.gifts.add')}
          </button>
          {isEditing && (
            <button type="button" className="btn btn-secondary" onClick={g.resetForm}>
              <X size={14} />
              {t(messages, 'module.gifts.cancel')}
            </button>
          )}
        </div>
      </form>

      <div className="gift-filters">
        <select
          className="form-input"
          value={g.statusFilter}
          onChange={(e) => g.setStatusFilter(e.target.value)}
          aria-label={t(messages, 'module.gifts.filter_status')}
        >
          <option value="">{t(messages, 'module.gifts.filter_all_statuses')}</option>
          {GIFT_STATUSES.map((s) => (
            <option key={s} value={s}>{statusLabel(messages, s)}</option>
          ))}
        </select>
        <select
          className="form-input"
          value={g.recipientFilter}
          onChange={(e) => g.setRecipientFilter(e.target.value)}
          aria-label={t(messages, 'module.gifts.filter_recipient')}
        >
          <option value="">{t(messages, 'module.gifts.filter_all_recipients')}</option>
          {members.map((m) => (
            <option key={m.user_id} value={m.user_id}>{m.display_name}</option>
          ))}
        </select>
        <label className="gift-filter-toggle">
          <input
            type="checkbox"
            checked={g.includeGifted}
            onChange={(e) => g.setIncludeGifted(e.target.checked)}
          />
          {t(messages, 'module.gifts.filter_include_gifted')}
        </label>
      </div>

      {g.loading && <p className="gift-loading">{t(messages, 'module.gifts.loading')}</p>}
      {!g.loading && g.gifts.length === 0 && (
        <div className="empty-state">
          <Sparkles size={32} aria-hidden="true" />
          <p>{t(messages, 'module.gifts.empty')}</p>
        </div>
      )}

      <div className="gift-grid">
        {g.gifts.map((gift) => (
          <GiftCard
            key={gift.id}
            gift={gift}
            members={members}
            messages={messages}
            onEdit={g.populateForm}
            onStatusChange={g.updateStatus}
            onDelete={(target) =>
              setConfirmAction({
                title: t(messages, 'module.gifts.delete_title'),
                message: t(messages, 'module.gifts.delete_confirm').replace('{title}', target.title),
                danger: true,
                action: async () => {
                  await g.deleteGift(target.id);
                  setConfirmAction(null);
                },
              })
            }
          />
        ))}
      </div>
    </div>
  );
}
