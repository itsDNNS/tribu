/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

jest.mock('../../contexts/AppContext', () => ({
  useApp: () => ({ messages: {}, demoMode: false }),
}));

const mockToastSuccess = jest.fn();
const mockToastError = jest.fn();
jest.mock('../../contexts/ToastContext', () => ({
  useToast: () => ({ success: mockToastSuccess, error: mockToastError }),
}));

jest.mock('../../lib/i18n', () => ({ t: (_m, k) => k }));
jest.mock('../../lib/helpers', () => ({ errorText: (_d, f) => f }));

jest.mock('../../lib/api', () => ({
  apiGetOidcPresets: jest.fn(),
  apiGetOidcConfig: jest.fn(),
  apiUpdateOidcConfig: jest.fn(),
  apiTestOidcDiscovery: jest.fn(),
}));

import SsoSection from '../../components/admin/SsoSection';

const PRESETS = [
  { id: 'generic', name: 'Generic OIDC', button_label: 'Sign in with SSO', issuer_placeholder: 'https://idp.example.com', default_scopes: 'openid profile email', hint: 'Generic hint' },
  { id: 'authentik', name: 'Authentik', button_label: 'Sign in with Authentik', issuer_placeholder: 'https://auth/application/o/tribu/', default_scopes: 'openid profile email', hint: 'Authentik hint' },
];

function mockCfg(overrides = {}) {
  return {
    enabled: false,
    preset: 'generic',
    button_label: '',
    issuer: '',
    client_id: '',
    client_secret_set: false,
    scopes: 'openid profile email',
    allow_signup: false,
    disable_password_login: false,
    ready: false,
    ...overrides,
  };
}

describe('SsoSection admin panel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const api = require('../../lib/api');
    api.apiGetOidcPresets.mockResolvedValue({ ok: true, data: PRESETS });
    api.apiGetOidcConfig.mockResolvedValue({ ok: true, data: mockCfg() });
  });

  it('loads presets and config and renders the preset dropdown', async () => {
    render(<SsoSection />);
    await screen.findByTestId('sso-admin-section');
    const select = screen.getByTestId('sso-preset-select');
    expect(select.querySelectorAll('option')).toHaveLength(PRESETS.length);
  });

  it('includes client_secret in the update payload only when the admin types one', async () => {
    const api = require('../../lib/api');
    api.apiGetOidcConfig.mockResolvedValue({ ok: true, data: mockCfg({ client_secret_set: true, issuer: 'https://idp.example.com', client_id: 'tribu' }) });
    api.apiUpdateOidcConfig.mockResolvedValue({ ok: true, data: mockCfg({ client_secret_set: true, issuer: 'https://idp.example.com', client_id: 'tribu', button_label: 'hello' }) });

    render(<SsoSection />);
    await screen.findByTestId('sso-admin-section');

    // Change only the button_label and save — secret should NOT be in payload
    const labelInput = document.querySelector('input[value=""]');
    // Find the button label field by its label column
    const labels = Array.from(document.querySelectorAll('label'));
    const buttonLabelLabel = labels.find((l) => l.textContent === 'sso.button_label');
    const buttonLabelInput = buttonLabelLabel.parentElement.querySelector('input');
    fireEvent.change(buttonLabelInput, { target: { value: 'hello' } });

    fireEvent.submit(screen.getByTestId('sso-admin-section'));
    await waitFor(() => expect(api.apiUpdateOidcConfig).toHaveBeenCalled());
    const payload = api.apiUpdateOidcConfig.mock.calls[0][0];
    expect('client_secret' in payload).toBe(false);
  });

  it('sends client_secret: "" explicitly when Clear secret is pressed', async () => {
    const api = require('../../lib/api');
    api.apiGetOidcConfig.mockResolvedValue({ ok: true, data: mockCfg({ client_secret_set: true }) });
    api.apiUpdateOidcConfig.mockResolvedValue({ ok: true, data: mockCfg({ client_secret_set: false }) });

    render(<SsoSection />);
    await screen.findByTestId('sso-admin-section');

    const clearButton = screen.getByRole('button', { name: 'sso.client_secret_clear' });
    fireEvent.click(clearButton);

    fireEvent.submit(screen.getByTestId('sso-admin-section'));
    await waitFor(() => expect(api.apiUpdateOidcConfig).toHaveBeenCalled());
    const payload = api.apiUpdateOidcConfig.mock.calls[0][0];
    expect(payload.client_secret).toBe('');
  });

  it('shows a success banner when the discovery test succeeds', async () => {
    const api = require('../../lib/api');
    api.apiGetOidcConfig.mockResolvedValue({ ok: true, data: mockCfg({ issuer: 'https://idp.example.com' }) });
    api.apiTestOidcDiscovery.mockResolvedValue({ ok: true, data: { ok: true, authorization_endpoint: 'x' } });

    render(<SsoSection />);
    await screen.findByTestId('sso-admin-section');

    fireEvent.click(screen.getByRole('button', { name: /sso\.test/ }));
    await waitFor(() => expect(screen.getByText('sso.test_ok')).toBeInTheDocument());
  });

  it('shows the error from the discovery test result', async () => {
    const api = require('../../lib/api');
    api.apiGetOidcConfig.mockResolvedValue({ ok: true, data: mockCfg({ issuer: 'https://idp.example.com' }) });
    api.apiTestOidcDiscovery.mockResolvedValue({ ok: true, data: { ok: false, error: 'host unreachable' } });

    render(<SsoSection />);
    await screen.findByTestId('sso-admin-section');

    fireEvent.click(screen.getByRole('button', { name: /sso\.test/ }));
    await waitFor(() =>
      expect(screen.getByText('sso.test_fail')).toBeInTheDocument()
    );
  });
});
