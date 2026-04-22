/**
 * @jest-environment jsdom
 */
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

jest.mock('next/router', () => ({
  useRouter: () => ({ isReady: true, query: { token: 'inv/123 with space' }, push: jest.fn() }),
}));

jest.mock('../../contexts/AppContext', () => ({
  useApp: () => ({
    messages: {},
    setLoggedIn: jest.fn(),
    lang: 'en',
    setLang: jest.fn(),
    availableLanguages: [{ key: 'en' }, { key: 'de' }],
  }),
}));

jest.mock('../../lib/i18n', () => ({ t: (_m, k) => k }));
jest.mock('../../lib/helpers', () => ({ errorText: (_d, f) => f }));

jest.mock('../../lib/api', () => ({
  apiGetInviteInfo: jest.fn(),
  apiRegisterWithInvite: jest.fn(),
  apiGetOidcPublicConfig: jest.fn(),
}));

import InvitePage from '../../pages/invite/[token]';

describe('InvitePage OIDC integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const api = require('../../lib/api');
    api.apiGetInviteInfo.mockResolvedValue({
      ok: true,
      data: { valid: true, family_name: 'Mueller Family', role_preset: 'member', is_adult_preset: true },
    });
  });

  it('does not render the SSO button when OIDC is not ready', async () => {
    const api = require('../../lib/api');
    api.apiGetOidcPublicConfig.mockResolvedValue({
      ok: true,
      data: { enabled: false, ready: false, button_label: '', password_login_disabled: false },
    });
    render(<InvitePage />);
    // Wait for the password input to appear (loading completes inside
    // a Promise.all chain so we cannot simply await the mock).
    await waitFor(() => {
      expect(document.querySelector('input[type="password"]')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('sso-invite-button')).not.toBeInTheDocument();
  });

  it('renders the SSO button with a URL-encoded invite token when ready', async () => {
    const api = require('../../lib/api');
    api.apiGetOidcPublicConfig.mockResolvedValue({
      ok: true,
      data: { enabled: true, ready: true, button_label: 'Sign in with Home', password_login_disabled: false },
    });
    render(<InvitePage />);
    const btn = await screen.findByTestId('sso-invite-button');
    // Token 'inv/123 with space' must be percent-encoded in the href
    expect(btn).toHaveAttribute('href', '/auth/oidc/login?invite=inv%2F123%20with%20space');
    expect(btn).toHaveTextContent('Sign in with Home');
  });

  it('hides the local password form when both ready and password_login_disabled', async () => {
    const api = require('../../lib/api');
    api.apiGetOidcPublicConfig.mockResolvedValue({
      ok: true,
      data: { enabled: true, ready: true, button_label: 'SSO', password_login_disabled: true },
    });
    render(<InvitePage />);
    await screen.findByTestId('sso-invite-button');
    expect(document.querySelector('input[type="password"]')).not.toBeInTheDocument();
  });
});
