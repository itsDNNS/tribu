/**
 * @jest-environment jsdom
 */
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

jest.mock('next/router', () => ({
  useRouter: () => ({ isReady: true, query: { token: 'tok-1' }, push: jest.fn() }),
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

jest.mock('../../lib/i18n', () => ({
  t: (_m, k) => (k === 'invite_page_next_step_join' ? 'You will be added to {family} automatically' : k),
}));
jest.mock('../../lib/helpers', () => ({ errorText: (_d, f) => f }));

jest.mock('../../lib/api', () => ({
  apiGetInviteInfo: jest.fn(),
  apiRegisterWithInvite: jest.fn(),
  apiGetOidcPublicConfig: jest.fn(),
}));

import InvitePage from '../../pages/invite/[token]';

function mockSsoOff() {
  const api = require('../../lib/api');
  api.apiGetOidcPublicConfig.mockResolvedValue({
    ok: true,
    data: { enabled: false, ready: false, button_label: '', password_login_disabled: false },
  });
}

describe('InvitePage onboarding guidance', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the What happens next card with the family name substituted', async () => {
    const api = require('../../lib/api');
    api.apiGetInviteInfo.mockResolvedValue({
      ok: true,
      data: { valid: true, family_name: 'Mueller Family', role_preset: 'member', is_adult_preset: true },
    });
    mockSsoOff();
    render(<InvitePage />);
    const card = await screen.findByTestId('invite-next-card');
    expect(card).toBeInTheDocument();
    expect(card).toHaveTextContent('invite_page_next_title');
    expect(card).toHaveTextContent('invite_page_next_step_account');
    // The family-name token should be replaced inline (not left as the literal placeholder).
    expect(card).toHaveTextContent('Mueller Family');
    expect(card.textContent).not.toContain('{family}');
  });

  it('shows the admin role pill when role_preset is admin', async () => {
    const api = require('../../lib/api');
    api.apiGetInviteInfo.mockResolvedValue({
      ok: true,
      data: { valid: true, family_name: 'Smith', role_preset: 'admin', is_adult_preset: true },
    });
    mockSsoOff();
    render(<InvitePage />);
    const pill = await screen.findByTestId('invite-role-pill');
    expect(pill).toHaveTextContent('invite_page_role_admin');
  });

  it('shows the adult-member role pill for non-admin adult invitations', async () => {
    const api = require('../../lib/api');
    api.apiGetInviteInfo.mockResolvedValue({
      ok: true,
      data: { valid: true, family_name: 'Smith', role_preset: 'member', is_adult_preset: true },
    });
    mockSsoOff();
    render(<InvitePage />);
    const pill = await screen.findByTestId('invite-role-pill');
    expect(pill).toHaveTextContent('invite_page_role_adult_member');
  });

  it('shows the child-member role pill for non-admin child invitations', async () => {
    const api = require('../../lib/api');
    api.apiGetInviteInfo.mockResolvedValue({
      ok: true,
      data: { valid: true, family_name: 'Smith', role_preset: 'member', is_adult_preset: false },
    });
    mockSsoOff();
    render(<InvitePage />);
    const pill = await screen.findByTestId('invite-role-pill');
    expect(pill).toHaveTextContent('invite_page_role_child_member');
  });

  it('falls back to a generic member label when adult preset is not provided', async () => {
    const api = require('../../lib/api');
    api.apiGetInviteInfo.mockResolvedValue({
      ok: true,
      data: { valid: true, family_name: 'Smith', role_preset: 'member' },
    });
    mockSsoOff();
    render(<InvitePage />);
    const pill = await screen.findByTestId('invite-role-pill');
    expect(pill).toHaveTextContent('invite_page_role_member');
  });

  it('keeps the password form visible alongside the new guidance', async () => {
    const api = require('../../lib/api');
    api.apiGetInviteInfo.mockResolvedValue({
      ok: true,
      data: { valid: true, family_name: 'Smith', role_preset: 'member', is_adult_preset: true },
    });
    mockSsoOff();
    render(<InvitePage />);
    await waitFor(() => {
      expect(document.querySelector('input[type="password"]')).toBeInTheDocument();
    });
    expect(screen.getByTestId('invite-next-card')).toBeInTheDocument();
  });
});
