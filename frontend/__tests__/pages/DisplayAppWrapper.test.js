/**
 * Production wrapper test for /display (issue #172, Codex blocker 3).
 *
 * The bug Codex flagged was that even though DisplayPage itself
 * avoided AppContext, Next's custom _app.js still mounted
 * AppProvider for every route — so `/display` was hitting
 * `/auth/me`, `/families/me`, members loaders, etc., on every
 * pageload. This file mounts the real `pages/_app.js` and asserts
 * that for `pathname === '/display'`:
 *   - no normal bootstrap fetch is made (no /auth/me, /families/me,
 *     /tokens, /notifications, /families/{id}/members);
 *   - AppContext is not mounted (the standalone branch only renders
 *     <Component />, not <AppProvider>).
 *
 * For non-display routes the wrapper still mounts the providers, so
 * the toggle is route-specific and not a global bypass.
 */

import { act, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

const mockRouter = { pathname: '/display', isReady: true, query: {}, replace: jest.fn() };
jest.mock('next/router', () => ({
  useRouter: () => mockRouter,
}));

// Stub PWABanners and Toast so the non-display branch doesn't try to
// render real DOM nodes from contexts we don't care about here.
jest.mock('../../components/PWABanners', () => ({
  PWABanners: () => <div data-testid="pwa-banners" />,
}));
jest.mock('../../components/Toast', () => ({
  ToastContainer: () => <div data-testid="toast-container" />,
}));

// jsdom lacks matchMedia; both branches of _app.js touch it via
// DisplayModeRootFlag (non-display) and DISPLAY_MODE_BOOTSTRAP. Stub
// it once so neither branch trips an error boundary.
beforeAll(() => {
  if (typeof window !== 'undefined' && !window.matchMedia) {
    window.matchMedia = () => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    });
  }
});

// Spy on fetch so we can prove no normal bootstrap calls happen on /display.
let fetchCalls;
beforeEach(() => {
  fetchCalls = [];
  global.fetch = jest.fn((url) => {
    fetchCalls.push(typeof url === 'string' ? url : url?.url || String(url));
    return Promise.resolve({ ok: false, status: 401, json: async () => ({}) });
  });
  mockRouter.pathname = '/display';
  mockRouter.query = {};
  mockRouter.replace.mockReset();
  try { window.localStorage.clear(); } catch {}
});

afterEach(() => {
  delete global.fetch;
  try { window.localStorage.clear(); } catch {}
});

const App = require('../../pages/_app').default;

function StubPage() {
  // A minimal page that proves the wrapper still rendered the route.
  return <div data-testid="stub-page">stub</div>;
}

describe('Custom _app.js standalone wrapper for /display', () => {
  test('exposes /display in the standalone-routes set', () => {
    const { __isStandaloneRouteForTest } = require('../../pages/_app');
    expect(__isStandaloneRouteForTest('/display')).toBe(true);
    expect(__isStandaloneRouteForTest('/')).toBe(false);
    expect(__isStandaloneRouteForTest('/calendar')).toBe(false);
  });

  test('on /display, the wrapper does NOT mount PWABanners or fire any normal bootstrap fetch', async () => {
    mockRouter.pathname = '/display';
    await act(async () => {
      render(<App Component={StubPage} pageProps={{}} />);
    });
    await act(async () => { await Promise.resolve(); });

    expect(screen.getByTestId('stub-page')).toBeInTheDocument();
    expect(screen.queryByTestId('pwa-banners')).not.toBeInTheDocument();
    expect(screen.queryByTestId('toast-container')).not.toBeInTheDocument();

    const forbidden = [
      '/auth/me',
      '/families/me',
      '/families/1/members',
      '/notifications',
      '/tokens',
      '/setup/status',
    ];
    for (const path of forbidden) {
      const hit = fetchCalls.find((url) => url.includes(path));
      if (hit) {
        throw new Error(`unexpected bootstrap call to ${path}: ${hit} (all: ${fetchCalls.join(', ') || '<none>'})`);
      }
    }
  });

  test('on a non-standalone route, the wrapper still mounts the global providers', async () => {
    mockRouter.pathname = '/';
    await act(async () => {
      render(<App Component={StubPage} pageProps={{}} />);
    });
    await act(async () => { await Promise.resolve(); });

    // The non-display branch renders the providers + chrome.
    expect(screen.getByTestId('pwa-banners')).toBeInTheDocument();
    expect(screen.getByTestId('toast-container')).toBeInTheDocument();
  });
});
