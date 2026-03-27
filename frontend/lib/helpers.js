export function toIsoOrNull(localValue) {
  if (!localValue) return null;
  // datetime-local inputs return "YYYY-MM-DDTHH:mm" in local time.
  // Send as-is without UTC conversion - the backend stores naive local time.
  const s = String(localValue);
  // Already has seconds or Z? Return as-is.
  if (s.length > 16) return s;
  // Add seconds for consistency
  return s + ':00';
}

/**
 * Parse a datetime string from the API.
 * Backend stores naive local time (no timezone).
 * Browsers interpret strings without Z as local time, which is correct here.
 */
export function parseDate(value) {
  if (!value) return null;
  return new Date(String(value));
}

export function prettyDate(value, lang = 'en') {
  if (!value) return '-';
  const d = parseDate(value);
  const locale = lang === 'de' ? 'de-DE' : 'en-US';
  return d.toLocaleString(locale, {
    weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function errorText(detail, fallback, messages) {
  if (!detail) return fallback;
  if (typeof detail === 'string') return detail;
  if (typeof detail === 'object' && detail.code && messages) {
    let msg = messages[`error.${detail.code}`];
    if (msg) {
      if (detail.params) {
        for (const [k, v] of Object.entries(detail.params)) {
          msg = msg.replace(`{${k}}`, v);
        }
      }
      return msg;
    }
    if (detail.message) return detail.message;
  }
  if (Array.isArray(detail) && detail[0]?.msg) return detail[0].msg;
  if (typeof detail === 'object' && detail.msg) return detail.msg;
  if (typeof detail === 'object' && detail.message) return detail.message;
  try { return JSON.stringify(detail); } catch { return fallback; }
}
