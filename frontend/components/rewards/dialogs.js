import { useRef, useState } from 'react';
import { Heart, Trash2 } from 'lucide-react';
import { t } from '../../lib/i18n';
import { CurrencyIcon } from '../../lib/currency-icons';
import { CURRENCY_ICONS, WISH_ICONS } from '../../lib/rewards';
import MemberAvatar from '../MemberAvatar';
import RewardsDialog from './RewardsDialog';
import { Stepper, WishIcon } from './parts';

function Actions({ messages, submitLabel, onClose, disabled, extra }) {
  return (
    <>
      {extra}
      <button type="button" className="btn-ghost" onClick={onClose}>{t(messages, 'cancel')}</button>
      <button type="submit" className="btn-primary" disabled={disabled}>{submitLabel}</button>
    </>
  );
}

/**
 * Praise someone. Everyone can say thank you; grown-ups can add stars,
 * and nothing forces them to: a thank-you is worth it on its own.
 */
export function PraiseDialog({ messages, members, me, canAddStars, presets = [], initialTo, starsName, currency, onSend, onClose }) {
  const others = members.filter((member) => member.user_id !== me?.user_id);
  const [to, setTo] = useState(initialTo || (others.length === 1 ? others[0].user_id : null));
  const [message, setMessage] = useState('');
  const [amount, setAmount] = useState(0);
  const [busy, setBusy] = useState(false);
  const messageRef = useRef(null);

  async function submit() {
    if (!to || !message.trim() || busy) return;
    setBusy(true);
    const ok = await onSend({ toUserId: to, message: message.trim(), amount: canAddStars ? amount : 0 });
    setBusy(false);
    if (ok) onClose();
  }

  return (
    <RewardsDialog
      id="rewards-praise"
      title={t(messages, 'module.rewards.praise_title')}
      closeLabel={t(messages, 'close')}
      onClose={onClose}
      onSubmit={submit}
      initialFocusRef={initialTo ? messageRef : undefined}
      actions={<Actions messages={messages} onClose={onClose} submitLabel={t(messages, 'module.rewards.praise_send')} disabled={!to || !message.trim() || busy} />}
    >
      <fieldset className="rewards-field">
        <legend>{t(messages, 'module.rewards.praise_who')}</legend>
        <div className="rewards-people" role="radiogroup" aria-label={t(messages, 'module.rewards.praise_who')}>
          {others.map((member) => (
            <button
              key={member.user_id}
              type="button"
              role="radio"
              aria-checked={to === member.user_id}
              className={`rewards-person${to === member.user_id ? ' selected' : ''}`}
              onClick={() => { setTo(member.user_id); messageRef.current?.focus(); }}
            >
              <MemberAvatar member={member} index={members.indexOf(member)} size={32} />
              <span>{member.display_name}</span>
            </button>
          ))}
        </div>
      </fieldset>
      <div className="rewards-field">
        <label htmlFor="rewards-praise-message">{t(messages, 'module.rewards.praise_for')}</label>
        <input
          ref={messageRef}
          id="rewards-praise-message"
          className="form-input"
          value={message}
          maxLength={200}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={t(messages, 'module.rewards.praise_placeholder')}
          required
        />
        {presets.length > 0 && (
          <div className="rewards-presets">
            {presets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className="rewards-preset"
                onClick={() => { setMessage(preset.name); if (canAddStars) setAmount(preset.amount); }}
              >
                {preset.name}
                {canAddStars && preset.amount > 0 && <small>+{preset.amount}</small>}
              </button>
            ))}
          </div>
        )}
      </div>
      {canAddStars && (
        <div className="rewards-field">
          <span className="rewards-field-label" id="rewards-praise-stars">{t(messages, 'module.rewards.praise_stars').replace('{currency}', starsName)}</span>
          <div className="rewards-stars-row">
            <Stepper
              value={amount}
              onChange={setAmount}
              min={0}
              max={20}
              label={starsName}
              decrease={t(messages, 'module.rewards.less')}
              increase={t(messages, 'module.rewards.more')}
            />
            <span className="rewards-stars-hint">
              {amount > 0
                ? <><CurrencyIcon icon={currency?.icon} /> {t(messages, 'module.rewards.praise_with_stars').replace('{count}', amount)}</>
                : <><Heart size={14} aria-hidden="true" /> {t(messages, 'module.rewards.praise_no_stars')}</>}
            </span>
          </div>
        </div>
      )}
    </RewardsDialog>
  );
}

/** Add or change a wish or a family goal. */
export function WishDialog({ messages, kind, reward, starsName, onSave, onDelete, onClose }) {
  const [name, setName] = useState(reward?.name || '');
  const [cost, setCost] = useState(reward?.cost || (kind === 'family' ? 30 : 10));
  const [icon, setIcon] = useState(reward?.icon || (kind === 'family' ? 'ferris' : 'gift'));
  const [active, setActive] = useState(reward ? reward.is_active !== false : true);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const nameRef = useRef(null);
  const family = kind === 'family';

  async function submit() {
    if (!name.trim()) return;
    const fields = { name: name.trim(), cost, icon };
    if (reward) fields.is_active = active;
    else fields.kind = kind;
    if (await onSave(reward, fields)) onClose();
  }

  const title = reward
    ? t(messages, family ? 'module.rewards.edit_family_goal' : 'module.rewards.edit_wish')
    : t(messages, family ? 'module.rewards.add_family_goal' : 'module.rewards.add_wish');

  return (
    <RewardsDialog
      id="rewards-wish"
      title={title}
      closeLabel={t(messages, 'close')}
      onClose={onClose}
      onSubmit={submit}
      initialFocusRef={nameRef}
      actions={(
        <Actions
          messages={messages}
          onClose={onClose}
          submitLabel={t(messages, 'module.rewards.save')}
          disabled={!name.trim()}
          extra={reward && (confirmDelete ? (
            <button type="button" className="btn-ghost rewards-danger" onClick={async () => { if (await onDelete(reward.id)) onClose(); }}>
              <Trash2 size={14} aria-hidden="true" /> {t(messages, 'module.rewards.delete_confirm')}
            </button>
          ) : (
            <button type="button" className="btn-ghost rewards-delete-trigger" onClick={() => setConfirmDelete(true)} aria-label={t(messages, 'delete')}>
              <Trash2 size={16} aria-hidden="true" />
            </button>
          ))}
        />
      )}
    >
      <div className="rewards-field">
        <label htmlFor="rewards-wish-name">{t(messages, family ? 'module.rewards.family_goal_name' : 'module.rewards.wish_name')}</label>
        <input
          ref={nameRef}
          id="rewards-wish-name"
          className="form-input"
          value={name}
          maxLength={100}
          onChange={(e) => setName(e.target.value)}
          placeholder={t(messages, family ? 'module.rewards.family_goal_placeholder' : 'module.rewards.wish_placeholder')}
          required
        />
      </div>
      <div className="rewards-field">
        <span className="rewards-field-label">{t(messages, 'module.rewards.wish_cost').replace('{currency}', starsName)}</span>
        <Stepper
          value={cost}
          onChange={setCost}
          min={1}
          max={999}
          label={t(messages, 'module.rewards.wish_cost').replace('{currency}', starsName)}
          decrease={t(messages, 'module.rewards.less')}
          increase={t(messages, 'module.rewards.more')}
        />
        {family && <small className="rewards-field-hint">{t(messages, 'module.rewards.family_goal_hint')}</small>}
      </div>
      <fieldset className="rewards-field">
        <legend>{t(messages, 'module.rewards.wish_icon')}</legend>
        <div className="rewards-icon-grid" role="radiogroup" aria-label={t(messages, 'module.rewards.wish_icon')}>
          {WISH_ICONS.map((key) => (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={icon === key}
              aria-label={t(messages, `module.rewards.icon.${key}`)}
              title={t(messages, `module.rewards.icon.${key}`)}
              className={`rewards-icon-choice${icon === key ? ' selected' : ''}`}
              onClick={() => setIcon(key)}
            >
              <WishIcon icon={key} size={20} />
            </button>
          ))}
        </div>
      </fieldset>
      {reward && !family && (
        <label className="rewards-check">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          <span>{t(messages, 'module.rewards.wish_active')}</span>
        </label>
      )}
    </RewardsDialog>
  );
}

/** Put some of one's own stars into a family goal. */
export function GiveDialog({ messages, goal, balance, starsName, currency, onGive, onClose }) {
  const missing = Math.max(0, goal.cost - (goal.progress || 0));
  const max = Math.max(0, Math.min(balance, missing));
  const [amount, setAmount] = useState(Math.min(max, 1) || 0);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!amount || busy) return;
    setBusy(true);
    const ok = await onGive(goal, amount);
    setBusy(false);
    if (ok) onClose();
  }

  return (
    <RewardsDialog
      id="rewards-give"
      title={t(messages, 'module.rewards.give_title').replace('{goal}', goal.name)}
      closeLabel={t(messages, 'close')}
      onClose={onClose}
      onSubmit={submit}
      actions={<Actions messages={messages} onClose={onClose} submitLabel={t(messages, 'module.rewards.give')} disabled={!amount || busy} />}
    >
      <p className="rewards-dialog-copy">
        {max > 0
          ? t(messages, 'module.rewards.give_hint').replace('{balance}', balance).replace('{missing}', missing).replaceAll('{currency}', starsName)
          : t(messages, 'module.rewards.give_none').replace('{currency}', starsName)}
      </p>
      {max > 0 && (
        <div className="rewards-stars-row">
          <Stepper
            value={amount}
            onChange={setAmount}
            min={1}
            max={max}
            label={starsName}
            decrease={t(messages, 'module.rewards.less')}
            increase={t(messages, 'module.rewards.more')}
          />
          <button type="button" className="btn-ghost rewards-give-all" onClick={() => setAmount(max)}>
            <CurrencyIcon icon={currency?.icon} /> {t(messages, 'module.rewards.give_all').replace('{count}', max)}
          </button>
        </div>
      )}
    </RewardsDialog>
  );
}

/** The family's word and symbol for stars. */
export function StarsDialog({ messages, currency, onSave, onClose }) {
  const [name, setName] = useState(currency?.name || '');
  const [icon, setIcon] = useState(currency?.icon || 'star');
  const nameRef = useRef(null);

  async function submit() {
    if (await onSave({ name: name.trim(), icon })) onClose();
  }

  return (
    <RewardsDialog
      id="rewards-stars"
      title={t(messages, 'module.rewards.stars_title')}
      closeLabel={t(messages, 'close')}
      onClose={onClose}
      onSubmit={submit}
      initialFocusRef={nameRef}
      actions={<Actions messages={messages} onClose={onClose} submitLabel={t(messages, 'module.rewards.save')} />}
    >
      <div className="rewards-field">
        <label htmlFor="rewards-stars-name">{t(messages, 'module.rewards.stars_name')}</label>
        <input
          ref={nameRef}
          id="rewards-stars-name"
          className="form-input"
          value={name}
          maxLength={50}
          onChange={(e) => setName(e.target.value)}
          placeholder={t(messages, 'module.rewards.stars')}
        />
        <small className="rewards-field-hint">{t(messages, 'module.rewards.stars_name_hint')}</small>
      </div>
      <fieldset className="rewards-field">
        <legend>{t(messages, 'module.rewards.stars_icon')}</legend>
        <div className="rewards-icon-grid" role="radiogroup" aria-label={t(messages, 'module.rewards.stars_icon')}>
          {CURRENCY_ICONS.map((key) => (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={icon === key}
              aria-label={t(messages, `module.rewards.icon.${key}`)}
              className={`rewards-icon-choice${icon === key ? ' selected' : ''}`}
              onClick={() => setIcon(key)}
            >
              <CurrencyIcon icon={key} size={20} />
            </button>
          ))}
        </div>
      </fieldset>
    </RewardsDialog>
  );
}
