import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { AppProvider, useApp } from '../../contexts/AppContext';
import * as api from '../../lib/api';
import { resetPendingClearForTests, startPendingClear, withoutPendingClear } from '../../lib/notificationClear';

jest.mock('../../lib/api');

function Probe() {
  const { events, members, contacts, birthdays, tasks, shoppingLists, summary, activity, quickCaptureInbox, loading, loggedIn, familyId, isMobile, isAdmin, isChild, theme, setTheme, weekStart, setWeekStart, switchFamily } = useApp();
  return (
    <div>
      <output data-testid="household-data">{JSON.stringify({ events, members, contacts, birthdays, tasks, shoppingLists, summary, activity, quickCaptureInbox })}</output>
      <span data-testid="loading">{loading ? 'loading' : 'ready'}</span>
      <span data-testid="logged-in">{loggedIn ? 'yes' : 'no'}</span>
      <span data-testid="family-id">{familyId}</span>
      <span data-testid="is-mobile">{isMobile ? 'mobile' : 'desktop'}</span>
      <span data-testid="family-role">{isAdmin ? 'admin' : isChild ? 'child' : 'member'}</span>
      <span data-testid="theme">{theme}</span>
      <span data-testid="week-start">{weekStart}</span>
      <button type="button" onClick={() => setTheme('dark')}>Switch dark theme</button>
      <button type="button" onClick={() => setWeekStart('sunday')}>Start weeks on Sunday</button>
      <button type="button" onClick={() => switchFamily('8')}>Switch family</button>
    </div>
  );
}

function NotifProbe() {
  const { notifications, unreadCount, loadNotifications, loading } = useApp();
  return (
    <div>
      <span data-testid="loading">{loading ? 'loading' : 'ready'}</span>
      <span data-testid="notif-ids">{notifications.map((n) => n.id).join(',')}</span>
      <span data-testid="unread">{unreadCount}</span>
      <button type="button" onClick={() => loadNotifications()}>Reload notifications</button>
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

  test('follows the 768px CSS breakpoint even when innerWidth is stale after folding', async () => {
    const listeners = [];
    const mobileQuery = { matches: true, addEventListener: (_type, fn) => listeners.push(fn), removeEventListener: jest.fn() };
    const original = window.matchMedia;
    window.matchMedia = jest.fn((media) => (media === '(max-width: 768px)' ? mobileQuery : { matches: false }));
    // Unfolding an iPhone Duo: the shell CSS is already wide while innerWidth still reports the cover display.
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 382 });
    try {
      render(<AppProvider><Probe /></AppProvider>);
      await waitFor(() => expect(screen.getByTestId('is-mobile')).toHaveTextContent('mobile'));
      mobileQuery.matches = false;
      act(() => listeners.forEach((fn) => fn()));
      await waitFor(() => expect(screen.getByTestId('is-mobile')).toHaveTextContent('desktop'));
    } finally {
      window.matchMedia = original;
    }
  });

  test('applies dark theme through data-theme without exposing a generated ui object', async () => {
    render(
      <AppProvider>
        <Probe />
      </AppProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('theme')).toHaveTextContent('system'));
    expect(document.documentElement).toHaveAttribute('data-theme', 'light');

    fireEvent.click(screen.getByRole('button', { name: 'Switch dark theme' }));

    await waitFor(() => expect(screen.getByTestId('theme')).toHaveTextContent('dark'));
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
    expect(document.documentElement).toHaveAttribute('data-scheme', 'dark');
    expect(window.localStorage.getItem('tribu_theme')).toBe('dark');
  });

  test('picking a theme sets its family, and Match device follows that family', async () => {
    const query = { matches: true, addEventListener: jest.fn(), removeEventListener: jest.fn() };
    const original = window.matchMedia;
    window.matchMedia = jest.fn(() => query);
    function Picker() {
      const { setTheme } = useApp();
      return (
        <>
          <button type="button" onClick={() => setTheme('garden')}>Pick Garden</button>
          <button type="button" onClick={() => setTheme('system')}>Match device</button>
        </>
      );
    }
    try {
      render(<AppProvider><Probe /><Picker /></AppProvider>);
      fireEvent.click(screen.getByRole('button', { name: 'Pick Garden' }));
      await waitFor(() => expect(document.documentElement).toHaveAttribute('data-theme', 'garden'));
      expect(window.localStorage.getItem('tribu_theme_dark')).toBe('garden-night');
      fireEvent.click(screen.getByRole('button', { name: 'Match device' }));
      await waitFor(() => expect(document.documentElement).toHaveAttribute('data-theme', 'garden-night'));
      expect(document.documentElement).toHaveAttribute('data-scheme', 'dark');
    } finally {
      window.matchMedia = original;
    }
  });

  test('marks every theme as a light or dark scheme, and forgets themes that no longer exist', async () => {
    window.localStorage.setItem('tribu_theme', 'hearth');
    const { unmount } = render(<AppProvider><Probe /></AppProvider>);
    await waitFor(() => expect(document.documentElement).toHaveAttribute('data-theme', 'hearth'));
    expect(document.documentElement).toHaveAttribute('data-scheme', 'dark');
    unmount();

    window.localStorage.setItem('tribu_theme', 'garden');
    render(<AppProvider><Probe /></AppProvider>);
    await waitFor(() => expect(document.documentElement).toHaveAttribute('data-theme', 'garden'));
    expect(document.documentElement).toHaveAttribute('data-scheme', 'light');

    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'tribu_theme', newValue: 'retired-theme' }));
    });
    await waitFor(() => expect(screen.getByTestId('theme')).toHaveTextContent('system'));
  });

  test('starts with the stored appearance and follows changes from other tabs', async () => {
    window.localStorage.setItem('tribu_theme', 'dark');
    const states = [];
    function ThemeSpy() {
      states.push(useApp().theme);
      return null;
    }
    render(<AppProvider><ThemeSpy /><Probe /></AppProvider>);
    // No first render with another theme, so nothing repaints after the pre-paint script.
    expect(states[0]).toBe('dark');
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');

    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'tribu_theme', newValue: 'light' }));
    });
    await waitFor(() => expect(document.documentElement).toHaveAttribute('data-theme', 'light'));
    expect(screen.getByTestId('theme')).toHaveTextContent('light');
  });

  test('follows the device when the appearance is system', async () => {
    const listeners = [];
    const query = { matches: true, addEventListener: (_type, fn) => listeners.push(fn), removeEventListener: jest.fn() };
    const original = window.matchMedia;
    window.matchMedia = jest.fn(() => query);
    try {
      render(<AppProvider><Probe /></AppProvider>);
      await waitFor(() => expect(document.documentElement).toHaveAttribute('data-theme', 'dark'));
      expect(screen.getByTestId('theme')).toHaveTextContent('system');
      query.matches = false;
      act(() => listeners.forEach((fn) => fn()));
      await waitFor(() => expect(document.documentElement).toHaveAttribute('data-theme', 'light'));
    } finally {
      window.matchMedia = original;
    }
  });

  test('keeps a chosen language with the account for the app and reminders', async () => {
    api.apiUpdateUiPreferences.mockResolvedValue({ ok: true, data: {} });
    function LanguageProbe() {
      const { setLang, loggedIn } = useApp();
      return <button type="button" disabled={!loggedIn} onClick={() => setLang('de')}>German</button>;
    }
    render(<AppProvider><LanguageProbe /></AppProvider>);
    await waitFor(() => expect(screen.getByRole('button', { name: 'German' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'German' }));
    expect(api.apiUpdateUiPreferences).toHaveBeenCalledWith({ language: 'de' });
    await waitFor(() => expect(window.localStorage.getItem('tribu_lang')).toBe('de'));
  });

  test('asks for the signed-in account only once at startup', async () => {
    render(<AppProvider><Probe /></AppProvider>);

    await waitFor(() => expect(screen.getByTestId('family-id')).toHaveTextContent('7'));
    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('ready'));
    expect(api.apiGetMe).toHaveBeenCalledTimes(1);
  });

  test('loads the account after a fresh sign-in', async () => {
    api.apiGetMe.mockResolvedValueOnce({ ok: false, status: 401, data: null });
    api.apiGetSetupStatus.mockResolvedValue({ ok: true, data: { needs_setup: false } });
    function SignInProbe() {
      const { setLoggedIn, me } = useApp();
      return (
        <>
          <button type="button" onClick={() => setLoggedIn(true)}>Sign in</button>
          <span data-testid="me">{me?.display_name || ''}</span>
        </>
      );
    }
    render(<AppProvider><SignInProbe /></AppProvider>);
    await waitFor(() => expect(api.apiGetSetupStatus).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(screen.getByTestId('me')).toHaveTextContent('Tester'));
    expect(api.apiGetMe).toHaveBeenCalledTimes(2);
  });

  test('shows the stored language from the first ready render', async () => {
    window.localStorage.setItem('tribu_lang', 'de');
    const seen = [];
    function LanguageProbe() {
      const { localeReady, messages } = useApp();
      seen.push({ localeReady, title: messages['module.today.title'] });
      return <span data-testid="locale-ready">{localeReady ? 'yes' : 'no'}</span>;
    }
    render(<AppProvider><LanguageProbe /></AppProvider>);

    await waitFor(() => expect(screen.getByTestId('locale-ready')).toHaveTextContent('yes'));
    expect(seen[0].localeReady).toBe(false);
    expect(seen.filter((entry) => entry.localeReady).map((entry) => entry.title)).not.toContain('Today');
    expect(seen[seen.length - 1].title).toBe('Heute');
  });

  test('restores a valid Sunday week-start preference', async () => {
    window.localStorage.setItem('tribu_week_start', 'sunday');

    render(<AppProvider><Probe /></AppProvider>);

    await waitFor(() => expect(screen.getByTestId('week-start')).toHaveTextContent('sunday'));
  });

  test('falls back to Monday for an invalid stored week-start preference', async () => {
    window.localStorage.setItem('tribu_week_start', 'locale');

    render(<AppProvider><Probe /></AppProvider>);

    await waitFor(() => expect(screen.getByTestId('week-start')).toHaveTextContent('monday'));
    expect(window.localStorage.getItem('tribu_week_start')).toBe('monday');
  });

  test('persists week-start changes', async () => {
    render(<AppProvider><Probe /></AppProvider>);

    fireEvent.click(screen.getByRole('button', { name: 'Start weeks on Sunday' }));

    await waitFor(() => expect(window.localStorage.getItem('tribu_week_start')).toBe('sunday'));
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
  test('ignores delayed household data from the previous household', async () => {
    const finish = [];
    for (const method of ['apiGetTasks', 'apiGetDashboard', 'apiGetActivity', 'apiGetEvents', 'apiGetMembers', 'apiGetBirthdays', 'apiGetShoppingLists', 'apiGetContacts', 'apiGetQuickCaptureInbox']) {
      api[method].mockImplementationOnce(() => new Promise((resolve) => finish.push(resolve)));
    }
    render(<AppProvider><Probe /></AppProvider>);
    await waitFor(() => expect(screen.getByTestId('family-id')).toHaveTextContent('7'));
    fireEvent.click(screen.getByRole('button', { name: 'Switch family' }));
    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('ready'));
    await act(async () => {
      for (const resolve of finish) resolve({ ok: true, data: { items: [{ title: 'Old household' }], title: 'Old household' } });
    });
    expect(screen.getByTestId('household-data')).not.toHaveTextContent('Old household');
  });


  test('keeps notifications waiting for "delete all" hidden when the list reloads', async () => {
    api.apiGetNotifications.mockResolvedValue({
      ok: true,
      data: [
        { id: 6, title: 'New', read: false, created_at: '2026-11-17T08:00:00' },
        { id: 5, title: 'Old', read: false, created_at: '2026-11-17T07:00:00' },
        { id: 4, title: 'Older', read: false, created_at: '2026-11-17T06:00:00' },
      ],
    });
    render(<AppProvider><NotifProbe /></AppProvider>);
    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('ready'));
    startPendingClear({ userId: 1, upToId: 5 });
    try {
      fireEvent.click(screen.getByRole('button', { name: 'Reload notifications' }));
      await waitFor(() => expect(screen.getByTestId('notif-ids')).toHaveTextContent(/^6$/));
      expect(screen.getByTestId('unread')).toHaveTextContent('1');
    } finally {
      resetPendingClearForTests();
    }
  });

  test('drops a reminder from the list and the badge when it expires', async () => {
    const soon = new Date(Date.now() + 400).toISOString().replace('Z', '');
    api.apiGetNotifications.mockResolvedValue({
      ok: true,
      data: [
        { id: 2, title: 'Starts now', read: false, created_at: '2026-11-17T08:00:00', expires_at: soon },
        { id: 1, title: 'Stays', read: false, created_at: '2026-11-17T07:00:00', expires_at: null },
      ],
    });
    render(<AppProvider><NotifProbe /></AppProvider>);
    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('ready'));
    fireEvent.click(screen.getByRole('button', { name: 'Reload notifications' }));
    await waitFor(() => expect(screen.getByTestId('notif-ids')).toHaveTextContent('2,1'));
    expect(screen.getByTestId('unread')).toHaveTextContent('2');

    await waitFor(() => expect(screen.getByTestId('notif-ids')).toHaveTextContent(/^1$/), { timeout: 2000 });
    expect(screen.getByTestId('unread')).toHaveTextContent('1');
  });

  test('drops a waiting "delete all" on sign-out instead of sending it with the next account', async () => {
    jest.useFakeTimers();
    function LogoutProbe() {
      const { loading, logout } = useApp();
      return (
        <div>
          <span data-testid="loading">{loading ? 'loading' : 'ready'}</span>
          <button type="button" onClick={() => logout()}>Sign out</button>
        </div>
      );
    }
    api.apiLogout.mockResolvedValue({ ok: true });
    api.apiDeleteAllNotifications.mockResolvedValue({ ok: true });
    try {
      render(<AppProvider><LogoutProbe /></AppProvider>);
      await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('ready'));
      const dismissToast = jest.fn();
      startPendingClear({ userId: 1, upToId: 5, dismissToast });
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Sign out' })); });
      await act(async () => { jest.advanceTimersByTime(20000); });

      expect(api.apiDeleteAllNotifications).not.toHaveBeenCalled();
      expect(dismissToast).toHaveBeenCalled();
      expect(withoutPendingClear([{ id: 3 }], 1)).toEqual([{ id: 3 }]);
    } finally {
      resetPendingClearForTests();
      jest.useRealTimers();
    }
  });

  test('clears loading when a request of a family switch fails', async () => {
    function SwitchProbe() {
      const { loading, familyId, switchFamily } = useApp();
      return (
        <div>
          <span data-testid="loading">{loading ? 'loading' : 'ready'}</span>
          <span data-testid="family-id">{familyId}</span>
          <button type="button" onClick={() => switchFamily('8').catch(() => {})}>Switch family</button>
        </div>
      );
    }
    render(<AppProvider><SwitchProbe /></AppProvider>);
    await waitFor(() => expect(screen.getByTestId('family-id')).toHaveTextContent('7'));
    api.apiGetMembers.mockRejectedValueOnce(new Error('offline'));

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Switch family' })); });

    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('ready'));
  });

  test('keeps a "Don\'t remind me" push link that arrives while starting', async () => {
    const listeners = [];
    Object.defineProperty(window.navigator, 'serviceWorker', {
      configurable: true,
      value: { addEventListener: (type, fn) => listeners.push(fn), removeEventListener: jest.fn() },
    });
    let loadFamilies;
    api.apiGetMyFamilies.mockReturnValue(new Promise((resolve) => { loadFamilies = resolve; }));
    function LinkProbe() {
      const { loading, pendingEventLink } = useApp();
      return (
        <div>
          <span data-testid="loading">{loading ? 'loading' : 'ready'}</span>
          <output data-testid="pending">{JSON.stringify(pendingEventLink)}</output>
        </div>
      );
    }
    const { unmount } = render(<AppProvider><LinkProbe /></AppProvider>);
    try {
      await waitFor(() => expect(listeners.length).toBeGreaterThan(0));
      act(() => {
        listeners.forEach((fn) => fn({ data: { type: 'NAVIGATE', url: '/calendar?event=4&family=8&at=2026-12-01T09:00:00&repeats=1&mute=choose' } }));
      });
      await act(async () => {
        loadFamilies({ ok: true, data: [{ family_id: 7, role: 'admin', is_adult: true }, { family_id: 8, role: 'member', is_adult: true }] });
      });
      await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('ready'));

      // Waiting for AppShell, which switches to family 8 and opens it.
      expect(JSON.parse(screen.getByTestId('pending').textContent)).toEqual({
        eventId: 4, familyId: 8, at: '2026-12-01T09:00:00', repeats: true, choose: true,
      });
    } finally {
      unmount();
      delete window.navigator.serviceWorker;
    }
  });
});

