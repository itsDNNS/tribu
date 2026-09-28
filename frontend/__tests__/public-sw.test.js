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
    expect(sandbox.shouldRuntimeCache(get, new URL('https://tribu.example.test/sw.js'), response)).toBe(false);
  });

  it('allows safe same-origin GET pages and rejects non-GET or failed responses', () => {
    const sandbox = loadServiceWorker();
    expect(sandbox.shouldRuntimeCache({ method: 'GET' }, new URL('https://tribu.example.test/'), { ok: true })).toBe(true);
    expect(sandbox.shouldRuntimeCache({ method: 'POST' }, new URL('https://tribu.example.test/'), { ok: true })).toBe(false);
    expect(sandbox.shouldRuntimeCache({ method: 'GET' }, new URL('https://tribu.example.test/'), { ok: false })).toBe(false);
  });

  it('detects local dev hosts so Next chunks are not cache-first during development', () => {
    const sandbox = loadServiceWorker();
    expect(typeof sandbox.isLocalDevHost).toBe('function');

    expect(sandbox.isLocalDevHost(new URL('http://localhost:3000/_next/static/chunks/app.js'))).toBe(true);
    expect(sandbox.isLocalDevHost(new URL('http://127.0.0.1:3000/_next/static/chunks/app.js'))).toBe(true);
    expect(sandbox.isLocalDevHost(new URL('https://tribu.example.test/_next/static/chunks/app.js'))).toBe(false);
  });
});

describe('service worker reminder actions (Tribu 2.0, N-2)', () => {
  function handler(sandbox, type) {
    return sandbox.self.addEventListener.mock.calls.find(([name]) => name === type)[1];
  }

  it('shows the reminder buttons and keeps their token', async () => {
    const sandbox = loadServiceWorker();
    const waits = [];
    handler(sandbox, 'push')({
      data: { json: () => ({ title: 'Bins', body: 'Overdue', url: '/tasks?id=1', actions: [{ action: 'done', title: 'Erledigt' }, { action: 'snooze', title: 'In 1 Std. erinnern' }], action_token: 'tok' }) },
      waitUntil: (promise) => waits.push(promise),
    });
    const [title, options] = sandbox.self.registration.showNotification.mock.calls[0];
    expect(title).toBe('Bins');
    expect(options.actions).toEqual([{ action: 'done', title: 'Erledigt' }, { action: 'snooze', title: 'In 1 Std. erinnern' }]);
    expect(options.data).toEqual({ url: '/tasks?id=1', actionToken: 'tok' });
  });

  it('leaves out buttons without a token', () => {
    const sandbox = loadServiceWorker();
    handler(sandbox, 'push')({
      data: { json: () => ({ title: 'Hi', body: '', actions: [{ action: 'done', title: 'Done' }] }) },
      waitUntil: () => {},
    });
    expect(sandbox.self.registration.showNotification.mock.calls[0][1].actions).toEqual([]);
  });

  it('runs a button without opening Tribu', async () => {
    const sandbox = loadServiceWorker();
    sandbox.fetch.mockResolvedValue({ ok: true });
    sandbox.self.clients.matchAll = jest.fn();
    sandbox.self.clients.openWindow = jest.fn();
    const close = jest.fn();
    let waited;
    handler(sandbox, 'notificationclick')({
      action: 'done',
      notification: { close, data: { url: '/tasks?id=1', actionToken: 'tok' } },
      waitUntil: (promise) => { waited = promise; },
    });
    await waited;
    expect(close).toHaveBeenCalled();
    expect(sandbox.fetch).toHaveBeenCalledWith('/api/notifications/actions', expect.objectContaining({ method: 'POST', body: JSON.stringify({ action: 'done', token: 'tok' }) }));
    expect(sandbox.self.clients.matchAll).not.toHaveBeenCalled();
    expect(sandbox.self.clients.openWindow).not.toHaveBeenCalled();
  });
});
