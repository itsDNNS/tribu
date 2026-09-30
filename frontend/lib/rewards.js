// Rewards around goals: what someone saves for, what the family saves for
// together, and what waits for a grown-up. Pure helpers, shared by the
// rewards page, Today and the family overview.
import { t } from './i18n';

// Icons a wish can wear (stored as these short keys, at most 10 letters).
// Older wishes may carry an emoji instead; those are shown as they are.
export const WISH_ICONS = [
  'gift', 'film', 'icecream', 'game', 'pizza', 'book', 'tent', 'ferris', 'bike', 'palette',
  'music', 'tv', 'cake', 'moon', 'clock', 'sparkles', 'star', 'trophy', 'heart', 'gem',
];

export const CURRENCY_ICONS = ['star', 'gem', 'heart', 'zap', 'trophy'];

/** The family's word for stars: their own, or "Stars" in the reader's language. */
export function currencyName(currency, messages) {
  return (currency?.name || '').trim() || t(messages, 'module.rewards.stars');
}

export function isFamilyGoal(reward) {
  return reward?.kind === 'family';
}

/** Personal wishes one can save for, cheapest first. */
export function personalWishes(catalog = []) {
  return catalog
    .filter((reward) => reward && !isFamilyGoal(reward) && reward.is_active !== false)
    .sort((a, b) => a.cost - b.cost || String(a.name).localeCompare(String(b.name)));
}

/** Family goals still being saved for. */
export function openFamilyGoals(catalog = []) {
  return catalog.filter((reward) => isFamilyGoal(reward) && !reward.achieved_at && reward.is_active !== false);
}

/** Family goals already reached and celebrated, newest first. */
export function achievedFamilyGoals(catalog = []) {
  return catalog
    .filter((reward) => isFamilyGoal(reward) && reward.achieved_at)
    .sort((a, b) => String(b.achieved_at).localeCompare(String(a.achieved_at)));
}

/**
 * Where someone stands with their goal: the wish they chose, else (when
 * `fallback`) the cheapest wish still out of reach.
 */
export function goalFor(balance, catalog = [], { fallback = false } = {}) {
  const points = Math.max(0, Number(balance?.balance) || 0);
  const wishes = personalWishes(catalog);
  let reward = wishes.find((wish) => wish.id === balance?.goal_reward_id) || null;
  const chosen = Boolean(reward);
  if (!reward && fallback && wishes.length) {
    reward = wishes.find((wish) => wish.cost > points) || wishes[wishes.length - 1];
  }
  if (!reward) return null;
  const cost = Number(reward.cost) || 1;
  return {
    reward,
    cost,
    points,
    chosen,
    progress: Math.min(1, points / cost),
    remaining: Math.max(0, cost - points),
    reached: points >= cost,
  };
}

/** How far a family goal is, with each member's share in giving order. */
export function familyGoalProgress(reward) {
  const cost = Math.max(1, Number(reward?.cost) || 1);
  const progress = Math.min(cost, Number(reward?.progress) || 0);
  const shares = (reward?.contributions || [])
    .filter((share) => share.amount > 0)
    .map((share) => ({ ...share, fraction: share.amount / cost }));
  return { cost, progress, missing: cost - progress, fraction: progress / cost, shares, reached: progress >= cost };
}

/**
 * What waits for a grown-up: wishes to approve, stars from tasks to check,
 * and approved wishes not given yet.
 */
export function waitingForAdults(transactions = []) {
  const wishes = transactions.filter((txn) => txn.kind === 'redeem' && txn.status === 'pending');
  const earnings = transactions.filter((txn) => txn.kind === 'earn' && txn.status === 'pending');
  const toGive = transactions.filter((txn) => txn.kind === 'redeem' && txn.status === 'confirmed' && !txn.fulfilled_at);
  return { wishes, earnings, toGive, count: wishes.length + earnings.length + toGive.length };
}

/** Transactions by calendar day, newest day first. */
export function groupByDay(transactions = [], parse = (value) => new Date(value)) {
  const groups = new Map();
  for (const txn of transactions) {
    const date = parse(txn.created_at);
    const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    if (!groups.has(key)) groups.set(key, { date, items: [] });
    groups.get(key).items.push(txn);
  }
  return [...groups.values()];
}

/** The sign a transaction moves the balance by. */
export function transactionSign(txn) {
  return txn.kind === 'earn' ? '+' : '−';
}
