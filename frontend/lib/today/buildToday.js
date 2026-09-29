// Today (Tribu 2.0, docs/tribu-2-design.md): one chronological list of the
// day, the overdue tasks folded away and a line per day for the week ahead.
// The Flutter app's lib/features/today/today_model.dart follows the same
// rules and shared cases (todayCases.json).

// Where meals sit in the day; they show their slot instead of a time.
const MEAL_TIMES = { morning: '07:00', noon: '12:00', evening: '18:00' };
const KIND_ORDER = { birthday: 0, event: 1, task: 2, meal: 3 };

function pad(value) {
  return String(value).padStart(2, '0');
}

function isoDate(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function addDays(iso, days) {
  const [year, month, day] = iso.split('-').map(Number);
  return isoDate(new Date(year, month - 1, day + days));
}

// "2026-09-30T15:00:00" → ["2026-09-30", "15:00"]. The API sends local wall
// times; values with a time zone are read in the device's zone.
function wallParts(value) {
  if (!value) return [null, null];
  const text = String(value);
  const match = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}))?/.exec(text);
  if (match && !/(?:Z|[+-]\d{2}:?\d{2})$/i.test(text)) return [match[1], match[2] || null];
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return [null, null];
  return [isoDate(date), `${pad(date.getHours())}:${pad(date.getMinutes())}`];
}

// The last day an event covers; ends are exclusive ("until 00:00").
function lastDay(event, startDay) {
  const [endDay, endTime] = wallParts(event.ends_at);
  if (!endDay || endDay <= startDay) return startDay;
  return endTime === '00:00' || endTime === null ? addDays(endDay, -1) : endDay;
}

function eventPeople(event, members) {
  const assigned = event.assigned_to;
  if (assigned === 'all') return members.map((member) => member.user_id);
  if (Array.isArray(assigned)) return assigned.map(Number);
  if (assigned === null || assigned === undefined || assigned === '') return [];
  return [Number(assigned)];
}

function eventItems(events, members, firstDay, lastWantedDay) {
  const byDay = new Map();
  const seen = new Set();
  for (const event of events) {
    const [startDay, startTime] = wallParts(event.starts_at);
    if (!startDay) continue;
    const key = `${event.id}:${event.starts_at}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const [, endTime] = wallParts(event.ends_at);
    const until = lastDay(event, startDay);
    for (let day = startDay < firstDay ? firstDay : startDay; day <= until && day <= lastWantedDay; day = addDays(day, 1)) {
      const timed = !event.all_day && day === startDay && startTime !== null;
      const item = {
        kind: 'event',
        id: event.id,
        title: event.title,
        date: day,
        time: timed ? startTime : null,
        endTime: timed && until === startDay ? endTime : null,
        slot: null,
        people: eventPeople(event, members),
        done: false,
      };
      if (!byDay.has(day)) byDay.set(day, []);
      byDay.get(day).push(item);
    }
  }
  return byDay;
}

function taskItem(task, date) {
  const [, dueTime] = wallParts(task.due_date);
  const timed = !task.due_is_date && dueTime !== null && dueTime !== '00:00';
  return {
    kind: 'task',
    id: task.id,
    title: task.title,
    date,
    time: timed ? dueTime : null,
    endTime: null,
    slot: null,
    people: task.assigned_to_user_id ? [Number(task.assigned_to_user_id)] : [],
    done: task.status === 'done',
  };
}

function sortTime(item) {
  if (item.kind === 'meal') return MEAL_TIMES[item.slot] || '12:00';
  return item.time;
}

function compareItems(a, b) {
  const aTime = sortTime(a);
  const bTime = sortTime(b);
  if (!aTime !== !bTime) return aTime ? 1 : -1;
  if (aTime && bTime && aTime !== bTime) return aTime < bTime ? -1 : 1;
  if (a.kind !== b.kind) return KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
  return String(a.title).localeCompare(String(b.title));
}

function forMember(memberId) {
  if (memberId === null || memberId === undefined) return () => true;
  const id = Number(memberId);
  return (item) => {
    if (item.kind === 'meal' || item.kind === 'birthday') return true;
    // Family events without people are everyone's; tasks need an owner.
    if (item.kind === 'event' && item.people.length === 0) return true;
    return item.people.includes(id);
  };
}

/**
 * @param {object} input
 * @param {Date} input.now
 * @param {Array} input.events calendar occurrences (starts_at, ends_at, all_day, assigned_to)
 * @param {Array} input.tasks tasks (status, due_date, due_is_date, recurrence, assigned_to_user_id)
 * @param {Array} input.meals today's meal plans (plan_date, slot, meal_name)
 * @param {Array} input.birthdays upcoming birthdays (person_name, occurs_on)
 * @param {Array} input.members family members (user_id), for events for everyone
 * @param {number|null} input.memberId only what concerns this person
 * @param {number} input.days days including today, for the week ahead
 * @returns {{ today: object[], nowIndex: number, overdue: object[], week: {date: string, items: object[]}[] }}
 */
export function buildToday({
  now = new Date(), events = [], tasks = [], meals = [], birthdays = [], members = [], memberId = null, days = 7,
} = {}) {
  const today = isoDate(now);
  const nowTime = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const lastWantedDay = addDays(today, days - 1);
  const keep = forMember(memberId);

  const eventsByDay = eventItems(Array.isArray(events) ? events : [], members, today, lastWantedDay);
  const itemsByDay = new Map([...eventsByDay].map(([day, items]) => [day, [...items]]));
  const addTo = (day, item) => {
    if (!itemsByDay.has(day)) itemsByDay.set(day, []);
    itemsByDay.get(day).push(item);
  };

  const overdue = [];
  for (const task of Array.isArray(tasks) ? tasks : []) {
    const [dueDay] = wallParts(task.due_date);
    if (!dueDay) continue;
    if (task.status === 'done') {
      if (dueDay === today) addTo(today, taskItem(task, today));
      continue;
    }
    if (task.status !== 'open') continue;
    if (dueDay < today) {
      // Routines roll over into today; one-off tasks wait under "Still open".
      if (task.recurrence) addTo(today, taskItem(task, today));
      else overdue.push({ ...taskItem(task, dueDay), date: dueDay });
    } else if (dueDay <= lastWantedDay) {
      addTo(dueDay, taskItem(task, dueDay));
    }
  }

  for (const meal of Array.isArray(meals) ? meals : []) {
    const [day] = wallParts(meal.plan_date);
    if (day !== today) continue;
    addTo(today, {
      kind: 'meal', id: meal.id, title: meal.meal_name, date: today, time: null, endTime: null, slot: meal.slot, people: [], done: false,
    });
  }

  for (const birthday of Array.isArray(birthdays) ? birthdays : []) {
    const [day] = wallParts(birthday.occurs_on);
    if (!day || day < today || day > lastWantedDay) continue;
    addTo(day, {
      kind: 'birthday', id: null, title: birthday.person_name, date: day, time: null, endTime: null, slot: null, people: [], done: false,
    });
  }

  const todayItems = (itemsByDay.get(today) || []).filter(keep).sort(compareItems);
  const upcoming = todayItems.findIndex((item) => {
    const time = sortTime(item);
    return time !== null && time > nowTime;
  });
  const nowIndex = upcoming === -1 ? todayItems.length : upcoming;

  const week = [];
  for (let offset = 1; offset < days; offset += 1) {
    const day = addDays(today, offset);
    const items = (itemsByDay.get(day) || []).filter(keep).sort(compareItems);
    if (items.length) week.push({ date: day, items });
  }

  overdue.sort((a, b) => (a.date === b.date ? compareItems(a, b) : a.date < b.date ? -1 : 1));
  return { today: todayItems, nowIndex, overdue: overdue.filter(keep), week };
}
