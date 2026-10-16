/**
 * @jest-environment jsdom
 */
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';

const mockSetLoggedIn = jest.fn();
jest.mock('../../contexts/AppContext', () => ({
  useApp: () => ({
    messages: {},
    setLoggedIn: mockSetLoggedIn,
    enterDemo: jest.fn(),
    lang: 'en',
    setLang: jest.fn(),
    availableLanguages: [{ key: 'en' }],
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
  errorText: (detail, fallback) => detail?.code || fallback,
}));

jest.mock('../../lib/api', () => ({
  apiGetOidcPublicConfig: jest.fn(),
  apiLogin: jest.fn(),
  apiLoginMfa: jest.fn(),
  apiRegister: jest.fn(),
}));

import AuthPage from '../../components/AuthPage';

async function submitPassword() {
  const api = require('../../lib/api');
  render(<AuthPage />);
  await waitFor(() => expect(api.apiGetOidcPublicConfig).toHaveBeenCalled());
  fireEvent.change(screen.getByLabelText('email'), { target: { value: 'anna@example.com' } });
  fireEvent.change(screen.getByLabelText('password'), { target: { value: 'Secure1Pass' } });
  fireEvent.click(screen.getByRole('button', { name: 'login' }));
}

describe('AuthPage two-step sign-in', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const api = require('../../lib/api');
    api.apiGetOidcPublicConfig.mockResolvedValue({ ok: true, data: { enabled: false, ready: false } });
    api.apiLogin.mockResolvedValue({ ok: true, data: { status: 'mfa_required', mfa_token: 'challenge' } });
  });

  it('asks for the code after the password and signs in with it', async () => {
    const api = require('../../lib/api');
    api.apiLoginMfa.mockResolvedValue({ ok: true, data: { status: 'ok' } });
    await submitPassword();

    const code = await screen.findByLabelText('two_step.code_or_recovery');
    expect(mockSetLoggedIn).not.toHaveBeenCalled();
    fireEvent.change(code, { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'login' }));

    await waitFor(() => expect(mockSetLoggedIn).toHaveBeenCalledWith(true));
    expect(api.apiLoginMfa).toHaveBeenCalledWith('challenge', '123456');
  });

  it('returns to the password step when the challenge expired', async () => {
    const api = require('../../lib/api');
    api.apiLoginMfa.mockResolvedValue({ ok: false, data: { detail: { code: 'MFA_CHALLENGE_INVALID' } } });
    await submitPassword();

    fireEvent.change(await screen.findByLabelText('two_step.code_or_recovery'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'login' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('MFA_CHALLENGE_INVALID');
    expect(screen.getByLabelText('password')).toBeInTheDocument();
    expect(mockSetLoggedIn).not.toHaveBeenCalled();
  });
});
