import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import PhoneSyncTab from '../../components/settings/PhoneSyncTab';
import { buildMessages } from '../../lib/i18n';

let mockAppState = {};

jest.mock('../../contexts/AppContext', () => ({
  useApp: () => mockAppState,
}));

jest.mock('../../lib/helpers', () => ({
  copyTextToClipboard: jest.fn(async () => true),
}));

jest.mock('../../lib/api', () => ({
  apiGetTokens: jest.fn(),
  apiCreateToken: jest.fn(),
  apiRevokeToken: jest.fn(),
}));

const api = require('../../lib/api');

function baseState(overrides) {
  return {
    me: { email: 'mail@example.com' },
    families: [
      { family_id: 1, family_name: 'Alpha' },
      { family_id: 2, family_name: 'Beta' },
    ],
    messages: buildMessages('de'),
    ...overrides,
  };
}

describe('PhoneSyncTab', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    api.apiGetTokens.mockResolvedValue({ ok: true, data: [] });
    api.apiCreateToken.mockResolvedValue({ ok: true, data: { token: 'tribu_pat_new', pat: { id: 9 } } });
    api.apiRevokeToken.mockResolvedValue({ ok: true });
  });
  test('renders one shared DAV server URL plus username for end users', async () => {
    mockAppState = baseState();

    render(<PhoneSyncTab />);

    expect(await screen.findByText('Server-URL')).toBeInTheDocument();
    expect(screen.getByText('Benutzername')).toBeInTheDocument();
    expect(screen.getByText('http://localhost/dav')).toBeInTheDocument();
    expect(screen.getByText('mail@example.com')).toBeInTheDocument();
    expect(screen.queryByText(/cal-1|book-1|cal-2|book-2/)).not.toBeInTheDocument();
  });

  test('explains that calendars and address books appear after login', async () => {
    mockAppState = baseState();

    render(<PhoneSyncTab />);

    expect(await screen.findByText('Was danach erscheint')).toBeInTheDocument();
    expect(
      screen.getByText(/Nach der Anmeldung zeigt Tribu automatisch die Kalender und Adressbücher aller Familien/i),
    ).toBeInTheDocument();
  });

  test('shows DAV token health without exposing raw failure details', async () => {
  api.apiGetTokens.mockResolvedValue({
    ok: true,
    data: [
      {
        id: 1,
        name: 'iPhone Calendar',
        scopes: 'calendar:read,calendar:write,contacts:read,contacts:write',
        last_dav_success_at: '2026-04-29T08:00:00Z',
        last_dav_failure_at: null,
        last_dav_failure_reason: null,
      },
      {
        id: 2,
        name: 'Old DAVx5',
        scopes: 'calendar:read',
        last_dav_success_at: null,
        last_dav_failure_at: '2026-04-29T09:00:00Z',
        last_dav_failure_reason: 'scope_mismatch',
      },
      {
        id: 3,
        name: 'Shopping Bot',
        scopes: 'shopping:read',
        last_dav_success_at: null,
        last_dav_failure_at: '2026-04-29T10:00:00Z',
        last_dav_failure_reason: 'server traceback: secret',
      },
    ],
  });
  mockAppState = baseState();

  render(<PhoneSyncTab />);

  expect(await screen.findByText('Sync-Status')).toBeInTheDocument();
  expect(screen.getByText('iPhone Calendar')).toBeInTheDocument();
  expect(screen.getByText('Old DAVx5')).toBeInTheDocument();
  expect(screen.queryByText('Shopping Bot')).not.toBeInTheDocument();
  expect(screen.getByText('Berechtigungen passen nicht zum Client')).toBeInTheDocument();
  expect(screen.queryByText(/server traceback|secret/i)).not.toBeInTheDocument();
});

test('shows a safe error when token health cannot be loaded', async () => {
  api.apiGetTokens.mockRejectedValue(new Error('network failed with secret'));
  mockAppState = baseState();

  render(<PhoneSyncTab />);

  expect(await screen.findByText('Der Sync-Status konnte gerade nicht geladen oder geändert werden. Bitte versuche es erneut.')).toBeInTheDocument();
  expect(screen.queryByText(/network failed|secret/i)).not.toBeInTheDocument();
});

test('renews and disables DAV tokens from the health view', async () => {
  api.apiGetTokens.mockResolvedValue({
    ok: true,
    data: [{
      id: 7,
      name: 'DAVx5',
      scopes: 'calendar:read,contacts:read,shopping:read',
      last_dav_success_at: null,
      last_dav_failure_at: null,
      last_dav_failure_reason: null,
    }],
  });
  mockAppState = baseState();
  global.confirm = jest.fn(() => true);

  render(<PhoneSyncTab />);

  fireEvent.click(await screen.findByRole('button', { name: /Token erneuern/i }));
  await waitFor(() => expect(api.apiCreateToken).toHaveBeenCalledWith({
    name: 'DAVx5 erneuert',
    scopes: ['calendar:read', 'contacts:read'],
  }));
  expect(await screen.findByText('tribu_pat_new')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /Token deaktivieren/i }));
  await waitFor(() => expect(api.apiRevokeToken).toHaveBeenCalledWith(7));
});
});
