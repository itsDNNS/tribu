export function toIsoOrNull(localValue) {
  if (!localValue) return null;
  return new Date(localValue).toISOString();
}

export function prettyDate(value, lang = 'en') {
  if (!value) return '-';
  const d = new Date(value);
  const locale = lang === 'de' ? 'de-DE' : 'en-US';
  return d.toLocaleString(locale, {
    weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

export function errorText(detail, fallback) {
  if (!detail) return fallback;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail) && detail[0]?.msg) return detail[0].msg;
  if (typeof detail === 'object' && detail.msg) return detail.msg;
  try { return JSON.stringify(detail); } catch { return fallback; }
}
