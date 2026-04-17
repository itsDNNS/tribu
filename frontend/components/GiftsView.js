import { useState } from 'react';
import { Sparkles, ExternalLink, Edit2, Trash2, Package, ShoppingBag, Gift as GiftIcon, Plus } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { useGifts, GIFT_STATUSES, GIFT_OCCASIONS } from '../hooks/useGifts';
import { t } from '../lib/i18n';
import MemberAvatar from './MemberAvatar';
import ConfirmDialog from './ConfirmDialog';
import GiftDialog from './GiftDialog';

const STATUS_ICON = {
  idea: Sparkles,
  ordered: ShoppingBag,
  purchased: Package,
  gifted: GiftIcon,
};

const EXAMPLE_OCCASIONS = GIFT_OCCASIONS.filter((o) => o !== 'other');

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
        <div
          className="gift-status-seg"
          role="group"
          aria-label={t(messages, 'module.gifts.status_aria')}
        >
          {GIFT_STATUSES.map((s) => {
            const Icon = STATUS_ICON[s] || Sparkles;
            const active = gift.status === s;
            return (
              <button
                key={s}
                type="button"
                className="gift-status-seg-btn"
                data-status={s}
                aria-pressed={active}
                aria-label={statusLabel(messages, s)}
                onClick={() => { if (!active) onStatusChange(gift.id, s); }}
                title={statusLabel(messages, s)}
              >
                <Icon size={12} aria-hidden="true" />
                <span className="gift-status-seg-label" aria-hidden="true">{statusLabel(messages, s)}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function GiftsView() {
  const { familyId, families, members, messages, isChild, demoMode } = useApp();
  const g = useGifts();
  const [confirmAction, setConfirmAction] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);

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

  function openAddDialog() {
    g.resetForm();
    setDialogOpen(true);
  }

  function openAddDialogWithOccasion(occasion) {
    g.resetForm();
    g.setForm((prev) => ({ ...prev, occasion }));
    setDialogOpen(true);
  }

  function openEditDialog(gift) {
    g.populateForm(gift);
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
    g.resetForm();
  }

  async function handleSubmit(e) {
    const ok = await g.submitGift(e);
    if (ok) setDialogOpen(false);
  }

  const hasFilters = !!g.statusFilter || !!g.recipientFilter || g.includeGifted;

  function clearFilters() {
    g.setStatusFilter('');
    g.setRecipientFilter('');
    g.setIncludeGifted(false);
  }

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

      <GiftDialog
        open={dialogOpen}
        onClose={closeDialog}
        messages={messages}
        members={members}
        form={g.form}
        setForm={g.setForm}
        onSubmit={handleSubmit}
        isEditing={g.editingId != null}
      />

      <div className="view-header">
        <div>
          <h1 className="view-title">{t(messages, 'module.gifts.name')}</h1>
          <div className="view-subtitle">{currentFamilyName}</div>
        </div>
        <div className="gift-view-header-actions">
          <button type="button" className="btn btn-primary" onClick={openAddDialog}>
            <Plus size={16} aria-hidden="true" />
            {t(messages, 'module.gifts.add')}
          </button>
        </div>
      </div>

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
      {!g.loading && g.gifts.length === 0 && (hasFilters ? (
        <div className="gift-empty-filtered">
          <Sparkles size={24} aria-hidden="true" />
          <p>{t(messages, 'module.gifts.empty_filtered')}</p>
          <button type="button" className="gift-empty-filtered-btn" onClick={clearFilters}>
            {t(messages, 'module.gifts.clear_filters')}
          </button>
        </div>
      ) : (
        <div className="gift-empty-rich">
          <span className="gift-empty-icon-wrap">
            <GiftIcon size={36} aria-hidden="true" />
          </span>
          <h2 className="gift-empty-title">{t(messages, 'module.gifts.empty_title')}</h2>
          <p className="gift-empty-body">{t(messages, 'module.gifts.empty_body')}</p>
          <button type="button" className="btn btn-primary gift-empty-cta" onClick={openAddDialog}>
            <Plus size={16} aria-hidden="true" />
            {t(messages, 'module.gifts.add')}
          </button>
          <p className="gift-empty-chip-hint">{t(messages, 'module.gifts.empty_chip_hint')}</p>
          <div className="gift-empty-chips">
            {EXAMPLE_OCCASIONS.map((occ) => (
              <button
                key={occ}
                type="button"
                className="gift-empty-chip"
                onClick={() => openAddDialogWithOccasion(occ)}
              >
                {occasionLabel(messages, occ)}
              </button>
            ))}
          </div>
        </div>
      ))}

      <div className="gift-grid">
        {g.gifts.map((gift) => (
          <GiftCard
            key={gift.id}
            gift={gift}
            members={members}
            messages={messages}
            onEdit={openEditDialog}
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
