/**
 * ErrorBoundary visibility test (issue #225).
 *
 * The original `_app.js` ErrorBoundary rendered `error.message` and
 * `error.stack` for every visitor. That leaks file paths, internal
 * symbols, and library versions to anyone who can trip a render-time
 * exception. The fix gates those details behind NODE_ENV !== 'production'
 * and replaces the user-visible UI with a generic apology.
 *
 * These tests pin the contract:
 *   - production: no message, no stack, generic copy with role="alert"
 *   - development: message + stack visible (developers still need them)
 *   - happy path: children render unchanged
 */

import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

// React logs error boundary catches via console.error. Silence those to
// keep the Jest run clean — the boundary's *rendered* output is what
// these tests assert on.
let errorSpy;
beforeEach(() => {
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  errorSpy.mockRestore();
});

const SECRET_MESSAGE = 'kaboom: /secret/path/leak.js';

function Boom() {
  throw new Error(SECRET_MESSAGE);
}

function loadBoundaryWith(env) {
  const previous = process.env.NODE_ENV;
  jest.resetModules();
  // process.env.NODE_ENV is read inside the boundary's render() so the
  // override must be in place before the component is required AND
  // before render runs. Restore it after the test to keep Jest's
  // default of 'test' for unrelated suites.
  Object.defineProperty(process.env, 'NODE_ENV', {
    value: env,
    configurable: true,
  });
  const mod = require('../../pages/_app');
  return {
    ErrorBoundary: mod.ErrorBoundary,
    restore: () => {
      Object.defineProperty(process.env, 'NODE_ENV', {
        value: previous,
        configurable: true,
      });
    },
  };
}

describe('ErrorBoundary visibility (issue #225)', () => {
  test('production: hides error message and stack from end users', () => {
    const { ErrorBoundary, restore } = loadBoundaryWith('production');
    try {
      render(
        <ErrorBoundary>
          <Boom />
        </ErrorBoundary>,
      );

      const alert = screen.getByRole('alert');
      expect(alert).toBeInTheDocument();
      expect(alert.textContent).not.toContain(SECRET_MESSAGE);
      expect(alert.textContent).not.toContain('/secret/path');
      // No stack frame markers like "at Boom" should be visible either.
      expect(alert.textContent).not.toMatch(/\bat\s+Boom\b/);
    } finally {
      restore();
    }
  });

  test('development: surfaces message and stack so developers can debug', () => {
    const { ErrorBoundary, restore } = loadBoundaryWith('development');
    try {
      render(
        <ErrorBoundary>
          <Boom />
        </ErrorBoundary>,
      );

      const alert = screen.getByRole('alert');
      expect(alert.textContent).toContain(SECRET_MESSAGE);
    } finally {
      restore();
    }
  });

  test('happy path: renders children when nothing throws', () => {
    const { ErrorBoundary, restore } = loadBoundaryWith('production');
    try {
      render(
        <ErrorBoundary>
          <div data-testid="child">ok</div>
        </ErrorBoundary>,
      );
      expect(screen.getByTestId('child')).toHaveTextContent('ok');
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    } finally {
      restore();
    }
  });
});
