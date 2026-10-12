// Weekly duties count weekdays like the server: 0 = Monday to 6 = Sunday.
// JavaScript's getDay() starts at Sunday = 0.

// The seven server weekdays in display order for a week starting on
// firstDay (getDay() numbering: 0 = Sunday, 1 = Monday).
export function orderedWeekdays(firstDay = 1) {
  return Array.from({ length: 7 }, (_, i) => ((firstDay + i) % 7 + 6) % 7);
}

export function weekdayName(weekday, locale, style = 'short') {
  // 2024-01-01 was a Monday.
  return new Intl.DateTimeFormat(locale, { weekday: style }).format(new Date(2024, 0, 1 + weekday));
}

export function isoDate(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// "15:30:00" from the API as the user's clock shows it.
export function formatDutyTime(value, locale, timeFormat = '24h') {
  if (!value) return null;
  const [hours, minutes] = value.split(':').map(Number);
  return new Date(2024, 0, 1, hours, minutes).toLocaleTimeString(locale, {
    hour: '2-digit', minute: '2-digit', hour12: timeFormat === '12h',
  });
}
