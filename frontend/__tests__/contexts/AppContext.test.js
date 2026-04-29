import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { AppProvider, useApp } from '../../contexts/AppContext';
import * as api from '../../lib/api';

jest.mock('../../lib/api');

function Probe() {
  const { loading, loggedIn, familyId } = useApp();
  return (
    <div>
      <span data-testid="loading">{loading ? 'loading' : 'ready'}</span>
      <span data-testid="logged-in">{loggedIn ? 'yes' : 'no'}</span>
      <span data-testid="family-id">{familyId}</span>
    </div>
  );
}

describe('AppProvider bootstrap', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.history.replaceState(null, '', '/');

    api.apiGetMe.mockResolvedValue({
      ok: true,
      data: {
        id: 1,
        email: 'tester@example.com',
        display_name: 'Tester',
        profile_image: '',
        has_completed_onboarding: true,
        must_change_password: false,
      },
    });
    api.apiGetMyFamilies.mockResolvedValue({
      ok: true,
      data: [{ family_id: 7, family_name: 'Test Family', role: 'admin', is_adult: true }],
    });
    api.apiGetDashboard.mockResolvedValue({ ok: true, data: { next_events: [], upcoming_birthdays: [] } });
    api.apiGetEvents.mockResolvedValue({ ok: true, data: [] });
    api.apiGetMembers.mockResolvedValue({ ok: true, data: [] });
    api.apiGetContacts.mockResolvedValue({ ok: true, data: [] });
    api.apiGetBirthdays.mockResolvedValue({ ok: true, data: [] });
    api.apiGetShoppingLists.mockResolvedValue({ ok: true, data: [] });
    api.apiGetActivity.mockResolvedValue({ ok: true, data: { items: [] } });
    api.apiGetNavOrder.mockResolvedValue({ ok: true, data: { nav_order: ['dashboard'] } });
    api.apiGetTimeFormat.mockResolvedValue({ ok: true, data: { time_format: '24h' } });
    api.apiGetUnreadCount.mockResolvedValue({ ok: true, data: { count: 0 } });
    api.apiGetNotifications.mockResolvedValue({ ok: true, data: [] });
    api.connectNotificationStream.mockReturnValue({ close: jest.fn() });
  });

  test('does not keep the app shell blocked by slow secondary data loaders', async () => {
    api.apiGetTasks.mockReturnValue(new Promise(() => {}));

    render(
      <AppProvider>
        <Probe />
      </AppProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('logged-in')).toHaveTextContent('yes'));
    await waitFor(() => expect(screen.getByTestId('family-id')).toHaveTextContent('7'));
    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('ready'));
    expect(api.apiGetTasks).toHaveBeenCalledWith('7');
    expect(api.apiGetActivity).toHaveBeenCalledWith('7', 10, 0);
  });
});
