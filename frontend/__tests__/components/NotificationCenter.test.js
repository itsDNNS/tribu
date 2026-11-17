import { act, fireEvent, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import NotificationCenter, { isNotificationExpired } from '../../components/NotificationCenter';
import * as api from '../../lib/api';
import { UNDO_WINDOW_MS } from '../../lib/undo';
import { buildTestMessages, renderWithMockApp } from '../test-utils';

const mockToastSuccess = jest.fn(() => 77);
const mockToastError = jest.fn();
const mockToastDismiss = jest.fn();

jest.mock('../../lib/api', () => require('../test-utils').createMockApi());

jest.mock('../../contexts/AppContext', () => ({
  useApp: () => require('../test-utils').getMockAppState(),
}));

jest.mock('../../contexts/ToastContext', () => ({
  useToast: () => ({ success: mockToastSuccess, error: mockToastError, dismiss: mockToastDismiss }),
}));

function renderCenter(overrides = {}) {
  return renderWithMockApp(<NotificationCenter />, {
    messages: buildTestMessages(),
    lang: 'en',
    isAdmin: true,
    isChild: false,
    demoMode: false,
    ...overrides,
  });
}

describe('NotificationCenter external destination callout', () => {
  beforeEach(() => {
    sessionStorage.clear();
    jest.clearAllMocks();
    api.apiMarkNotificationRead.mockResolvedValue({ ok: true });
    api.apiMarkAllNotificationsRead.mockResolvedValue({ ok: true });
    api.apiDeleteNotification.mockResolvedValue({ ok: true });
  });

  it('links admins from the notifications page to household notification destinations', () => {
    const setActiveView = jest.fn();
    renderCenter({ setActiveView });

    fireEvent.click(screen.getByRole('button', { name: 'Configure household notifications' }));

    expect(sessionStorage.getItem('tribu_settings_tab')).toBe('notification_destinations');
    expect(setActiveView).toHaveBeenCalledWith('settings');
  });

  it('does not show the destination callout to non-admins', () => {
    renderCenter({ isAdmin: false });

    expect(screen.queryByRole('button', { name: 'Configure household notifications' })).not.toBeInTheDocument();
  });

  it('localizes scheduler notification body fallbacks', () => {
    renderCenter({
      messages: buildTestMessages({}, 'de'),
      lang: 'de',
      notifications: [
        {
          id: 1,
          type: 'event_reminder',
          title: 'Musikschule',
          body: 'Starts in 15 minutes',
          read: false,
          created_at: new Date().toISOString(),
        },
        {
          id: 2,
          type: 'task_due',
          title: 'Müll rausbringen',
          body: 'Task is overdue',
          read: false,
          created_at: new Date().toISOString(),
        },
        {
          id: 3,
          type: 'birthday',
          title: 'Oma',
          body: 'Birthday tomorrow (May 13)',
          read: false,
          created_at: new Date().toISOString(),
        },
      ],
    });

    expect(screen.getByText('Beginnt in 15 Minuten')).toBeVisible();
    expect(screen.getByText('Aufgabe ist überfällig')).toBeVisible();
    expect(screen.getByText('Geburtstag morgen (May 13)')).toBeVisible();
    expect(screen.queryByText('Starts in 15 minutes')).not.toBeInTheDocument();
    expect(screen.queryByText('Task is overdue')).not.toBeInTheDocument();
  });

  it('normalizes concrete notification links to the owning PWA view', () => {
    const setActiveView = jest.fn();
    renderCenter({
      setActiveView,
      notifications: [
        {
          id: 1,
          type: 'event_reminder',
          title: 'Musikschule',
          body: 'Starts in 15 minutes',
          link: '/calendar?event=42',
          read: false,
          created_at: new Date().toISOString(),
        },
      ],
    });

    fireEvent.click(screen.getByRole('button', { name: /Musikschule/i }));

    expect(setActiveView).toHaveBeenCalledWith('calendar');
  });

  it('routes birthday notification links to contacts in the PWA', () => {
    const setActiveView = jest.fn();
    renderCenter({
      setActiveView,
      notifications: [
        {
          id: 1,
          type: 'birthday',
          title: 'Oma',
          body: 'Birthday tomorrow (May 13)',
          link: '/birthdays?id=7',
          read: false,
          created_at: new Date().toISOString(),
        },
      ],
    });

    fireEvent.click(screen.getByRole('button', { name: /Oma/i }));

    expect(setActiveView).toHaveBeenCalledWith('contacts');
  });
});

function notif(id, overrides = {}) {
  return {
    id,
    type: 'system',
    title: `Notice ${id}`,
    body: null,
    read: false,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

// The panel with a state-less app mock: setNotifications and setUnreadCount
// are spies, so the tests apply their updaters to see what they would do.
function renderPanel(notifications, overrides = {}) {
  const onClose = jest.fn();
  const result = renderWithMockApp(<NotificationCenter onClose={onClose} />, {
    messages: buildTestMessages({}, 'de'),
    lang: 'de',
    notifications,
    unreadCount: notifications.filter((n) => !n.read).length,
    setNotifications: jest.fn(),
    setUnreadCount: jest.fn(),
    ...overrides,
  });
  return { ...result, onClose };
}

function applyUpdater(spy, value) {
  return spy.mock.calls.reduce((current, [update]) => (typeof update === 'function' ? update(current) : update), value);
}

describe('NotificationCenter panel actions', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockToastSuccess.mockImplementation(() => 77);
    api.apiMarkAllNotificationsRead.mockResolvedValue({ ok: true });
    api.apiDeleteAllNotifications.mockResolvedValue({ ok: true, data: { status: 'ok', deleted: 3 } });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('offers mark all read and delete all next to the heading', () => {
    renderPanel([notif(1), notif(2, { read: true })]);

    expect(screen.getByRole('heading', { name: 'Benachrichtigungen' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Alle als gelesen markieren' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Alle löschen' })).toBeVisible();
    expect(screen.getByText('Gelesene Benachrichtigungen verschwinden nach 7 Tagen.')).toBeVisible();
  });

  it('hides both actions when there is nothing to show', () => {
    renderPanel([]);

    expect(screen.getByText('Keine Benachrichtigungen')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Alle löschen' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Alle als gelesen markieren' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Schließen' })).toBeVisible();
  });

  it('offers only delete all once everything is read', () => {
    renderPanel([notif(1, { read: true })]);

    expect(screen.queryByRole('button', { name: 'Alle als gelesen markieren' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Alle löschen' })).toBeVisible();
  });

  it('marks all as read', async () => {
    const { appState } = renderPanel([notif(1), notif(2)]);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Alle als gelesen markieren' }));
    });

    expect(api.apiMarkAllNotificationsRead).toHaveBeenCalledTimes(1);
    expect(applyUpdater(appState.setNotifications, [notif(1), notif(2)]).every((n) => n.read)).toBe(true);
    expect(appState.setUnreadCount).toHaveBeenCalledWith(0);
  });

  it('deletes all only after the undo window, up to the newest shown notification', async () => {
    const notifications = [notif(9, { title: 'Chloe Geburtstag' }), notif(4, { read: true }), notif(2)];
    const { appState } = renderPanel(notifications);

    fireEvent.click(screen.getByRole('button', { name: 'Alle löschen' }));

    // Gone from the list at once, with an Undo toast; nothing sent yet.
    expect(screen.queryByText('Chloe Geburtstag')).not.toBeInTheDocument();
    expect(screen.getByText('Keine Benachrichtigungen')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Alle löschen' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Schließen' })).toHaveFocus();
    expect(mockToastSuccess).toHaveBeenCalledWith('Benachrichtigungen gelöscht', expect.objectContaining({ label: 'Rückgängig' }));
    expect(api.apiDeleteAllNotifications).not.toHaveBeenCalled();
    expect(applyUpdater(appState.setUnreadCount, 2)).toBe(0);

    await act(async () => { jest.advanceTimersByTime(UNDO_WINDOW_MS); });

    expect(api.apiDeleteAllNotifications).toHaveBeenCalledWith(9);
    expect(mockToastDismiss).toHaveBeenCalledWith(77);
    // One that arrived while the toast was up stays.
    expect(applyUpdater(appState.setNotifications, [notif(12), ...notifications]).map((n) => n.id)).toEqual([12]);
  });

  it('brings everything back with Undo and never sends the delete', async () => {
    const { appState } = renderPanel([notif(1, { title: 'Zahnarzt' }), notif(2, { read: true })]);

    fireEvent.click(screen.getByRole('button', { name: 'Alle löschen' }));
    expect(screen.queryByText('Zahnarzt')).not.toBeInTheDocument();

    const [, action] = mockToastSuccess.mock.calls[0];
    act(() => { action.onClick(); });

    expect(screen.getByText('Zahnarzt')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Alle löschen' })).toBeVisible();
    // The unread count goes down and back up again.
    expect(applyUpdater(appState.setUnreadCount, 1)).toBe(1);

    await act(async () => { jest.advanceTimersByTime(UNDO_WINDOW_MS * 2); });
    expect(api.apiDeleteAllNotifications).not.toHaveBeenCalled();
  });

  it('sends a waiting delete at once when the panel closes', async () => {
    const { unmount } = renderPanel([notif(5)]);

    fireEvent.click(screen.getByRole('button', { name: 'Alle löschen' }));
    await act(async () => { unmount(); });

    expect(api.apiDeleteAllNotifications).toHaveBeenCalledWith(5);
    expect(mockToastDismiss).toHaveBeenCalledWith(77);
  });

  it('shows everything again when the delete fails', async () => {
    api.apiDeleteAllNotifications.mockResolvedValue({ ok: false, data: {} });
    const { appState } = renderPanel([notif(3, { title: 'Einkauf' })]);

    fireEvent.click(screen.getByRole('button', { name: 'Alle löschen' }));
    await act(async () => { jest.advanceTimersByTime(UNDO_WINDOW_MS); });

    expect(mockToastError).toHaveBeenCalled();
    expect(screen.getByText('Einkauf')).toBeVisible();
    expect(appState.setNotifications).not.toHaveBeenCalled();
    expect(applyUpdater(appState.setUnreadCount, 1)).toBe(1);
  });

  it('leaves out reminders whose moment has passed', () => {
    const past = new Date(Date.now() - 60000).toISOString().replace('Z', '');
    const future = new Date(Date.now() + 3600000).toISOString().replace('Z', '');
    renderPanel([
      notif(1, { title: 'Startet bald', expires_at: future }),
      notif(2, { title: 'Hat schon begonnen', expires_at: past }),
    ]);

    expect(screen.getByText('Startet bald')).toBeVisible();
    expect(screen.queryByText('Hat schon begonnen')).not.toBeInTheDocument();
    expect(isNotificationExpired({ expires_at: past })).toBe(true);
    expect(isNotificationExpired({ expires_at: null })).toBe(false);
  });

  it('offers delete all on the notifications page too', async () => {
    renderWithMockApp(<NotificationCenter />, {
      messages: buildTestMessages(),
      notifications: [notif(1)],
      unreadCount: 1,
      setNotifications: jest.fn(),
      setUnreadCount: jest.fn(),
    });

    fireEvent.click(screen.getByRole('button', { name: 'Delete all' }));
    expect(screen.getByRole('heading', { name: 'Notifications' })).toHaveFocus();
    await act(async () => { jest.advanceTimersByTime(UNDO_WINDOW_MS); });
    expect(api.apiDeleteAllNotifications).toHaveBeenCalledWith(1);
  });
});
