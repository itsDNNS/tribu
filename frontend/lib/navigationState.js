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

// What a home screen shortcut asks for (manifest `?action=`, Tribu 2.0 N-3).
export const LAUNCH_ACTIONS = ['shopping-trip', 'new-shopping', 'new-event'];

// Text or a link shared into Tribu from another app (manifest
// `share_target`, Tribu 2.0 N-5): the page title, the text and the link,
// each once, or null.
export const SHARED_TEXT_LIMIT = 2000;

export function resolveSharedText(search = '') {
  try {
    const params = new URLSearchParams(search || '');
    const values = [...new Set(['share_title', 'share_text', 'share_url']
      .map((key) => (params.get(key) || '').trim())
      .filter(Boolean))];
    // A title or link already inside the text is not repeated.
    const parts = values.filter((value) => !values.some((other) => other !== value && other.includes(value)));
    const text = parts.join('\n');
    return text ? text.slice(0, SHARED_TEXT_LIMIT) : null;
  } catch {
    return null;
  }
}

export function resolveLaunchAction(search = '') {
  try {
    const action = new URLSearchParams(search || '').get('action');
    return LAUNCH_ACTIONS.includes(action) ? action : null;
  } catch {
    return null;
  }
}
