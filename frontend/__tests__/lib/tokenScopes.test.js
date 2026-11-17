import fs from 'fs';
import path from 'path';
import { allTokenScopes, formatTokenScopes, TOKEN_SCOPE_MODULES, tokenScopeModulesFor } from '../../lib/tokenScopes';
import { buildMessages } from '../../lib/i18n';

const SCOPES_PY = path.join(__dirname, '..', '..', '..', 'backend', 'app', 'core', 'scopes.py');
const I18N_DIR = path.join(__dirname, '..', '..', 'i18n');

function backendScopes() {
  const source = fs.readFileSync(SCOPES_PY, 'utf8');
  const block = source.match(/SCOPE_DESCRIPTIONS[^{]*\{([\s\S]*?)\n\}/);
  expect(block).not.toBeNull();
  return [...block[1].matchAll(/^\s*"([^"]+)"\s*:/gm)].map((m) => m[1]);
}

describe('token scopes', () => {
  it('offers exactly the scopes the backend accepts', () => {
    const backend = backendScopes();
    expect(backend).toContain('shopping:read');
    expect([...allTokenScopes()].sort()).toEqual([...backend].sort());
  });

  it('lists every module once with its own actions', () => {
    const keys = TOKEN_SCOPE_MODULES.map((mod) => mod.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(TOKEN_SCOPE_MODULES.find((mod) => mod.key === 'activity').actions).toEqual(['read']);
    expect(keys.slice(0, 5)).toEqual(['calendar', 'tasks', 'shopping', 'meal_plans', 'recipes']);
    expect(keys[keys.length - 1]).toBe('admin');
  });

  it('keeps admin scopes for admins', () => {
    expect(tokenScopeModulesFor(false).map((mod) => mod.key)).not.toContain('admin');
    expect(tokenScopeModulesFor(true).map((mod) => mod.key)).toContain('admin');
  });

  it('has a label for every module in every language', () => {
    for (const file of fs.readdirSync(I18N_DIR).filter((f) => f.endsWith('.json'))) {
      const messages = JSON.parse(fs.readFileSync(path.join(I18N_DIR, file), 'utf8'));
      for (const mod of TOKEN_SCOPE_MODULES) {
        expect([file, mod.key, typeof messages[`token_scope_${mod.key}`]]).toEqual([file, mod.key, 'string']);
      }
      expect([file, typeof messages.token_scope_required]).toEqual([file, 'string']);
    }
  });

  it('formats stored scopes with translated labels in dialog order', () => {
    const en = buildMessages('en');
    expect(formatTokenScopes(en, 'shopping:read,tasks:read,tasks:write')).toBe('Tasks: Read, Write · Shopping: Read');
    expect(formatTokenScopes(en, '*')).toBe('Full access');
    expect(formatTokenScopes(en, '')).toBe('Full access');
    expect(formatTokenScopes(en, 'tasks:read,future:read')).toBe('Tasks: Read · future:read');
    expect(formatTokenScopes(buildMessages('de'), 'activity:read,meal_plans:write')).toBe('Essenspläne: Schreiben · Aktivitäten: Lesen');
  });
});
