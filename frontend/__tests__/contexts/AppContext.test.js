import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { AppProvider, useApp } from '../../contexts/AppContext';
import * as api from '../../lib/api';

jest.mock('../../lib/api');

function Probe() {
  const { loading, loggedIn, familyId, isMobile, isAdmin, isChild, switchFamily } = useApp();
  return (
    <div>
      <span data-testid="loading">{loading ? 'loading' : 'ready'}</span>
      <span data-testid="logged-in">{loggedIn ? 'yes' : 'no'}</span>
      <span data-testid="family-id">{familyId}</span>
      <span data-testid="is-mobile">{isMobile ? 'mobile' : 'desktop'}</span>
      <span data-testid="family-role">{isAdmin ? 'admin' : isChild ? 'child' : 'member'}</span>
      <button type="button" onClick={() => switchFamily('8')}>Switch family</button>
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
      data: [
        { family_id: 7, family_name: 'Test Family', role: 'admin', is_adult: true },
        { family_id: 8, family_name: 'Child Family', role: 'member', is_adult: false },
      ],
    });
    api.apiGetDashboard.mockResolvedValue({ ok: true, data: { next_events: [], upcoming_birthdays: [] } });
    api.apiGetEvents.mockResolvedValue({ ok: true, data: [] });
    api.apiGetMembers.mockResolvedValue({ ok: true, data: [] });
    api.apiGetContacts.mockResolvedValue({ ok: true, data: [] });
    api.apiGetBirthdays.mockResolvedValue({ ok: true, data: [] });
    api.apiGetTasks.mockResolvedValue({ ok: true, data: [] });
    api.apiGetShoppingLists.mockResolvedValue({ ok: true, data: [] });
    api.apiGetActivity.mockResolvedValue({ ok: true, data: { items: [] } });
    api.apiGetQuickCaptureInbox.mockResolvedValue({ ok: true, data: { items: [] } });
    api.apiGetNavOrder.mockResolvedValue({ ok: true, data: { nav_order: ['dashboard'] } });
    api.apiGetTimeFormat.mockResolvedValue({ ok: true, data: { time_format: '24h' } });
    api.apiGetUnreadCount.mockResolvedValue({ ok: true, data: { count: 0 } });
    api.apiGetNotifications.mockResolvedValue({ ok: true, data: [] });
    api.connectNotificationStream.mockReturnValue({ close: jest.fn() });
  });

  test('treats the 768px CSS breakpoint as mobile runtime state', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 768 });

    render(
      <AppProvider>
        <Probe />
      </AppProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('is-mobile')).toHaveTextContent('mobile'));
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
    await waitFor(() => expect(screen.getByTestId('family-role')).toHaveTextContent('admin'));
    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('ready'));
    expect(api.apiGetTasks).toHaveBeenCalledWith('7');
    expect(api.apiGetActivity).toHaveBeenCalledWith('7', 10, 0);
    expect(api.apiGetQuickCaptureInbox).toHaveBeenCalledWith('7', 10, 0);
  });

  test('switches the selected family and refreshes app-wide data from the flattened context', async () => {
    render(
      <AppProvider>
        <Probe />
      </AppProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('family-id')).toHaveTextContent('7'));
    await waitFor(() => expect(screen.getByTestId('family-role')).toHaveTextContent('admin'));

    fireEvent.click(screen.getByRole('button', { name: 'Switch family' }));

    await waitFor(() => expect(screen.getByTestId('family-id')).toHaveTextContent('8'));
    await waitFor(() => expect(screen.getByTestId('family-role')).toHaveTextContent('child'));
    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('ready'));

    expect(api.apiGetDashboard).toHaveBeenCalledWith('8');
    expect(api.apiGetEvents).toHaveBeenCalledWith('8');
    expect(api.apiGetMembers).toHaveBeenCalledWith('8');
    expect(api.apiGetContacts).toHaveBeenCalledWith('8');
    expect(api.apiGetBirthdays).toHaveBeenCalledWith('8');
    expect(api.apiGetTasks).toHaveBeenCalledWith('8');
    expect(api.apiGetShoppingLists).toHaveBeenCalledWith('8');
    expect(api.apiGetActivity).toHaveBeenCalledWith('8', 10, 0);
    expect(api.apiGetQuickCaptureInbox).toHaveBeenCalledWith('8', 10, 0);
  });
});
