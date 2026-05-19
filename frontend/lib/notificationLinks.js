const VIEW_BY_LINK_TARGET = {
  birthdays: 'contacts',
  dashboard: 'dashboard',
  today: 'dashboard',
};

export function notificationLinkView(link) {
  const raw = String(link || '').trim();
  if (!raw) return '';
  let target = '';
  try {
    const parsed = new URL(raw, typeof window !== 'undefined' ? window.location.origin : 'https://tribu.local');
    target = parsed.pathname.replace(/^\/+/, '').split('/')[0];
  } catch {
    target = raw.replace(/^\/+/, '').split('?')[0].split('/')[0];
  }
  target = target || 'dashboard';
  return VIEW_BY_LINK_TARGET[target] || target;
}
