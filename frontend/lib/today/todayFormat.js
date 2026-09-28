import { t } from '../i18n';

// Dates and times on Today, shared by the family and the kids view.

export function isoDate(date) {
  return date.toLocaleDateString('en-CA');
}

export function greeting(messages, hour) {
  if (hour < 12) return t(messages, 'module.dashboard.greeting_morning');
  if (hour < 18) return t(messages, 'module.dashboard.greeting_afternoon');
  return t(messages, 'module.dashboard.greeting_evening');
}

export function clock(time, locale, timeFormat) {
  if (!time) return '';
  const [hour, minute] = time.split(':').map(Number);
  return new Date(2000, 0, 1, hour, minute).toLocaleTimeString(locale, {
    hour: timeFormat === '12h' ? 'numeric' : '2-digit',
    minute: '2-digit',
    hour12: timeFormat === '12h',
  });
}

export function dayLabel(iso, locale) {
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return {
    weekday: date.toLocaleDateString(locale, { weekday: 'short' }),
    date: date.toLocaleDateString(locale, { day: 'numeric', month: 'numeric' }),
  };
}
