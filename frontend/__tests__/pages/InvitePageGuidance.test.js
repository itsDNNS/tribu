/**
 * @jest-environment jsdom
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
jest.mock('../../lib/helpers', () => ({ ...jest.requireActual('../../lib/helpers'), errorText: (d, f) => d?.code || f }));

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

  it('labels the sign-up fields for autofill and checks the password rule before sending', async () => {
    const api = require('../../lib/api');
    api.apiGetInviteInfo.mockResolvedValue({
      ok: true,
      data: { valid: true, family_name: 'Smith', role_preset: 'member', is_adult_preset: true },
    });
    mockSsoOff();
    render(<InvitePage />);

    const email = await screen.findByLabelText('email');
    const password = screen.getByLabelText('password');
    const name = screen.getByLabelText('your_name');
    expect(email).toHaveAttribute('autocomplete', 'username');
    expect(password).toHaveAttribute('autocomplete', 'new-password');
    expect(name).toHaveAttribute('autocomplete', 'name');
    expect(password).toHaveAccessibleDescription('password_hint');

    fireEvent.change(email, { target: { value: 'tom@example.com' } });
    fireEvent.change(password, { target: { value: 'welcome12' } });
    fireEvent.change(name, { target: { value: 'Tom' } });
    fireEvent.click(screen.getByRole('button', { name: 'invite_page_register' }));

    expect(password).toHaveAttribute('aria-invalid', 'true');
    expect(password).toHaveFocus();
    expect(api.apiRegisterWithInvite).not.toHaveBeenCalled();
  });

  it('marks the email field when the address is already registered', async () => {
    const api = require('../../lib/api');
    api.apiGetInviteInfo.mockResolvedValue({
      ok: true,
      data: { valid: true, family_name: 'Smith', role_preset: 'member', is_adult_preset: true },
    });
    api.apiRegisterWithInvite.mockResolvedValue({ ok: false, data: { detail: { code: 'EMAIL_ALREADY_EXISTS' } } });
    mockSsoOff();
    render(<InvitePage />);

    const email = await screen.findByLabelText('email');
    fireEvent.change(email, { target: { value: 'tom@example.com' } });
    fireEvent.change(screen.getByLabelText('password'), { target: { value: 'Welcome12' } });
    fireEvent.change(screen.getByLabelText('your_name'), { target: { value: 'Tom' } });
    fireEvent.click(screen.getByRole('button', { name: 'invite_page_register' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('EMAIL_ALREADY_EXISTS');
    expect(email).toHaveAttribute('aria-invalid', 'true');
    expect(email).toHaveAccessibleDescription('EMAIL_ALREADY_EXISTS');
    expect(screen.getByLabelText('password')).toHaveAttribute('aria-invalid', 'false');
  });
});
