/**
 * @jest-environment jsdom
 */
import { render, screen, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';

// AppContext mock — AuthPage destructures several values; only the
// ones touched by the SSO branch need realistic returns.
const mockSetLoggedIn = jest.fn();
const mockEnterDemo = jest.fn();
jest.mock('../../contexts/AppContext', () => ({
  useApp: () => ({
    messages: {},
    setLoggedIn: mockSetLoggedIn,
    enterDemo: mockEnterDemo,
    lang: 'en',
    setLang: jest.fn(),
    availableLanguages: [{ key: 'en' }, { key: 'de' }],
  }),
}));

const mockToastError = jest.fn();
jest.mock('../../contexts/ToastContext', () => ({
  useToast: () => ({ error: mockToastError }),
}));

jest.mock('../../lib/i18n', () => ({
  t: (_m, key) => key,
}));

jest.mock('../../lib/helpers', () => ({
  errorText: (_d, fallback) => fallback,
}));

jest.mock('../../lib/api', () => ({
  apiGetOidcPublicConfig: jest.fn(),
  apiLogin: jest.fn(),
  apiRegister: jest.fn(),
}));

import AuthPage from '../../components/AuthPage';

describe('AuthPage OIDC integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.history.replaceState({}, '', '/');
  });

  it('does not render the SSO button when public-config says not ready', async () => {
    const api = require('../../lib/api');
    api.apiGetOidcPublicConfig.mockResolvedValue({
      ok: true,
      data: { enabled: false, ready: false, button_label: '', password_login_disabled: false },
    });
    render(<AuthPage />);
    await waitFor(() => expect(api.apiGetOidcPublicConfig).toHaveBeenCalled());
    expect(screen.queryByTestId('sso-login-button')).not.toBeInTheDocument();
    // Password form still present
    expect(document.querySelector('input[type="password"]')).toBeInTheDocument();
  });

  it('renders the SSO button with the configured label when ready', async () => {
    const api = require('../../lib/api');
    api.apiGetOidcPublicConfig.mockResolvedValue({
      ok: true,
      data: { enabled: true, ready: true, button_label: 'Sign in with Home', password_login_disabled: false },
    });
    render(<AuthPage />);
    const btn = await screen.findByTestId('sso-login-button');
    expect(btn).toHaveAttribute('href', '/auth/oidc/login');
    expect(btn).toHaveTextContent('Sign in with Home');
  });

  it('hides the tabs and password form when password_login_disabled', async () => {
    const api = require('../../lib/api');
    api.apiGetOidcPublicConfig.mockResolvedValue({
      ok: true,
      data: { enabled: true, ready: true, button_label: 'Sign in', password_login_disabled: true },
    });
    render(<AuthPage />);
    await screen.findByTestId('sso-login-button');
    // Tablist role hidden when password login disabled
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    // No password inputs rendered
    expect(document.querySelector('input[type="password"]')).not.toBeInTheDocument();
  });

  it('surfaces ?sso_error= as a toast and scrubs the query string', async () => {
    const api = require('../../lib/api');
    api.apiGetOidcPublicConfig.mockResolvedValue({
      ok: true,
      data: { enabled: false, ready: false, button_label: '', password_login_disabled: false },
    });
    window.history.replaceState({}, '', '/?sso_error=state_mismatch');

    render(<AuthPage />);

    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('sso.error.state_mismatch'));
    // URL should have the query string scrubbed
    expect(window.location.search).toBe('');
  });

  it('falls back to generic error message for unknown ?sso_error tags', async () => {
    const api = require('../../lib/api');
    api.apiGetOidcPublicConfig.mockResolvedValue({
      ok: true,
      data: { enabled: false, ready: false, button_label: '', password_login_disabled: false },
    });
    window.history.replaceState({}, '', '/?sso_error=<script>alert(1)</script>');

    render(<AuthPage />);

    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('sso.error.generic'));
  });
});
