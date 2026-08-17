export function localeForLang(lang) {
  if (lang === 'en') return 'en-US';
  return lang || 'en-US';
}

export function weekStartsOn(lang) {
  return lang === 'en' ? 0 : 1;
}

export function weekStartIndex(weekStart) {
  return weekStart === 'sunday' ? 0 : 1;
}

export function startOfWeek(date, firstDay = 1) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const normalizedFirstDay = Number.isInteger(firstDay) && firstDay >= 0 && firstDay <= 6 ? firstDay : 1;
  const offset = (d.getDay() - normalizedFirstDay + 7) % 7;
  d.setDate(d.getDate() - offset);
  return d;
}

export function formatDayMonth(date, locale) {
  return new Intl.DateTimeFormat(locale || 'en-US', {
    month: 'numeric',
    day: 'numeric',
  }).format(date);
}

function fallbackWeekRange(start, end, locale) {
  const formatter = new Intl.DateTimeFormat(locale || 'en-US', {
    month: 'numeric',
    day: 'numeric',
    year: 'numeric',
  });
  return `${formatter.format(start)} – ${formatter.format(end)}`;
}

export function formatWeekRange(start, end, locale) {
  const formatter = new Intl.DateTimeFormat(locale || 'en-US', {
    month: 'numeric',
    day: 'numeric',
    year: 'numeric',
  });
  if (typeof formatter.formatRange === 'function') {
    return formatter.formatRange(start, end);
  }
  return fallbackWeekRange(start, end, locale);
}
