import { useState } from 'react';
import {
  Check, CheckSquare, Gift, HandHeart, Heart, Hourglass, PartyPopper, Pencil, Plus,
  Settings2, Star, Target, Trash2, Users, X,
} from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { useRewards } from '../hooks/useRewards';
import { CurrencyIcon } from '../lib/currency-icons';
import { localeForLang } from '../lib/dates';
import { parseServerInstant, serverTimeAgo } from '../lib/helpers';
import { t } from '../lib/i18n';
import { getMemberColor } from '../lib/member-colors';
import {
  achievedFamilyGoals, currencyName, familyGoalProgress, goalFor, groupByDay,
  openFamilyGoals, personalWishes, transactionSign, waitingForAdults,
} from '../lib/rewards';
import MemberAvatar from './MemberAvatar';
import { GiveDialog, PraiseDialog, StarsDialog, WishDialog } from './rewards/dialogs';
import { Progress, SectionTitle, Stars, WishIcon } from './rewards/parts';

function firstName(member) {
  return (member?.display_name || '').split(' ')[0] || '';
}

/**
 * Rewards around goals: everyone collects stars (grown-ups too), saves for
 * a wish of their own and puts stars into goals the family reaches
 * together. Praise needs no stars; a thank-you counts on its own.
 */
export default function RewardsView() {
  const { messages, members = [], me, isChild, tasks, lang } = useApp();
  const rw = useRewards();
  const [tab, setTab] = useState('overview');
  const [dialog, setDialog] = useState(null);
  const locale = localeForLang(lang);
  const isAdult = !isChild;
  const starsName = currencyName(rw.currency, messages);
  const memberById = new Map(members.map((member) => [member.user_id, member]));
  const indexOf = (member) => Math.max(0, members.indexOf(member));
  const colorOf = (member) => (member ? getMemberColor(member, indexOf(member)) : 'var(--accent-amber)');
  const waiting = isAdult ? waitingForAdults(rw.transactions) : { wishes: [], earnings: [], toGive: [], count: 0 };
  const stars = (amount, sign = '') => <Stars currency={rw.currency} name={starsName} amount={amount} sign={sign} />;

  if (rw.loading) {
    return (
      <div className="rewards-page">
        <header className="list-header"><h1>{t(messages, 'module.rewards.name')}</h1></header>
        <section className="rewards-card">
          <div className="skeleton skeleton-text rewards-widget-skeleton-line" />
          <div className="skeleton skeleton-text rewards-widget-skeleton-line short" />
        </section>
      </div>
    );
  }

  const openPraise = (to) => setDialog({ type: 'praise', to });
  const tabs = [
    ['overview', t(messages, 'module.rewards.tab_overview'), waiting.count],
    ['wishes', t(messages, 'module.rewards.tab_wishes'), 0],
    ['history', t(messages, 'module.rewards.tab_history'), 0],
  ];

  return (
    <div className="rewards-page">
      <header className="list-header rewards-header">
        <h1>{t(messages, 'module.rewards.name')}</h1>
        <div className="rewards-header-actions">
          {isAdult ? (
            <button type="button" className="rewards-currency-chip" onClick={() => setDialog({ type: 'stars' })} aria-label={t(messages, 'module.rewards.stars_title')}>
              <CurrencyIcon icon={rw.currency?.icon} /> {starsName} <Settings2 size={14} aria-hidden="true" />
            </button>
          ) : (
            <span className="rewards-currency-chip"><CurrencyIcon icon={rw.currency?.icon} /> {starsName}</span>
          )}
          <button type="button" className="list-header-action" onClick={() => openPraise(null)}>
            <HandHeart size={17} aria-hidden="true" /> {t(messages, 'module.rewards.praise')}
          </button>
        </div>
      </header>

      <div className="rewards-tabs" role="tablist" aria-label={t(messages, 'module.rewards.name')}>
        {tabs.map(([key, label, badge]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            className={`rewards-tab${tab === key ? ' active' : ''}`}
            onClick={() => setTab(key)}
          >
            {label}
            {badge > 0 && <span className="rewards-tab-badge" aria-label={t(messages, 'module.rewards.waiting_count').replace('{count}', badge)}>{badge}</span>}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <Overview
          {...{ rw, messages, members, me, isAdult, tasks, lang, locale, starsName, stars, waiting, memberById, colorOf, indexOf, openPraise, setDialog, setTab }}
        />
      )}
      {tab === 'wishes' && (
        <Wishes {...{ rw, messages, isAdult, locale, starsName, stars, colorOf, memberById, setDialog }} />
      )}
      {tab === 'history' && (
        <History {...{ rw, messages, members, memberById, indexOf, locale, lang, stars }} />
      )}

      {dialog?.type === 'praise' && (
        <PraiseDialog
          messages={messages}
          members={members}
          me={me}
          canAddStars={isAdult}
          presets={rw.rules}
          initialTo={dialog.to}
          starsName={starsName}
          currency={rw.currency}
          onSend={rw.sendPraise}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.type === 'wish' && (
        <WishDialog
          messages={messages}
          kind={dialog.kind}
          reward={dialog.reward}
          starsName={starsName}
          onSave={rw.saveReward}
          onDelete={rw.deleteReward}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.type === 'give' && (
        <GiveDialog
          messages={messages}
          goal={dialog.goal}
          balance={rw.myBalance?.balance || 0}
          starsName={starsName}
          currency={rw.currency}
          onGive={rw.giveToGoal}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.type === 'stars' && (
        <StarsDialog messages={messages} currency={rw.currency} onSave={rw.updateCurrency} onClose={() => setDialog(null)} />
      )}
    </div>
  );
}

/* ── Overview ─────────────────────────────────────────────── */

function Overview({ rw, messages, members, me, isAdult, tasks, lang, starsName, stars, waiting, memberById, colorOf, indexOf, openPraise, setDialog, setTab }) {
  const meMember = memberById.get(me?.user_id) || me;
  const goals = openFamilyGoals(rw.catalog);
  const earnTasks = (tasks || []).filter((task) => task.status === 'open' && task.token_reward_amount > 0
    && (isAdult || task.assigned_to_user_id === me?.user_id));

  return (
    <div className="rewards-overview">
      <div className={`rewards-top${waiting.count > 0 ? ' with-waiting' : ''}`}>
        <MyGoal {...{ rw, messages, me: meMember, color: colorOf(meMember), starsName, setTab }} />
        {waiting.count > 0 && <Waiting {...{ rw, messages, waiting, memberById, indexOf, stars }} />}
      </div>

      {goals.map((goal) => (
        <FamilyGoal key={goal.id} {...{ goal, rw, messages, isAdult, stars, memberById, colorOf, setDialog }} />
      ))}
      {goals.length === 0 && isAdult && (
        <button type="button" className="rewards-family-cta" onClick={() => setDialog({ type: 'wish', kind: 'family' })}>
          <span className="rewards-family-cta-icon"><Users size={20} aria-hidden="true" /></span>
          <span>
            <strong>{t(messages, 'module.rewards.family_goal_cta')}</strong>
            <small>{t(messages, 'module.rewards.family_goal_cta_hint').replace('{currency}', starsName)}</small>
          </span>
          <Plus size={18} aria-hidden="true" />
        </button>
      )}

      {isAdult && rw.balances.length > 0 && (
        <section className="rewards-section" aria-labelledby="rewards-family-title">
          <SectionTitle><span id="rewards-family-title">{t(messages, 'module.rewards.family_title')}</span></SectionTitle>
          <div className="rewards-members">
            {rw.balances.map((balance) => {
              const member = memberById.get(balance.user_id) || { display_name: balance.display_name };
              const goal = goalFor(balance, rw.catalog);
              return (
                <article key={balance.user_id} className="rewards-member" style={{ '--person-color': colorOf(member) }}>
                  <div className="rewards-member-head">
                    <MemberAvatar member={member} index={indexOf(member)} size={36} />
                    <div className="rewards-member-name">
                      <strong>{member.display_name}</strong>
                      <span>{stars(balance.balance)}{balance.pending > 0 && <small> · {t(messages, 'module.rewards.pending').replace('{count}', balance.pending)}</small>}</span>
                    </div>
                    <button
                      type="button"
                      className="rewards-icon-btn"
                      onClick={() => openPraise(balance.user_id)}
                      aria-label={t(messages, 'module.rewards.praise_member').replace('{name}', firstName(member))}
                      disabled={balance.user_id === me?.user_id}
                    >
                      <HandHeart size={17} aria-hidden="true" />
                    </button>
                  </div>
                  {goal ? (
                    <div className="rewards-member-goal">
                      <span className="rewards-member-goal-name"><WishIcon icon={goal.reward.icon} size={14} /> {goal.reward.name}</span>
                      <Progress value={goal.progress} color={colorOf(member)} label={goal.reward.name} max={goal.cost} now={goal.points} />
                      <small>{goal.reached ? t(messages, 'module.rewards.goal_reached_short') : t(messages, 'module.rewards.goal_left').replace('{count}', goal.remaining)}</small>
                    </div>
                  ) : (
                    <p className="rewards-member-nogoal">{t(messages, 'module.rewards.no_goal_yet')}</p>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      )}

      <div className="rewards-lower">
        <PraiseFeed {...{ rw, messages, me, isAdult, lang, memberById, indexOf, stars, openPraise }} />
        {earnTasks.length > 0 && (
          <section className="rewards-section rewards-card" aria-labelledby="rewards-earn-title">
            <SectionTitle><span id="rewards-earn-title">{t(messages, 'module.rewards.earn_title')}</span></SectionTitle>
            <ul className="rewards-earn-list">
              {earnTasks.map((task) => {
                const assignee = memberById.get(task.assigned_to_user_id);
                return (
                  <li key={task.id} className="rewards-earn-row">
                    <CheckSquare size={16} aria-hidden="true" />
                    <span className="rewards-earn-title">{task.title}</span>
                    {assignee && isAdult && <MemberAvatar member={assignee} index={indexOf(assignee)} size={22} />}
                    <span className="rewards-plus">{stars(task.token_reward_amount, '+')}</span>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}

function MyGoal({ rw, messages, me, color, starsName, setTab }) {
  const balance = rw.myBalance || { balance: 0, pending: 0 };
  const goal = goalFor(balance, rw.catalog);
  const asked = goal && rw.transactions.some((txn) => txn.kind === 'redeem' && txn.status === 'pending'
    && txn.source_reward_id === goal.reward.id && txn.user_id === me?.user_id);
  return (
    <section className={`rewards-hero${goal?.reached ? ' reached' : ''}`} style={{ '--person-color': color }} aria-labelledby="rewards-hero-title">
      <div className="rewards-hero-head">
        <div>
          <h2 id="rewards-hero-title" className="rewards-hero-kicker">{t(messages, 'module.rewards.my_stars').replace('{currency}', starsName)}</h2>
          <div className="rewards-hero-value">
            <CurrencyIcon icon={rw.currency?.icon} label={starsName} />
            <span>{balance.balance}</span>
          </div>
          {balance.pending > 0 && (
            <p className="rewards-hero-pending"><Hourglass size={13} aria-hidden="true" /> {t(messages, 'module.rewards.pending').replace('{count}', balance.pending)}</p>
          )}
        </div>
        {goal && <span className="rewards-hero-wish"><WishIcon icon={goal.reward.icon} size={30} /></span>}
      </div>
      {goal ? (
        <div className="rewards-hero-goal">
          <div className="rewards-hero-goal-line">
            <span className="rewards-hero-goal-label">{t(messages, 'module.rewards.my_goal')}</span>
            <strong>{goal.reward.name}</strong>
            <span className="rewards-hero-count">{Math.min(goal.points, goal.cost)} / {goal.cost}</span>
          </div>
          <Progress value={goal.progress} color={color} label={goal.reward.name} max={goal.cost} now={goal.points} />
          <div className="rewards-hero-foot">
            {goal.reached ? (
              asked ? (
                <span className="rewards-pill waiting"><Hourglass size={13} aria-hidden="true" /> {t(messages, 'module.rewards.waiting_approval')}</span>
              ) : (
                <>
                  <span className="rewards-pill done"><PartyPopper size={13} aria-hidden="true" /> {t(messages, 'module.rewards.goal_reached')}</span>
                  <button type="button" className="btn-primary rewards-redeem" onClick={() => rw.redeem(goal.reward)}>
                    <Gift size={15} aria-hidden="true" /> {t(messages, 'module.rewards.redeem')}
                  </button>
                </>
              )
            ) : (
              <span className="rewards-hero-left">{t(messages, 'module.rewards.goal_left_long').replace('{count}', goal.remaining).replace('{currency}', starsName)}</span>
            )}
            <button type="button" className="btn-ghost rewards-link" onClick={() => setTab('wishes')}>{t(messages, 'module.rewards.change_goal')}</button>
          </div>
        </div>
      ) : (
        <div className="rewards-hero-empty">
          <Target size={18} aria-hidden="true" />
          <span>{t(messages, 'module.rewards.pick_goal')}</span>
          <button type="button" className="btn-secondary rewards-link-btn" onClick={() => setTab('wishes')}>{t(messages, 'module.rewards.see_wishes')}</button>
        </div>
      )}
    </section>
  );
}

function Waiting({ rw, messages, waiting, memberById, indexOf, stars }) {
  const who = (userId) => memberById.get(userId) || { display_name: '' };
  const row = (txn, text, actions, icon) => {
    const member = who(txn.user_id);
    return (
      <li key={txn.id} className="rewards-waiting-row">
        <MemberAvatar member={member} index={indexOf(member)} size={30} />
        <span className="rewards-waiting-text">
          {text}
          <small>{icon}{stars(txn.amount, txn.kind === 'earn' ? '+' : '')}</small>
        </span>
        <span className="rewards-waiting-actions">{actions}</span>
      </li>
    );
  };
  const decide = (txn) => (
    <>
      <button type="button" className="rewards-icon-btn yes" onClick={() => rw.confirmTxn(txn.id)} aria-label={t(messages, 'module.rewards.approve')}>
        <Check size={17} aria-hidden="true" />
      </button>
      <button type="button" className="rewards-icon-btn no" onClick={() => rw.rejectTxn(txn.id)} aria-label={t(messages, 'module.rewards.reject')}>
        <X size={17} aria-hidden="true" />
      </button>
    </>
  );
  return (
    <section className="rewards-card rewards-waiting" aria-labelledby="rewards-waiting-title">
      <SectionTitle><span id="rewards-waiting-title">{t(messages, 'module.rewards.waiting_title')}</span></SectionTitle>
      <ul className="rewards-waiting-list">
        {waiting.wishes.map((txn) => row(
          txn,
          t(messages, 'module.rewards.waiting_wish').replace('{name}', firstName(who(txn.user_id))).replace('{wish}', txn.note || ''),
          decide(txn),
          <Gift size={12} aria-hidden="true" />,
        ))}
        {waiting.earnings.map((txn) => row(
          txn,
          `${firstName(who(txn.user_id))}: ${txn.note || t(messages, 'module.rewards.txn_earn')}`,
          decide(txn),
          null,
        ))}
        {waiting.toGive.map((txn) => row(
          txn,
          t(messages, 'module.rewards.waiting_give').replace('{name}', firstName(who(txn.user_id))).replace('{wish}', txn.note || ''),
          <button type="button" className="btn-secondary rewards-given-btn" onClick={() => rw.fulfillTxn(txn.id)}>
            <Check size={14} aria-hidden="true" /> {t(messages, 'module.rewards.mark_given')}
          </button>,
          <Gift size={12} aria-hidden="true" />,
        ))}
      </ul>
    </section>
  );
}

function FamilyGoal({ goal, rw, messages, isAdult, stars, memberById, colorOf, setDialog, compact = false }) {
  const state = familyGoalProgress(goal);
  let offset = 0;
  return (
    <section className={`rewards-family-goal${state.reached ? ' reached' : ''}${compact ? ' compact' : ''}`} aria-label={goal.name}>
      <div className="rewards-family-head">
        <span className="rewards-family-icon"><WishIcon icon={goal.icon} size={compact ? 22 : 28} /></span>
        <div className="rewards-family-copy">
          <span className="rewards-family-kicker"><Users size={13} aria-hidden="true" /> {t(messages, 'module.rewards.family_goal')}</span>
          <strong>{goal.name}</strong>
          <span className="rewards-family-count">
            {t(messages, 'module.rewards.family_goal_count').replace('{progress}', state.progress).replace('{cost}', state.cost)} {stars('')}
          </span>
        </div>
        {isAdult && (
          <button type="button" className="rewards-icon-btn" onClick={() => setDialog({ type: 'wish', kind: 'family', reward: goal })} aria-label={t(messages, 'module.rewards.edit_family_goal')}>
            <Pencil size={16} aria-hidden="true" />
          </button>
        )}
      </div>
      <div
        className="rewards-family-bar"
        role="progressbar"
        aria-label={goal.name}
        aria-valuemin={0}
        aria-valuemax={state.cost}
        aria-valuenow={state.progress}
      >
        {state.shares.map((share) => {
          const member = memberById.get(share.user_id);
          const left = offset;
          offset += share.fraction;
          return (
            <span
              key={share.user_id}
              className="rewards-family-share"
              style={{ left: `${left * 100}%`, width: `${share.fraction * 100}%`, background: colorOf(member) }}
            />
          );
        })}
      </div>
      <div className="rewards-family-foot">
        <ul className="rewards-family-legend">
          {state.shares.map((share) => {
            const member = memberById.get(share.user_id);
            return (
              <li key={share.user_id} style={{ '--person-color': colorOf(member) }}>
                <span className="rewards-legend-dot" aria-hidden="true" />
                {firstName(member)} <strong>{share.amount}</strong>
              </li>
            );
          })}
        </ul>
        {state.reached ? (
          isAdult ? (
            <button type="button" className="btn-primary rewards-celebrate" onClick={() => rw.achieveGoal(goal)}>
              <PartyPopper size={15} aria-hidden="true" /> {t(messages, 'module.rewards.celebrate')}
            </button>
          ) : (
            <span className="rewards-pill done"><PartyPopper size={13} aria-hidden="true" /> {t(messages, 'module.rewards.family_goal_full')}</span>
          )
        ) : (
          <button
            type="button"
            className="btn-secondary rewards-give-btn"
            onClick={() => setDialog({ type: 'give', goal })}
            disabled={!rw.myBalance?.balance}
          >
            <Plus size={15} aria-hidden="true" /> {t(messages, 'module.rewards.give_stars')}
          </button>
        )}
      </div>
    </section>
  );
}

function PraiseFeed({ rw, messages, me, isAdult, lang, memberById, indexOf, stars, openPraise }) {
  return (
    <section className="rewards-section rewards-card rewards-praise" aria-labelledby="rewards-praise-title">
      <SectionTitle
        action={(
          <button type="button" className="btn-ghost rewards-link" onClick={() => openPraise(null)}>
            <HandHeart size={15} aria-hidden="true" /> {t(messages, 'module.rewards.praise')}
          </button>
        )}
      >
        <span id="rewards-praise-title">{t(messages, 'module.rewards.praise_feed')}</span>
      </SectionTitle>
      {rw.praise.length === 0 ? (
        <p className="rewards-empty-note">{t(messages, 'module.rewards.praise_empty')}</p>
      ) : (
        <ul className="rewards-praise-list">
          {rw.praise.slice(0, 12).map((item) => {
            const from = memberById.get(item.from_user_id);
            const to = memberById.get(item.to_user_id);
            const canDelete = isAdult || item.from_user_id === me?.user_id;
            return (
              <li key={item.id} className="rewards-praise-item">
                <MemberAvatar member={from || { display_name: '?' }} index={indexOf(from)} size={30} />
                <div className="rewards-praise-body">
                  <span className="rewards-praise-meta">
                    {t(messages, 'module.rewards.praise_line').replace('{from}', firstName(from)).replace('{to}', firstName(to))}
                    <span aria-hidden="true"> · </span>
                    <time dateTime={item.created_at}>{serverTimeAgo(item.created_at, lang)}</time>
                  </span>
                  <p className="rewards-praise-bubble">{item.message}</p>
                </div>
                <span className={`rewards-praise-tag${item.amount > 0 ? ' stars' : ''}`}>
                  {item.amount > 0 ? stars(item.amount, '+') : <Heart size={15} aria-label={t(messages, 'module.rewards.praise_no_stars')} />}
                </span>
                {canDelete && (
                  <button type="button" className="rewards-icon-btn subtle" onClick={() => rw.deletePraise(item)} aria-label={t(messages, 'module.rewards.praise_delete')}>
                    <Trash2 size={14} aria-hidden="true" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/* ── Wishes ───────────────────────────────────────────────── */

function Wishes({ rw, messages, isAdult, locale, starsName, stars, colorOf, memberById, setDialog }) {
  const balance = rw.myBalance || { balance: 0 };
  const wishes = isAdult
    ? rw.catalog.filter((reward) => reward.kind !== 'family').sort((a, b) => a.cost - b.cost)
    : personalWishes(rw.catalog);
  const goals = openFamilyGoals(rw.catalog);
  const achieved = achievedFamilyGoals(rw.catalog);
  const asked = new Set(rw.transactions
    .filter((txn) => txn.kind === 'redeem' && txn.status === 'pending' && txn.user_id === rw.myBalance?.user_id)
    .map((txn) => txn.source_reward_id));
  const [presetName, setPresetName] = useState('');
  const [presetAmount, setPresetAmount] = useState(0);

  return (
    <div className="rewards-wishes">
      <section className="rewards-section" aria-labelledby="rewards-goals-title">
        <SectionTitle
          action={isAdult && (
            <button type="button" className="btn-secondary rewards-add" onClick={() => setDialog({ type: 'wish', kind: 'family' })}>
              <Plus size={15} aria-hidden="true" /> {t(messages, 'module.rewards.add_family_goal')}
            </button>
          )}
        >
          <span id="rewards-goals-title">{t(messages, 'module.rewards.family_goals')}</span>
        </SectionTitle>
        {goals.length === 0 && <p className="rewards-empty-note">{t(messages, 'module.rewards.family_goals_empty')}</p>}
        <div className="rewards-family-grid">
          {goals.map((goal) => (
            <FamilyGoal key={goal.id} compact {...{ goal, rw, messages, isAdult, stars, memberById, colorOf, setDialog }} />
          ))}
        </div>
        {achieved.length > 0 && (
          <ul className="rewards-achieved">
            {achieved.map((goal) => (
              <li key={goal.id}>
                <PartyPopper size={14} aria-hidden="true" />
                <strong>{goal.name}</strong>
                <span>{t(messages, 'module.rewards.achieved_on').replace('{date}', parseServerInstant(goal.achieved_at).toLocaleDateString(locale, { day: 'numeric', month: 'long' }))}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rewards-section" aria-labelledby="rewards-wishlist-title">
        <SectionTitle
          action={isAdult && (
            <button type="button" className="btn-secondary rewards-add" onClick={() => setDialog({ type: 'wish', kind: 'personal' })}>
              <Plus size={15} aria-hidden="true" /> {t(messages, 'module.rewards.add_wish')}
            </button>
          )}
        >
          <span id="rewards-wishlist-title">{t(messages, 'module.rewards.wishes')}</span>
        </SectionTitle>
        {wishes.length === 0 && <p className="rewards-empty-note">{t(messages, isAdult ? 'module.rewards.wishes_empty_adult' : 'module.rewards.wishes_empty')}</p>}
        <div className="rewards-wish-grid">
          {wishes.map((wish) => {
            const mine = balance.goal_reward_id === wish.id;
            const paused = wish.is_active === false;
            const progress = Math.min(1, (balance.balance || 0) / wish.cost);
            const canRedeem = !paused && (balance.balance || 0) >= wish.cost && !asked.has(wish.id);
            return (
              <article key={wish.id} className={`rewards-wish${mine ? ' mine' : ''}${paused ? ' paused' : ''}`}>
                <div className="rewards-wish-top">
                  <span className="rewards-wish-icon"><WishIcon icon={wish.icon} size={24} /></span>
                  {mine && <span className="rewards-pill goal"><Target size={12} aria-hidden="true" /> {t(messages, 'module.rewards.my_goal')}</span>}
                  {paused && <span className="rewards-pill">{t(messages, 'module.rewards.paused')}</span>}
                  {isAdult && (
                    <button type="button" className="rewards-icon-btn subtle" onClick={() => setDialog({ type: 'wish', kind: 'personal', reward: wish })} aria-label={t(messages, 'module.rewards.edit_wish')}>
                      <Pencil size={15} aria-hidden="true" />
                    </button>
                  )}
                </div>
                <strong className="rewards-wish-name">{wish.name}</strong>
                <span className="rewards-wish-cost">{stars(wish.cost)}</span>
                {!paused && <Progress value={progress} label={wish.name} max={wish.cost} now={Math.min(wish.cost, balance.balance || 0)} />}
                {!paused && (
                  <div className="rewards-wish-actions">
                    <button
                      type="button"
                      className={`btn-ghost rewards-goal-toggle${mine ? ' active' : ''}`}
                      aria-pressed={mine}
                      onClick={() => rw.setGoal(mine ? null : wish.id)}
                    >
                      <Target size={14} aria-hidden="true" /> {t(messages, mine ? 'module.rewards.is_goal' : 'module.rewards.set_goal')}
                    </button>
                    {asked.has(wish.id) ? (
                      <span className="rewards-pill waiting"><Hourglass size={12} aria-hidden="true" /> {t(messages, 'module.rewards.waiting_approval')}</span>
                    ) : (
                      <button type="button" className="btn-secondary rewards-redeem-btn" disabled={!canRedeem} onClick={() => rw.redeem(wish)}>
                        <Gift size={14} aria-hidden="true" /> {t(messages, 'module.rewards.redeem')}
                      </button>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>

      {isAdult && (
        <section className="rewards-section rewards-card" aria-labelledby="rewards-presets-title">
          <SectionTitle><span id="rewards-presets-title">{t(messages, 'module.rewards.presets_title')}</span></SectionTitle>
          <p className="rewards-section-hint">{t(messages, 'module.rewards.presets_hint')}</p>
          <ul className="rewards-preset-list">
            {rw.rules.map((rule) => (
              <li key={rule.id} className="rewards-preset-chip">
                <span>{rule.name}</span>
                {rule.amount > 0 ? <small>{stars(rule.amount, '+')}</small> : <Heart size={13} aria-hidden="true" />}
                <button type="button" onClick={() => rw.deleteRule(rule.id)} aria-label={t(messages, 'aria.delete_item').replace('{name}', rule.name)}>
                  <X size={13} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
          <form
            className="rewards-preset-form"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!presetName.trim()) return;
              if (await rw.createRule(presetName.trim(), presetAmount)) { setPresetName(''); setPresetAmount(0); }
            }}
          >
            <input
              className="form-input"
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              placeholder={t(messages, 'module.rewards.preset_placeholder')}
              aria-label={t(messages, 'module.rewards.preset_name')}
              maxLength={100}
            />
            <label className="rewards-preset-amount">
              <Star size={14} aria-hidden="true" />
              <input
                type="number"
                min={0}
                max={20}
                value={presetAmount}
                onChange={(e) => setPresetAmount(Math.max(0, Math.min(20, parseInt(e.target.value, 10) || 0)))}
                aria-label={starsName}
              />
            </label>
            <button type="submit" className="btn-secondary" disabled={!presetName.trim()}>
              <Plus size={15} aria-hidden="true" /> {t(messages, 'module.rewards.preset_add')}
            </button>
          </form>
        </section>
      )}
    </div>
  );
}

/* ── History ──────────────────────────────────────────────── */

function History({ rw, messages, memberById, indexOf, locale, stars }) {
  const days = groupByDay(rw.transactions, parseServerInstant);
  const today = new Date();
  const dayLabel = (date) => {
    const diff = Math.round((new Date(today.getFullYear(), today.getMonth(), today.getDate()) - new Date(date.getFullYear(), date.getMonth(), date.getDate())) / 86400000);
    if (diff === 0) return t(messages, 'module.rewards.today');
    if (diff === 1) return t(messages, 'module.rewards.yesterday');
    return date.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' });
  };
  const kindIcon = { earn: <Star size={15} />, redeem: <Gift size={15} />, give: <Users size={15} /> };
  const status = (txn) => {
    if (txn.status === 'pending') return ['waiting', t(messages, 'module.rewards.txn_pending')];
    if (txn.status === 'rejected') return ['rejected', t(messages, 'module.rewards.txn_rejected')];
    if (txn.kind === 'redeem') return txn.fulfilled_at ? ['done', t(messages, 'module.rewards.txn_given')] : ['approved', t(messages, 'module.rewards.txn_approved')];
    return null;
  };
  if (days.length === 0) {
    return <p className="rewards-empty-note rewards-card">{t(messages, 'module.rewards.history_empty')}</p>;
  }
  return (
    <div className="rewards-history">
      {days.map((day) => (
        <section key={day.date.toISOString()} className="rewards-history-day">
          <h2 className="rewards-section-title">{dayLabel(day.date)}</h2>
          <ul className="rewards-card rewards-history-list">
            {day.items.map((txn) => {
              const member = memberById.get(txn.user_id) || { display_name: '' };
              const pill = status(txn);
              const fallback = { earn: 'module.rewards.txn_earn', redeem: 'module.rewards.txn_redeem', give: 'module.rewards.txn_give' }[txn.kind];
              return (
                <li key={txn.id} className={`rewards-history-row kind-${txn.kind}`}>
                  <span className="rewards-history-icon" aria-hidden="true">{kindIcon[txn.kind] || <Star size={15} />}</span>
                  <MemberAvatar member={member} index={indexOf(member)} size={24} />
                  <span className="rewards-history-text">
                    <strong>{txn.note || t(messages, fallback)}</strong>
                    <small>{member.display_name}{txn.kind === 'give' ? ` · ${t(messages, 'module.rewards.txn_give')}` : ''}</small>
                  </span>
                  {pill && <span className={`rewards-pill ${pill[0]}`}>{pill[1]}</span>}
                  <span className={`rewards-history-amount${txn.kind === 'earn' ? ' plus' : ''}`}>{stars(txn.amount, transactionSign(txn))}</span>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
