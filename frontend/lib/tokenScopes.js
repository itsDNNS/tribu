import { t } from './i18n';

// Scope modules a personal access token can be limited to, in the order the
// token dialog shows them. Keep this in sync with SCOPE_DESCRIPTIONS in
// backend/app/core/scopes.py; a jest test compares both lists.
export const TOKEN_SCOPE_MODULES = [
  { key: 'calendar', actions: ['read', 'write'] },
  { key: 'tasks', actions: ['read', 'write'] },
  { key: 'shopping', actions: ['read', 'write'] },
  { key: 'meal_plans', actions: ['read', 'write'] },
  { key: 'recipes', actions: ['read', 'write'] },
  { key: 'birthdays', actions: ['read', 'write'] },
  { key: 'contacts', actions: ['read', 'write'] },
  { key: 'gifts', actions: ['read', 'write'] },
  { key: 'rewards', actions: ['read', 'write'] },
  { key: 'school_timetables', actions: ['read', 'write'] },
  { key: 'quick_capture', actions: ['read', 'write'] },
  { key: 'activity', actions: ['read'] },
  { key: 'household_templates', actions: ['read', 'write'] },
  { key: 'setup_checklist', actions: ['read', 'write'] },
  { key: 'families', actions: ['read', 'write'] },
  { key: 'profile', actions: ['read', 'write'] },
  { key: 'admin', actions: ['read', 'write'], adminOnly: true },
];

export const FULL_ACCESS_SCOPE = '*';

export function tokenScopeModulesFor(isAdmin) {
  return TOKEN_SCOPE_MODULES.filter((mod) => isAdmin || !mod.adminOnly);
}

// Every scope string the dialog can produce, for comparison with the backend.
export function allTokenScopes() {
  return [
    FULL_ACCESS_SCOPE,
    ...TOKEN_SCOPE_MODULES.flatMap((mod) => mod.actions.map((action) => `${mod.key}:${action}`)),
  ];
}

// "Tasks: Read, Write · Shopping: Read" for a stored "shopping:read,tasks:read,tasks:write".
export function formatTokenScopes(messages, scopeStr) {
  const scopes = (scopeStr || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!scopes.length || scopes.includes(FULL_ACCESS_SCOPE)) return t(messages, 'token_full_access');

  const parts = [];
  for (const mod of TOKEN_SCOPE_MODULES) {
    const granted = mod.actions.filter((action) => scopes.includes(`${mod.key}:${action}`));
    if (granted.length) {
      parts.push(`${t(messages, `token_scope_${mod.key}`)}: ${granted.map((action) => t(messages, `token_action_${action}`)).join(', ')}`);
    }
  }
  const known = new Set(allTokenScopes());
  const unknown = scopes.filter((s) => !known.has(s));
  return [...parts, ...unknown].join(' · ');
}
