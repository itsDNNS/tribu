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
const { buildStagePayload } = require('../test-utils/stageFixture');

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

    const missing = screen.getByTestId('display-state-missing');
    expect(missing).toBeInTheDocument();
    expect(missing).toHaveTextContent('Pair this device by opening the link an admin generated under Admin → Displays.');
    expect(screen.getByTestId('display-root')).toHaveClass('display-root--stage');
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

  test('keeps the offline copy when the same token is opened again', async () => {
    mockRouter.isReady = true;
    mockRouter.query = { token: 'tribu_display_same' };
    window.localStorage.setItem('tribu_display_token', 'tribu_display_same');
    window.localStorage.setItem('tribu_display_cache', JSON.stringify({ me: sampleMe, dashboard: buildStagePayload(), at: Date.now() - 60000 }));
    api.apiDisplayMe.mockResolvedValue({ ok: false, status: 0, data: null });

    await act(async () => { render(<DisplayPage />); });
    await flushAsync();

    expect(screen.getByTestId('display-family-name')).toHaveTextContent('Familie Berger');
    expect(window.localStorage.getItem('tribu_display_cache')).not.toBeNull();
  });

  test('drops the offline copy when a different display is paired', async () => {
    mockRouter.isReady = true;
    mockRouter.query = { token: 'tribu_display_new' };
    window.localStorage.setItem('tribu_display_token', 'tribu_display_old');
    window.localStorage.setItem('tribu_display_cache', JSON.stringify({ me: sampleMe, dashboard: buildStagePayload(), at: Date.now() - 60000 }));
    api.apiDisplayMe.mockResolvedValue({ ok: false, status: 0, data: null });

    await act(async () => { render(<DisplayPage />); });
    await flushAsync();

    expect(window.localStorage.getItem('tribu_display_token')).toBe('tribu_display_new');
    expect(window.localStorage.getItem('tribu_display_cache')).toBeNull();
  });

  test('renders the read-only stage with safe fields only', async () => {
    mockRouter.isReady = true;
    window.localStorage.setItem('tribu_display_token', 'tribu_display_stored');
    api.apiDisplayMe.mockResolvedValue({ ok: true, status: 200, data: sampleMe });
    api.apiDisplayDashboard.mockResolvedValue({ ok: true, status: 200, data: buildStagePayload() });

    await act(async () => { render(<DisplayPage />); });
    await flushAsync();
    await flushAsync();

    expect(await screen.findByTestId('display-family-name')).toHaveTextContent('Familie Berger');
    expect(screen.getByTestId('display-dashboard')).toHaveAttribute('data-layout-preset', 'stage');
    for (const zone of ['a', 'b', 'c', 'd']) expect(screen.getByTestId(`display-zone-${zone}`)).toBeInTheDocument();
    expect(screen.getByTestId('display-root').textContent).not.toMatch(/@/);

    // No admin/settings/sidebar/search/quick-add controls.
    expect(screen.queryByText(/^Settings$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Admin$/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/sidebar/i)).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/search/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /quick.*add/i })).not.toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem('tribu_display_cache')).dashboard.family_name).toBe('Familie Berger');
  });

  test('uses the configured display language', async () => {
    mockRouter.isReady = true;
    window.localStorage.setItem('tribu_display_token', 'tribu_display_lang');
    const payload = buildStagePayload({
      config: { display_mode: 'tablet', refresh_interval_seconds: 60, layout_preset: 'stage', layout_config: { version: 2, language: 'de' } },
    });
    api.apiDisplayMe.mockResolvedValue({ ok: true, status: 200, data: sampleMe });
    api.apiDisplayDashboard.mockResolvedValue({ ok: true, status: 200, data: payload });

    await act(async () => { render(<DisplayPage />); });
    await flushAsync();

    await waitFor(() => expect(screen.getByTestId('display-root')).toHaveAttribute('lang', 'de'));
    expect(screen.getByTestId('display-events').textContent).toMatch(/bei euch/);
  });

  test('keeps the last good data on the wall when the network drops', async () => {
    jest.useFakeTimers();
    mockRouter.isReady = true;
    window.localStorage.setItem('tribu_display_token', 'tribu_display_offline');
    api.apiDisplayMe.mockResolvedValue({ ok: true, status: 200, data: sampleMe });
    api.apiDisplayDashboard.mockResolvedValue({ ok: true, status: 200, data: buildStagePayload() });

    await act(async () => { render(<DisplayPage />); });
    await flushAsync();
    await flushAsync();
    expect(screen.getByTestId('display-dashboard')).toBeInTheDocument();

    api.apiDisplayMe.mockResolvedValue({ ok: false, status: 0, data: null });
    await act(async () => { jest.advanceTimersByTime(61 * 1000); });
    await flushAsync();

    expect(screen.getByTestId('display-dashboard')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/Offline/);
    expect(window.localStorage.getItem('tribu_display_token')).toBe('tribu_display_offline');
    jest.useRealTimers();
  });

  test('starts from the cached copy while offline and never mistakes a server error for an unpaired device', async () => {
    mockRouter.isReady = true;
    window.localStorage.setItem('tribu_display_token', 'tribu_display_cached');
    window.localStorage.setItem('tribu_display_cache', JSON.stringify({ me: sampleMe, dashboard: buildStagePayload(), at: Date.now() - 60000 }));
    api.apiDisplayMe.mockResolvedValue({ ok: false, status: 503, data: null });

    await act(async () => { render(<DisplayPage />); });
    await flushAsync();

    expect(screen.getByTestId('display-family-name')).toHaveTextContent('Familie Berger');
    expect(screen.getByRole('status')).toHaveTextContent(/Offline/);
    expect(screen.queryByTestId('display-state-invalid')).not.toBeInTheDocument();
  });

  test('a server error without cached data keeps loading instead of unpairing', async () => {
    mockRouter.isReady = true;
    window.localStorage.setItem('tribu_display_token', 'tribu_display_down');
    api.apiDisplayMe.mockResolvedValue({ ok: false, status: 502, data: null });

    await act(async () => { render(<DisplayPage />); });
    await flushAsync();

    expect(screen.getByTestId('display-state-loading')).toBeInTheDocument();
    expect(window.localStorage.getItem('tribu_display_token')).toBe('tribu_display_down');
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
    expect(window.localStorage.getItem('tribu_display_cache')).toBeNull();
  });
});
