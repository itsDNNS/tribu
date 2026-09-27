// Recurrences that can repeat on several weekdays (recurrence_weekdays).
export const WEEKLY_RECURRENCES = ['weekly', 'biweekly'];

// Weekdays as the backend counts them: 0 = Monday ... 6 = Sunday.
export const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

// Monday-based weekday of a "YYYY-MM-DD..." value, or null.
export function mondayBasedWeekday(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value || '');
  if (!match) return null;
  const day = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])).getDay();
  return (day + 6) % 7;
}

// Short localized weekday name; 2026-01-05 is a Monday.
export function weekdayLabel(weekday, locale) {
  return new Date(2026, 0, 5 + weekday).toLocaleDateString(locale, { weekday: 'short' });
}

// The weekdays a weekly rule shows as selected: the chosen ones, or the
// start's weekday when none are chosen.
export function selectedWeekdays(weekdays, startsAt) {
  if (weekdays?.length) return weekdays;
  const start = mondayBasedWeekday(startsAt);
  return start === null ? [] : [start];
}

// Toggle one weekday; the last selected day cannot be removed.
export function toggleWeekday(weekdays, startsAt, weekday) {
  const current = selectedWeekdays(weekdays, startsAt);
  const next = current.includes(weekday)
    ? current.filter((day) => day !== weekday)
    : [...current, weekday];
  return next.length ? [...next].sort((a, b) => a - b) : current;
}

// The recurrence_weekdays value to send for a recurrence.
export function weekdaysPayload(recurrence, weekdays) {
  return WEEKLY_RECURRENCES.includes(recurrence) && weekdays?.length ? weekdays : null;
}
