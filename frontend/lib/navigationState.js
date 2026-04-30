const DEFAULT_SHORTCUT_VIEWS = ['dashboard', 'calendar', 'tasks', 'shopping'];

export function resolveInitialView({
  hash = '',
  search = '',
  storedView = null,
  validViews = [],
  shortcutViews = DEFAULT_SHORTCUT_VIEWS,
} = {}) {
  const valid = validViews instanceof Set ? validViews : new Set(validViews);
  const shortcuts = shortcutViews instanceof Set ? shortcutViews : new Set(shortcutViews);
  const normalize = (value) => (value && valid.has(value) ? value : null);

  const hashView = normalize(hash?.startsWith('#') ? hash.slice(1) : hash);
  if (hashView) return hashView;

  try {
    const params = new URLSearchParams(search || '');
    const queryView = normalize(params.get('view'));
    if (queryView && shortcuts.has(queryView)) return queryView;
  } catch {
    // Ignore malformed search strings and fall back to stored state.
  }

  return normalize(storedView);
}
