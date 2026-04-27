import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

const routerReplace = jest.fn();
const mockRouter = { isReady: false, query: {}, replace: routerReplace };

jest.mock('next/router', () => ({
  useRouter: () => mockRouter,
}));

// IMPORTANT: the display page must not depend on AppContext or call
// /auth/me, /families/me, /families/{id}/members, /tokens or
// /notifications. We mock api.js to a tiny stub of just the display
// helpers and assert the test never invokes anything else.
jest.mock('../../lib/api', () => ({
  apiDisplayMe: jest.fn(),
  apiDisplayDashboard: jest.fn(),
}));

const api = require('../../lib/api');
const DisplayPage = require('../../pages/display').default;

const sampleMe = { device_id: 1, family_id: 7, family_name: 'Mueller', name: 'Kitchen Tablet' };
const sampleDashboard = {
  family_id: 7,
  family_name: 'Mueller',
  device_name: 'Kitchen Tablet',
  members: [
    { user_id: 1, display_name: 'Anna', is_adult: true, color: '#7c3aed', profile_image: null },
    { user_id: 2, display_name: 'Mia', is_adult: false, color: null, profile_image: null },
  ],
  next_events: [
    { id: 10, family_id: 7, title: 'Soccer practice', starts_at: '2099-01-02T18:00:00',
      ends_at: null, all_day: false, recurrence: null, recurrence_end: null,
      is_recurring: false, occurrence_date: null, assigned_to: null, color: null,
      category: null, created_by_user_id: 1, created_at: '2026-04-01T00:00:00',
      source_type: 'local' },
  ],
  upcoming_birthdays: [
    { person_name: 'Grandma Ilse', occurs_on: '2099-01-04', days_until: 2 },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  mockRouter.isReady = false;
  mockRouter.query = {};
  routerReplace.mockReset();
  try { window.localStorage.clear(); } catch {}
});

afterEach(() => {
  try { window.localStorage.clear(); } catch {}
});

function flushAsync() {
  return act(async () => { await Promise.resolve(); });
}

describe('DisplayPage', () => {
  test('shows the missing-pairing state when no token is in URL or storage', async () => {
    mockRouter.isReady = true;

    await act(async () => { render(<DisplayPage />); });
    await flushAsync();

    expect(screen.getByTestId('display-state-missing')).toBeInTheDocument();
    expect(api.apiDisplayMe).not.toHaveBeenCalled();
    expect(api.apiDisplayDashboard).not.toHaveBeenCalled();
  });

  test('persists the token from ?token= and scrubs it from the URL', async () => {
    mockRouter.isReady = true;
    mockRouter.query = { token: 'tribu_display_xyz' };
    api.apiDisplayMe.mockResolvedValue({ ok: true, status: 200, data: sampleMe });
    api.apiDisplayDashboard.mockResolvedValue({ ok: true, status: 200, data: sampleDashboard });

    await act(async () => { render(<DisplayPage />); });
    await flushAsync();
    await flushAsync();

    expect(window.localStorage.getItem('tribu_display_token')).toBe('tribu_display_xyz');
    expect(routerReplace).toHaveBeenCalledWith('/display', undefined, { shallow: true });
    await waitFor(() => expect(api.apiDisplayMe).toHaveBeenCalledWith('tribu_display_xyz'));
    expect(api.apiDisplayDashboard).toHaveBeenCalledWith('tribu_display_xyz');
  });

  test('renders the read-only dashboard with safe fields only', async () => {
    mockRouter.isReady = true;
    window.localStorage.setItem('tribu_display_token', 'tribu_display_stored');
    api.apiDisplayMe.mockResolvedValue({ ok: true, status: 200, data: sampleMe });
    api.apiDisplayDashboard.mockResolvedValue({ ok: true, status: 200, data: sampleDashboard });

    await act(async () => { render(<DisplayPage />); });
    await flushAsync();
    await flushAsync();

    const root = await screen.findByTestId('display-root');
    expect(within(root).getByText(/Kitchen Tablet/)).toBeInTheDocument();

    expect(await screen.findByTestId('display-family-name')).toHaveTextContent('Mueller');
    expect(screen.getByTestId('display-device-name')).toHaveTextContent('Kitchen Tablet');
    expect(screen.getByTestId('display-events')).toHaveTextContent('Soccer practice');
    expect(screen.getByTestId('display-birthdays')).toHaveTextContent('Grandma Ilse');
    expect(screen.getByTestId('display-members')).toHaveTextContent('Anna');
    expect(screen.getByTestId('display-members')).toHaveTextContent('Mia');

    // No admin/settings/sidebar/search/quick-add controls.
    expect(screen.queryByText(/^Settings$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Admin$/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/sidebar/i)).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/search/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /quick.*add/i })).not.toBeInTheDocument();
  });

  test('a revoked token shows the revoked-state message and keeps the token (so the message persists)', async () => {
    mockRouter.isReady = true;
    window.localStorage.setItem('tribu_display_token', 'tribu_display_revoked');
    api.apiDisplayMe.mockResolvedValue({
      ok: false,
      status: 401,
      data: { detail: { code: 'DISPLAY_TOKEN_REVOKED', message: 'Display token has been revoked' } },
    });

    await act(async () => { render(<DisplayPage />); });
    await flushAsync();
    await flushAsync();

    expect(await screen.findByTestId('display-state-revoked')).toBeInTheDocument();
    expect(api.apiDisplayDashboard).not.toHaveBeenCalled();
    expect(window.localStorage.getItem('tribu_display_token')).toBe('tribu_display_revoked');
  });

  test('a token revoked between display identity and dashboard requests keeps the revoked state', async () => {
    mockRouter.isReady = true;
    window.localStorage.setItem('tribu_display_token', 'tribu_display_race_revoked');
    api.apiDisplayMe.mockResolvedValue({ ok: true, status: 200, data: sampleMe });
    api.apiDisplayDashboard.mockResolvedValue({
      ok: false,
      status: 401,
      data: { detail: { code: 'DISPLAY_TOKEN_REVOKED', message: 'Display token has been revoked' } },
    });

    await act(async () => { render(<DisplayPage />); });
    await flushAsync();
    await flushAsync();

    expect(await screen.findByTestId('display-state-revoked')).toBeInTheDocument();
    expect(window.localStorage.getItem('tribu_display_token')).toBe('tribu_display_race_revoked');
  });

  test('an invalid token (not a known device) clears storage so the device can be re-paired', async () => {
    mockRouter.isReady = true;
    window.localStorage.setItem('tribu_display_token', 'tribu_display_unknown');
    api.apiDisplayMe.mockResolvedValue({
      ok: false,
      status: 401,
      data: { detail: { code: 'INVALID_TOKEN', message: 'Invalid token' } },
    });

    await act(async () => { render(<DisplayPage />); });
    await flushAsync();
    await flushAsync();

    expect(await screen.findByTestId('display-state-invalid')).toBeInTheDocument();
    expect(window.localStorage.getItem('tribu_display_token')).toBeNull();
  });
});

// `within` is imported lazily here to keep the original assertions
// readable. testing-library exposes it from the same module.
const { within } = require('@testing-library/react');
