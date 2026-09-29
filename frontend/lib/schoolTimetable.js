// What the timetable shows first (Tribu 2.0): today, and the period that is
// running right now.

function minutes(value) {
  const [hours, mins] = String(value || '').slice(0, 5).split(':').map(Number);
  return Number.isFinite(hours) && Number.isFinite(mins) ? hours * 60 + mins : null;
}

// The position of the period (lesson or break) running at `now`, or null.
export function currentPeriodPosition(periods, now) {
  const at = now.getHours() * 60 + now.getMinutes();
  const period = (periods || []).find((entry) => {
    const start = minutes(entry.start_time);
    const end = minutes(entry.end_time);
    return start !== null && end !== null && start <= at && at < end;
  });
  return period ? Number(period.position) : null;
}

// Today when it is a school day of the plan, otherwise its first day
// (Monday after a weekend).
export function openingWeekday(weekdays, now) {
  const today = now.getDay() === 0 ? 7 : now.getDay();
  return weekdays.includes(today) ? today : weekdays[0];
}

// Today's weekday (Monday 1 … Saturday 6) when the plan has it, else null.
export function schoolToday(weekdays, now) {
  const today = now.getDay() === 0 ? 7 : now.getDay();
  return weekdays.includes(today) ? today : null;
}

// A calm colour per subject, the same on the page and the display.
const SUBJECT_PALETTE = [
  { bg: 'rgba(124, 58, 237, 0.12)', fg: '#7c3aed' },
  { bg: 'rgba(59, 130, 246, 0.12)', fg: '#2563eb' },
  { bg: 'rgba(16, 185, 129, 0.13)', fg: '#059669' },
  { bg: 'rgba(245, 158, 11, 0.15)', fg: '#d97706' },
  { bg: 'rgba(244, 63, 94, 0.12)', fg: '#e11d48' },
  { bg: 'rgba(6, 182, 212, 0.14)', fg: '#0891b2' },
  { bg: 'rgba(168, 85, 247, 0.12)', fg: '#9333ea' },
];

export function subjectPalette(subject) {
  if (!subject) return null;
  const key = subject.trim().toLowerCase();
  if (!key) return null;
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return SUBJECT_PALETTE[hash % SUBJECT_PALETTE.length];
}
