import { parseDate } from './helpers';

// The task list of Tribu 2.0: open tasks grouped by
// when they are due, then what is done.

export const TASK_GROUPS = ['overdue', 'today', 'upcoming', 'no_date', 'done'];

// More overdue tasks than this start folded away.
export const OVERDUE_FOLD_LIMIT = 3;

const PRIORITY_RANK = { high: 0, normal: 1, low: 2 };

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date, days) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function pad(value) {
  return String(value).padStart(2, '0');
}

// The API stores tasks as naive local wall-clock time.
export function toApiDateTime(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    + `T${pad(date.getHours())}:${pad(date.getMinutes())}:00`;
}

export function taskGroup(task, now = new Date()) {
  if (task.status === 'done') return 'done';
  const due = parseDate(task.due_date);
  if (!due || Number.isNaN(due.getTime())) return 'no_date';
  const today = startOfDay(now);
  if (due < today) return 'overdue';
  if (due < addDays(today, 1)) return 'today';
  return 'upcoming';
}

function byDue(a, b) {
  return (parseDate(a.due_date) || 0) - (parseDate(b.due_date) || 0);
}

function byPriorityThenNewest(a, b) {
  const rank = (PRIORITY_RANK[a.priority] ?? 1) - (PRIORITY_RANK[b.priority] ?? 1);
  if (rank) return rank;
  return new Date(b.created_at || 0) - new Date(a.created_at || 0);
}

function byRecentlyDone(a, b) {
  return new Date(b.completed_at || b.updated_at || 0) - new Date(a.completed_at || a.updated_at || 0);
}

export function groupTasks(tasks, now = new Date()) {
  const groups = Object.fromEntries(TASK_GROUPS.map((key) => [key, []]));
  for (const task of tasks) groups[taskGroup(task, now)].push(task);
  groups.overdue.sort(byDue);
  groups.today.sort(byDue);
  groups.upcoming.sort(byDue);
  groups.no_date.sort(byPriorityThenNewest);
  groups.done.sort(byRecentlyDone);
  return groups;
}

// The evening slot is offered until this hour.
const EVENING_HOUR = 19;

export function postponeOptions(now = new Date()) {
  const options = [];
  if (now.getHours() < EVENING_HOUR) options.push('tonight');
  options.push('tomorrow', 'next_week');
  return options;
}

// Where a task goes when it is postponed. A task with a time keeps its time
// of day; a date-only task stays date-only. "Next week" is the first day of
// the next calendar week (Monday unless the family starts on Sunday).
export function postponeTarget(task, option, now = new Date(), firstWeekday = 1) {
  const due = parseDate(task.due_date);
  const hasTime = Boolean(due && !Number.isNaN(due.getTime()) && !task.due_is_date);
  const today = startOfDay(now);
  let day;
  if (option === 'tonight') {
    day = today;
    return {
      due_date: toApiDateTime(new Date(day.getFullYear(), day.getMonth(), day.getDate(), EVENING_HOUR)),
      due_is_date: false,
    };
  }
  if (option === 'tomorrow') {
    day = addDays(today, 1);
  } else {
    const offset = (7 - ((today.getDay() - firstWeekday + 7) % 7)) % 7 || 7;
    day = addDays(today, offset);
  }
  if (hasTime) {
    return {
      due_date: toApiDateTime(new Date(day.getFullYear(), day.getMonth(), day.getDate(), due.getHours(), due.getMinutes())),
      due_is_date: false,
    };
  }
  return { due_date: toApiDateTime(day), due_is_date: true };
}
