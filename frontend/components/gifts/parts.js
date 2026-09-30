import {
  Cake, Check, Egg, ExternalLink, Gift, HandHeart, Heart, Lightbulb, Lock, Pencil, PiggyBank, Plus, Trash2,
  TreePine, Undo2, CalendarHeart,
} from 'lucide-react';
import { t, tc } from '../../lib/i18n';
import { canDeleteGift, canEditGift, canSetStatus, claimState, formatPrice, GIFT_STATUSES, parseIsoDate } from '../../lib/gifts';
import { parseServerInstant } from '../../lib/helpers';
import MemberAvatar from '../MemberAvatar';

export const OCCASION_ICON = { birthday: Cake, christmas: TreePine, easter: Egg };

export function occasionLabel(messages, occasion) {
  if (!occasion) return '';
  return t(messages, `module.gifts.occasion.${occasion}`, occasion);
}

export function firstName(name) {
  return String(name || '').split(' ')[0];
}

export function shortDate(value, locale) {
  const date = parseIsoDate(value);
  return date ? date.toLocaleDateString(locale, { day: 'numeric', month: 'short' }) : '';
}

export function relativeDays(days, locale) {
  return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(days, 'day');
}

function siteOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** A calendar leaf: the day big, the month small, in the person's colour. */
export function DateBadge({ date, locale, color }) {
  const value = parseIsoDate(date);
  if (!value) return null;
  return (
    <span className="gifts-date" style={color ? { '--person-color': color } : undefined} aria-hidden="true">
      <span className="gifts-date-month">{value.toLocaleDateString(locale, { month: 'short' }).replace('.', '')}</span>
      <span className="gifts-date-day">{value.getDate()}</span>
    </span>
  );
}

/** The product picture, or a soft tile with the kind's icon. */
export function GiftThumb({ gift, size = 'small' }) {
  const Icon = gift.kind === 'wish' ? Heart : Lightbulb;
  return (
    <span className={`gifts-thumb ${size} ${gift.kind === 'wish' ? 'wish' : 'idea'}`} aria-hidden="true">
      {gift.image ? <img src={gift.image} alt="" loading="lazy" /> : <Icon size={size === 'large' ? 34 : 18} />}
    </span>
  );
}

/** A person's round picture: the member's avatar, or their initial. */
export function PersonAvatar({ member, name, index = 0, size = 36 }) {
  if (member) return <MemberAvatar member={member} index={index} size={size} />;
  return (
    <span className="gifts-initial" style={{ width: size, height: size, fontSize: size * 0.42 }} aria-hidden="true">
      {(String(name || '?').trim()[0] || '?').toUpperCase()}
    </span>
  );
}

export function BudgetBar({ occasion, messages, locale }) {
  if (occasion.budget_cents == null) return null;
  const spent = occasion.spent_cents || 0;
  const over = spent > occasion.budget_cents;
  const share = occasion.budget_cents > 0 ? Math.min(1, spent / occasion.budget_cents) : 1;
  const label = t(messages, 'module.gifts.budget_line')
    .replace('{spent}', formatPrice(spent, 'EUR', locale))
    .replace('{budget}', formatPrice(occasion.budget_cents, 'EUR', locale));
  return (
    <div className={`gifts-budget${over ? ' over' : ''}`}>
      <span className="gifts-budget-line"><PiggyBank size={14} aria-hidden="true" /> {label}</span>
      <span className="rewards-bar" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={occasion.budget_cents} aria-valuenow={spent}>
        <span className="rewards-bar-fill" style={{ width: `${Math.round(share * 100)}%` }} />
      </span>
    </div>
  );
}

/** Who takes care of it, and how far it is; the one thing buyers need to agree on. */
export function ClaimArea({ gift, ctx, compact = false }) {
  const { messages, meId, isAdult, memberById, indexOf, locale, gifts } = ctx;
  const state = claimState(gift, meId);
  if (gift.status === 'gifted') {
    const from = memberById.get(gift.claimed_by_user_id);
    const when = gift.gifted_at ? parseServerInstant(gift.gifted_at).toLocaleDateString(locale, { day: 'numeric', month: 'short' }) : '';
    return (
      <div className="gifts-claim">
        <span className="rewards-pill done"><Gift size={13} aria-hidden="true" /> {when ? t(messages, 'module.gifts.given_on').replace('{date}', when) : t(messages, 'module.gifts.status.gifted')}</span>
        {from && gift.for_me && <span className="gifts-claim-who"><MemberAvatar member={from} index={indexOf(from)} size={20} /> {t(messages, 'module.gifts.given_by').replace('{name}', firstName(from.display_name))}</span>}
        {!gift.for_me && canSetStatus(gift, meId, isAdult) && !compact && (
          <button type="button" className="btn-ghost gifts-undo" onClick={() => gifts.setStatus(gift, 'purchased')}>
            <Undo2 size={14} aria-hidden="true" /> {t(messages, 'module.gifts.not_given')}
          </button>
        )}
      </div>
    );
  }
  if (state === 'hidden') return null;
  if (state === 'open') {
    return (
      <div className="gifts-claim">
        <button type="button" className={`btn-secondary gifts-claim-btn${compact ? ' compact' : ''}`} onClick={() => gifts.claim(gift)}>
          <HandHeart size={15} aria-hidden="true" /> {t(messages, 'module.gifts.claim')}
        </button>
      </div>
    );
  }
  const who = memberById.get(gift.claimed_by_user_id);
  const mine = state === 'mine';
  const statusValue = gift.status;
  return (
    <div className="gifts-claim">
      {(mine || who) && (
        <span className={`gifts-claim-who${mine ? ' mine' : ''}`}>
          {who && <MemberAvatar member={who} index={indexOf(who)} size={22} />}
          {mine ? t(messages, 'module.gifts.claimed_me') : t(messages, 'module.gifts.claimed_by').replace('{name}', firstName(who.display_name))}
        </span>
      )}
      {canSetStatus(gift, meId, isAdult) ? (
        <label className="gifts-status">
          <span className="sr-only">{t(messages, 'module.gifts.status_aria')}</span>
          <select value={statusValue} onChange={(e) => gifts.setStatus(gift, e.target.value)}>
            {GIFT_STATUSES.map((status) => (
              <option key={status} value={status}>{t(messages, status === 'idea' ? 'module.gifts.status_open' : `module.gifts.status.${status}`)}</option>
            ))}
          </select>
        </label>
      ) : (
        <span className="rewards-pill">{t(messages, statusValue === 'idea' ? 'module.gifts.status_open' : `module.gifts.status.${statusValue}`)}</span>
      )}
      {(mine || isAdult) && !compact && (
        <button type="button" className="rewards-icon-btn subtle" onClick={() => gifts.unclaim(gift)} aria-label={t(messages, 'module.gifts.unclaim')} title={t(messages, 'module.gifts.unclaim')}>
          <Undo2 size={15} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

/** A gift as a card: picture, name, price, link and who takes care of it. */
export function GiftCard({ gift, ctx, showRecipient = false }) {
  const { messages, meId, isAdult, locale, onEdit, onDelete, recipientOf } = ctx;
  const site = gift.url ? siteOf(gift.url) : '';
  const recipient = showRecipient ? recipientOf(gift) : null;
  return (
    <article className={`gifts-card ${gift.kind === 'wish' ? 'wish' : 'idea'}${gift.status === 'gifted' ? ' given' : ''}`}>
      <div className={`gifts-card-media${gift.image ? '' : ' no-image'}`}>
        <GiftThumb gift={gift} size="large" />
        <span className={`gifts-kind ${gift.kind === 'wish' ? 'wish' : 'idea'}`}>
          {gift.kind === 'wish' ? <Heart size={12} aria-hidden="true" /> : <Lightbulb size={12} aria-hidden="true" />}
          {t(messages, gift.kind === 'wish' ? 'module.gifts.kind_wish' : 'module.gifts.kind_idea')}
        </span>
        <span className="gifts-card-tools">
          {canEditGift(gift, meId, isAdult) && (
            <button type="button" className="rewards-icon-btn" onClick={() => onEdit(gift)} aria-label={t(messages, 'module.gifts.edit_aria').replace('{title}', gift.title)}>
              <Pencil size={15} aria-hidden="true" />
            </button>
          )}
          {canDeleteGift(gift, meId, isAdult) && (
            <button type="button" className="rewards-icon-btn" onClick={() => onDelete(gift)} aria-label={t(messages, 'module.gifts.delete_aria').replace('{title}', gift.title)}>
              <Trash2 size={15} aria-hidden="true" />
            </button>
          )}
        </span>
      </div>
      <div className="gifts-card-body">
        {recipient && (
          <span className="gifts-card-for">
            <PersonAvatar member={recipient.member} name={recipient.name} index={recipient.index} size={20} />
            {t(messages, 'module.gifts.for_name').replace('{name}', recipient.name)}
          </span>
        )}
        <h3 className="gifts-card-title">{gift.title}</h3>
        {gift.description && <p className="gifts-card-desc">{gift.description}</p>}
        <div className="gifts-card-meta">
          {gift.current_price_cents != null && <strong className="gifts-price">{formatPrice(gift.current_price_cents, gift.currency, locale)}</strong>}
          {gift.url && (
            <a className="gifts-link" href={gift.url} target="_blank" rel="noopener noreferrer">
              {site || t(messages, 'module.gifts.open_link')} <ExternalLink size={12} aria-hidden="true" />
            </a>
          )}
          {gift.occasion && (
            <span className="gifts-card-occasion">
              {occasionLabel(messages, gift.occasion)}{gift.occasion_date ? ` · ${shortDate(gift.occasion_date, locale)}` : ''}
            </span>
          )}
        </div>
        {gift.notes && (
          <p className="gifts-card-notes"><Lock size={12} aria-hidden="true" /> {gift.notes}</p>
        )}
      </div>
      <ClaimArea gift={gift} ctx={ctx} />
    </article>
  );
}

/** One line in an occasion: picture, name, price, who is on it. */
export function GiftRow({ gift, ctx, showRecipient }) {
  const { messages, locale, onEdit, recipientOf, meId, isAdult } = ctx;
  const recipient = showRecipient ? recipientOf(gift) : null;
  const editable = canEditGift(gift, meId, isAdult);
  return (
    <li className={`gifts-row${gift.status === 'gifted' ? ' given' : ''}`}>
      <GiftThumb gift={gift} />
      <button type="button" className="gifts-row-text" onClick={() => editable && onEdit(gift)} disabled={!editable}>
        <strong>{gift.title}</strong>
        <small>
          {recipient && <>{recipient.name}<span aria-hidden="true"> · </span></>}
          {gift.kind === 'wish' ? t(messages, 'module.gifts.kind_wish') : t(messages, 'module.gifts.kind_idea')}
          {gift.current_price_cents != null && <><span aria-hidden="true"> · </span>{formatPrice(gift.current_price_cents, gift.currency, locale)}</>}
        </small>
      </button>
      <ClaimArea gift={gift} ctx={ctx} compact />
    </li>
  );
}

/** An occasion with everything planned for it. */
export function OccasionCard({ occasion, ctx, featured = false }) {
  const { messages, locale, isAdult, giftsById, colorOfKey, nameOfKey, onAdd, onBudget } = ctx;
  const Icon = OCCASION_ICON[occasion.occasion] || CalendarHeart;
  const family = occasion.recipient_key === 'family';
  const name = family ? occasionLabel(messages, occasion.occasion) : (nameOfKey(occasion.recipient_key) || occasion.person_name || '');
  const gifts = occasion.gift_ids.map((id) => giftsById.get(id)).filter(Boolean);
  // Children do not see the grown-ups' ideas, so they cannot tell what is missing.
  const attention = isAdult && !occasion.for_me && !family && occasion.claimed_count === 0;
  const soon = occasion.days_until <= 14;
  const meta = [
    relativeDays(occasion.days_until, locale),
    occasion.turns ? t(messages, 'module.gifts.turns').replace('{age}', occasion.turns) : null,
  ].filter(Boolean).join(' · ');
  return (
    <section
      className={`gifts-occasion${featured ? ' featured' : ''}${occasion.for_me ? ' mine' : ''}${family ? ' family' : ''}`}
      style={{ '--person-color': family ? 'var(--accent-sky)' : colorOfKey(occasion.recipient_key) }}
      aria-label={`${name} · ${occasionLabel(messages, occasion.occasion)}`}
    >
      <div className="gifts-occasion-head">
        <DateBadge date={occasion.date} locale={locale} />
        <div className="gifts-occasion-copy">
          <span className="gifts-occasion-kicker"><Icon size={13} aria-hidden="true" /> {family ? t(messages, 'module.gifts.for_everyone') : occasionLabel(messages, occasion.occasion)}</span>
          <strong>{occasion.for_me ? t(messages, 'module.gifts.my_occasion').replace('{occasion}', occasionLabel(messages, occasion.occasion)) : name}</strong>
          <small>{meta}</small>
        </div>
        {isAdult && !occasion.for_me && (
          <button type="button" className="rewards-icon-btn" onClick={() => onBudget(occasion)} aria-label={t(messages, 'module.gifts.budget_set')} title={t(messages, 'module.gifts.budget_set')}>
            <PiggyBank size={16} aria-hidden="true" />
          </button>
        )}
      </div>

      <div className="gifts-occasion-pills">
        {attention && (
          <span className={`rewards-pill ${soon ? 'rejected' : 'waiting'}`}>{t(messages, 'module.gifts.nothing_yet')}</span>
        )}
        {!occasion.for_me && occasion.gift_count > 0 && (
          <span className="rewards-pill">{tc(messages, 'module.gifts.gift_count', occasion.gift_count)}</span>
        )}
        {!occasion.for_me && occasion.claimed_count > 0 && (
          <span className={`rewards-pill ${occasion.claimed_count === occasion.gift_count ? 'done' : 'approved'}`}>
            <Check size={12} aria-hidden="true" /> {tc(messages, 'module.gifts.claimed_count', occasion.claimed_count)}
          </span>
        )}
        {occasion.wish_count > 0 && (
          <span className="rewards-pill goal"><Heart size={12} aria-hidden="true" /> {tc(messages, occasion.for_me ? 'module.gifts.my_wish_count' : 'module.gifts.open_wishes', occasion.wish_count)}</span>
        )}
      </div>

      <BudgetBar occasion={occasion} messages={messages} locale={locale} />

      {gifts.length > 0 && (
        <ul className="gifts-rows">
          {gifts.slice(0, featured ? 6 : 4).map((gift) => <GiftRow key={gift.id} gift={gift} ctx={ctx} showRecipient={family} />)}
          {gifts.length > (featured ? 6 : 4) && (
            <li className="gifts-rows-more">{t(messages, 'module.gifts.more').replace('{count}', gifts.length - (featured ? 6 : 4))}</li>
          )}
        </ul>
      )}
      {occasion.for_me && gifts.length === 0 && (
        <p className="gifts-occasion-note">{t(messages, 'module.gifts.my_occasion_hint')}</p>
      )}

      <div className="gifts-occasion-foot">
        {occasion.for_me ? (
          <button type="button" className="btn-secondary gifts-add-small" onClick={() => onAdd({ kind: 'wish', occasion })}>
            <Heart size={15} aria-hidden="true" /> {t(messages, 'module.gifts.add_wish')}
          </button>
        ) : (
          <button type="button" className="btn-secondary gifts-add-small" onClick={() => onAdd({ kind: 'idea', occasion })}>
            <Plus size={15} aria-hidden="true" /> {t(messages, 'module.gifts.add_idea')}
          </button>
        )}
      </div>
    </section>
  );
}
