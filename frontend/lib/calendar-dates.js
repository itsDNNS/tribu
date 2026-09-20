import { parseDate } from './helpers';

// End instants are exclusive: an event ending at midnight does not also
// occupy the following day. Events without a duration occupy their start day.
export function eventOccursOn(event, date) {
  const start = parseDate(event.starts_at);
  if (!start || Number.isNaN(start.getTime())) return false;
  const dayStart = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  );
  const nextDay = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() + 1,
  );
  const end = parseDate(event.ends_at);
  return start < nextDay && (end > start ? end > dayStart : start >= dayStart);
}
