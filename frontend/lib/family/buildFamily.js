// The family hub (Tribu 2.0, F1–F3): each person's day, the birthdays ahead
// with their gift ideas and the children's way to the next reward. The
// Flutter app's lib/features/family/family_hub_model.dart follows the same
// rules and shared cases (familyCases.json).
import { buildToday } from '../today/buildToday';

export const BIRTHDAY_WINDOW_DAYS = 60;
export const MAX_BIRTHDAYS = 5;

function pad(value) {
  return String(value).padStart(2, '0');
}

function isoDate(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function sameName(a, b) {
  const left = String(a || '').trim().toLocaleLowerCase();
  const right = String(b || '').trim().toLocaleLowerCase();
  return Boolean(left) && left === right;
}

// A member answers to their full name and to their first name.
function isMemberNamed(member, name) {
  const full = member?.display_name || '';
  return sameName(full, name) || sameName(full.split(' ')[0], name);
}

// What is still ahead today: events that have not ended yet, timed ones
// first, then the all-day ones.
function upcomingEvents(day, nowTime) {
  const events = day.today.filter((item) => item.kind === 'event');
  const timed = events.filter((item) => item.time && (item.endTime ? item.endTime > nowTime : item.time >= nowTime));
  const allDay = events.filter((item) => !item.time);
  return [...timed, ...allDay];
}

// The cheapest reward still out of reach, or the dearest one once all are.
export function nextGoal(points, rewards) {
  const active = rewards
    .filter((reward) => reward && reward.is_active !== false && Number(reward.cost) > 0)
    .sort((a, b) => Number(a.cost) - Number(b.cost) || String(a.name).localeCompare(String(b.name)));
  if (!active.length) return null;
  const target = active.find((reward) => Number(reward.cost) > points) || active[active.length - 1];
  const cost = Number(target.cost);
  return { name: target.name, cost, progress: Math.min(1, points / cost), reached: points >= cost };
}

function nextOccurrence(today, month, day) {
  const [year] = today.split('-').map(Number);
  let date = new Date(year, month - 1, day);
  if (isoDate(date) < today) date = new Date(year + 1, month - 1, day);
  const [y, m, d] = today.split('-').map(Number);
  const daysUntil = Math.round((date.getTime() - new Date(y, m - 1, d).getTime()) / 86400000);
  return { date: isoDate(date), daysUntil };
}

/**
 * @param {object} input
 * @param {Date} input.now
 * @param {Array} input.events today's calendar occurrences
 * @param {Array} input.tasks tasks (status, assigned_to_user_id, due_date)
 * @param {Array} input.members family members (user_id, display_name, is_adult, date_of_birth)
 * @param {Array|null} input.balances reward balances (user_id, balance), null without a currency
 * @param {Array} input.rewards reward catalog (name, cost, is_active)
 * @param {Array} input.birthdays family birthdays (person_name, month, day)
 * @param {Array} input.gifts gift ideas (status, for_user_id, for_person_name)
 */
export function buildFamily({
  now = new Date(), events = [], tasks = [], members = [], balances = null, rewards = [], birthdays = [], gifts = [],
}) {
  const nowTime = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const today = isoDate(now);

  const people = members.map((member) => {
    const day = buildToday({ now, events, tasks, members, memberId: member.user_id, days: 1 });
    const upcoming = upcomingEvents(day, nowTime);
    const next = upcoming[0] || null;
    const openTasks = tasks.filter((task) => task && task.status !== 'done'
      && Number(task.assigned_to_user_id) === Number(member.user_id)).length;
    const balance = Array.isArray(balances)
      ? balances.find((entry) => Number(entry.user_id) === Number(member.user_id))
      : null;
    const points = balance ? Number(balance.balance) || 0 : null;
    return {
      memberId: member.user_id,
      next: next ? { title: next.title, time: next.time, endTime: next.endTime } : null,
      later: Math.max(0, upcoming.length - 1),
      openTasks,
      points,
      goal: points !== null && member.is_adult === false ? nextGoal(points, rewards) : null,
    };
  });

  // Family birthdays and the members' own, once per name.
  const entries = [];
  for (const birthday of birthdays) {
    if (!birthday?.person_name || !birthday.month || !birthday.day) continue;
    entries.push({ name: birthday.person_name, month: Number(birthday.month), day: Number(birthday.day) });
  }
  for (const member of members) {
    const match = /^\d{4}-(\d{2})-(\d{2})/.exec(member.date_of_birth || '');
    if (!match || entries.some((entry) => isMemberNamed(member, entry.name))) continue;
    entries.push({ name: member.display_name, month: Number(match[1]), day: Number(match[2]) });
  }
  const upcomingBirthdays = entries
    .map((entry) => {
      const member = members.find((candidate) => isMemberNamed(candidate, entry.name)) || null;
      const giftIdeas = gifts.filter((gift) => gift && gift.status !== 'gifted' && (
        sameName(gift.for_person_name, entry.name)
        || (member && Number(gift.for_user_id) === Number(member.user_id))
      )).length;
      return { name: entry.name, ...nextOccurrence(today, entry.month, entry.day), memberId: member ? member.user_id : null, giftIdeas };
    })
    .filter((entry) => entry.daysUntil <= BIRTHDAY_WINDOW_DAYS)
    .sort((a, b) => a.daysUntil - b.daysUntil || a.name.localeCompare(b.name))
    .slice(0, MAX_BIRTHDAYS);

  return { people, birthdays: upcomingBirthdays };
}
