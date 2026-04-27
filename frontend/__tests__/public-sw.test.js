const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadServiceWorker() {
  const source = fs.readFileSync(path.join(__dirname, '../public/sw.js'), 'utf8');
  const sandbox = {
    self: {
      addEventListener: jest.fn(),
      skipWaiting: jest.fn(),
      clients: { claim: jest.fn() },
      location: { origin: 'https://tribu.example.test' },
      registration: { showNotification: jest.fn() },
    },
    caches: {
      open: jest.fn(),
      keys: jest.fn(),
      delete: jest.fn(),
      match: jest.fn(),
    },
    fetch: jest.fn(),
    URL,
    Promise,
  };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  return sandbox;
}

describe('service worker runtime cache guard', () => {
  it('does not runtime-cache tokenized or sensitive page routes', () => {
    const sandbox = loadServiceWorker();
    expect(typeof sandbox.shouldRuntimeCache).toBe('function');

    const response = { ok: true };
    const get = { method: 'GET' };

    expect(sandbox.shouldRuntimeCache(get, new URL('https://tribu.example.test/display?token=secret'), response)).toBe(false);
    expect(sandbox.shouldRuntimeCache(get, new URL('https://tribu.example.test/invite/abc'), response)).toBe(false);
    expect(sandbox.shouldRuntimeCache(get, new URL('https://tribu.example.test/auth/oidc/callback?code=abc'), response)).toBe(false);
    expect(sandbox.shouldRuntimeCache(get, new URL('https://tribu.example.test/api/auth/me'), response)).toBe(false);
    expect(sandbox.shouldRuntimeCache(get, new URL('https://tribu.example.test/dav/user/cal'), response)).toBe(false);
    expect(sandbox.shouldRuntimeCache(get, new URL('https://tribu.example.test/ws/shopping/1'), response)).toBe(false);
  });

  it('allows safe same-origin GET pages and rejects non-GET or failed responses', () => {
    const sandbox = loadServiceWorker();
    expect(sandbox.shouldRuntimeCache({ method: 'GET' }, new URL('https://tribu.example.test/'), { ok: true })).toBe(true);
    expect(sandbox.shouldRuntimeCache({ method: 'POST' }, new URL('https://tribu.example.test/'), { ok: true })).toBe(false);
    expect(sandbox.shouldRuntimeCache({ method: 'GET' }, new URL('https://tribu.example.test/'), { ok: false })).toBe(false);
  });
});
