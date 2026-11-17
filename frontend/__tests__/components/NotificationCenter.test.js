import { useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import NotificationCenter, { isNotificationExpired } from '../../components/NotificationCenter';
import * as api from '../../lib/api';
import { resetPendingClearForTests, setPendingClearUser, withoutPendingClear } from '../../lib/notificationClear';
import { UNDO_WINDOW_MS } from '../../lib/undo';
import { buildMockAppState, buildTestMessages, renderWithMockApp, setMockAppState } from '../test-utils';

const mockToastSuccess = jest.fn();
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

// The panel on top of real list state, with a fake server behind
// loadNotifications that, like AppContext, hides a delete still waiting.
function renderPanel(initial, { page = false, overrides = {} } = {}) {
  const server = { rows: initial.map((n) => ({ ...n })) };
  const app = {};
  const loadNotifications = jest.fn(async () => {
    if (server.offline) return;
    const data = withoutPendingClear(server.rows.map((n) => ({ ...n })), 1);
    app.setNotifications(data);
    app.setUnreadCount(data.filter((n) => !n.read).length);
  });
  const onClose = jest.fn();

  function Harness() {
    const [notifications, setNotifications] = useState(initial);
    const [unreadCount, setUnreadCount] = useState(initial.filter((n) => !n.read).length);
    Object.assign(app, { notifications, unreadCount, setNotifications, setUnreadCount });
    setMockAppState(buildMockAppState({
      messages: buildTestMessages({}, page ? 'en' : 'de'),
      lang: page ? 'en' : 'de',
      me: { id: 1, display_name: 'Dennis' },
      notifications,
      setNotifications,
      unreadCount,
      setUnreadCount,
      loadNotifications,
      ...overrides,
    }));
    return page ? <NotificationCenter /> : <NotificationCenter onClose={onClose} />;
  }

  const result = render(<Harness />);
  return { ...result, app, server, loadNotifications, onClose };
}

function pageEvent(type, persisted) {
  const event = new Event(type);
  Object.defineProperty(event, 'persisted', { value: persisted });
  return event;
}

function undoOf(call) {
  return mockToastSuccess.mock.calls[call][1].onClick;
}

describe('NotificationCenter panel actions', () => {
  let toastIds;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    resetPendingClearForTests();
    setPendingClearUser(1);
    toastIds = 0;
    mockToastSuccess.mockImplementation(() => { toastIds += 1; return toastIds; });
    api.apiMarkAllNotificationsRead.mockResolvedValue({ ok: true });
    api.apiDeleteAllNotifications.mockResolvedValue({ ok: true, data: { status: 'ok', deleted: 3 } });
  });

  afterEach(() => {
    resetPendingClearForTests();
    jest.useRealTimers();
  });

  it('offers mark all read and delete all next to the heading', async () => {
    renderPanel([notif(1), notif(2, { read: true })]);
    await act(async () => {});

    expect(screen.getByRole('heading', { name: 'Benachrichtigungen' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Alle als gelesen markieren' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Alle löschen' })).toBeVisible();
    expect(screen.getByText('Gelesene Benachrichtigungen verschwinden nach 7 Tagen.')).toBeVisible();
  });

  it('hides both actions when there is nothing to show', async () => {
    renderPanel([]);
    await act(async () => {});

    expect(screen.getByText('Keine Benachrichtigungen')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Alle löschen' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Alle als gelesen markieren' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Schließen' })).toBeVisible();
  });

  it('offers only delete all once everything is read', async () => {
    renderPanel([notif(1, { read: true })]);
    await act(async () => {});

    expect(screen.queryByRole('button', { name: 'Alle als gelesen markieren' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Alle löschen' })).toBeVisible();
  });

  it('marks all as read', async () => {
    const { app } = renderPanel([notif(1), notif(2)]);
    await act(async () => {});

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Alle als gelesen markieren' }));
    });

    expect(api.apiMarkAllNotificationsRead).toHaveBeenCalledTimes(1);
    expect(app.notifications.every((n) => n.read)).toBe(true);
    expect(app.unreadCount).toBe(0);
  });

  it('deletes all only after the undo window, up to the newest shown notification', async () => {
    const { app, loadNotifications } = renderPanel([notif(9, { title: 'Chloe Geburtstag' }), notif(4, { read: true }), notif(2)]);
    await act(async () => {});

    fireEvent.click(screen.getByRole('button', { name: 'Alle löschen' }));

    // Gone from the list and the badge at once, with an Undo toast; nothing sent yet.
    expect(screen.queryByText('Chloe Geburtstag')).not.toBeInTheDocument();
    expect(screen.getByText('Keine Benachrichtigungen')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Alle löschen' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Schließen' })).toHaveFocus();
    expect(mockToastSuccess).toHaveBeenCalledWith('Benachrichtigungen gelöscht', expect.objectContaining({ label: 'Rückgängig' }));
    expect(app.unreadCount).toBe(0);
    expect(api.apiDeleteAllNotifications).not.toHaveBeenCalled();

    loadNotifications.mockClear();
    await act(async () => { jest.advanceTimersByTime(UNDO_WINDOW_MS); });

    expect(api.apiDeleteAllNotifications).toHaveBeenCalledWith(9, { keepalive: false, userId: 1 });
    expect(mockToastDismiss).toHaveBeenCalledWith(1);
    // Afterwards the list and the badge come from the server.
    expect(loadNotifications).toHaveBeenCalled();
  });

  it('brings everything back with Undo, closes its toast and never sends the delete', async () => {
    renderPanel([notif(1, { title: 'Zahnarzt' }), notif(2, { read: true })]);
    await act(async () => {});

    fireEvent.click(screen.getByRole('button', { name: 'Alle löschen' }));
    expect(screen.queryByText('Zahnarzt')).not.toBeInTheDocument();

    await act(async () => { undoOf(0)(); });

    expect(screen.getByText('Zahnarzt')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Alle löschen' })).toBeVisible();
    expect(mockToastDismiss).toHaveBeenCalledWith(1);

    await act(async () => { jest.advanceTimersByTime(UNDO_WINDOW_MS * 2); });
    expect(api.apiDeleteAllNotifications).not.toHaveBeenCalled();
  });

  it('keeps the Undo working after the panel closes and sends only when the window is over', async () => {
    const { unmount } = renderPanel([notif(5), notif(3)]);
    await act(async () => {});

    fireEvent.click(screen.getByRole('button', { name: 'Alle löschen' }));
    await act(async () => { unmount(); });
    expect(api.apiDeleteAllNotifications).not.toHaveBeenCalled();
    expect(mockToastDismiss).not.toHaveBeenCalled();

    await act(async () => { jest.advanceTimersByTime(UNDO_WINDOW_MS - 1000); });
    expect(api.apiDeleteAllNotifications).not.toHaveBeenCalled();
    await act(async () => { jest.advanceTimersByTime(1000); });
    expect(api.apiDeleteAllNotifications).toHaveBeenCalledWith(5, { keepalive: false, userId: 1 });
  });

  it('can be undone after the panel closed', async () => {
    const { unmount } = renderPanel([notif(5)]);
    await act(async () => {});

    fireEvent.click(screen.getByRole('button', { name: 'Alle löschen' }));
    await act(async () => { unmount(); });
    await act(async () => { undoOf(0)(); });
    await act(async () => { jest.advanceTimersByTime(UNDO_WINDOW_MS * 2); });

    expect(api.apiDeleteAllNotifications).not.toHaveBeenCalled();
    expect(mockToastDismiss).toHaveBeenCalledWith(1);
  });

  it('sends a waiting delete with keepalive when the page unloads', async () => {
    renderPanel([notif(7)]);
    await act(async () => {});

    fireEvent.click(screen.getByRole('button', { name: 'Alle löschen' }));
    // Switching to another app keeps the window open ...
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    expect(api.apiDeleteAllNotifications).not.toHaveBeenCalled();
    // ... leaving the page does not.
    await act(async () => { window.dispatchEvent(pageEvent('pagehide', false)); });

    expect(api.apiDeleteAllNotifications).toHaveBeenCalledWith(7, { keepalive: true, userId: 1 });
    expect(mockToastDismiss).toHaveBeenCalledWith(1);
  });

  it('ignores an old Undo once a later delete took over', async () => {
    const { app, server } = renderPanel([notif(1, { title: 'Zahnarzt' })]);
    await act(async () => {});

    fireEvent.click(screen.getByRole('button', { name: 'Alle löschen' }));
    await act(async () => { undoOf(0)(); });
    fireEvent.click(screen.getByRole('button', { name: 'Alle löschen' }));
    expect(mockToastSuccess).toHaveBeenCalledTimes(2);

    // The first toast's button no longer cancels the second delete.
    await act(async () => { undoOf(0)(); });
    expect(screen.queryByText('Zahnarzt')).not.toBeInTheDocument();
    server.rows = [];
    await act(async () => { jest.advanceTimersByTime(UNDO_WINDOW_MS); });

    expect(api.apiDeleteAllNotifications).toHaveBeenCalledTimes(1);
    expect(app.notifications).toEqual([]);
  });

  it('counts unread again from the server after Undo, so "mark all read" in between holds', async () => {
    const { app, server } = renderPanel([notif(2), notif(1)]);
    await act(async () => {});
    api.apiMarkAllNotificationsRead.mockImplementation(async () => {
      server.rows = server.rows.map((n) => ({ ...n, read: true }));
      return { ok: true };
    });

    fireEvent.click(screen.getByRole('button', { name: 'Alle löschen' }));
    expect(app.unreadCount).toBe(0);
    // Another tab or device marks everything read meanwhile.
    await api.apiMarkAllNotificationsRead();
    await act(async () => { undoOf(0)(); });

    expect(app.notifications.map((n) => n.id)).toEqual([2, 1]);
    expect(app.notifications.every((n) => n.read)).toBe(true);
    expect(app.unreadCount).toBe(0);
  });

  it('shows everything again when the delete fails, also without reaching the server', async () => {
    api.apiDeleteAllNotifications.mockResolvedValue({ ok: false, data: {} });
    const { app, server } = renderPanel([notif(3, { title: 'Einkauf' }), notif(2, { read: true })]);
    await act(async () => {});

    fireEvent.click(screen.getByRole('button', { name: 'Alle löschen' }));
    expect(app.unreadCount).toBe(0);
    server.offline = true;
    await act(async () => { jest.advanceTimersByTime(UNDO_WINDOW_MS); });

    expect(mockToastError).toHaveBeenCalled();
    expect(screen.getByText('Einkauf')).toBeVisible();
    expect(app.notifications.map((n) => n.id)).toEqual([3, 2]);
    expect(app.unreadCount).toBe(1);
  });

  it('does not give the rows back to another account when the delete fails after a switch', async () => {
    let answer;
    api.apiDeleteAllNotifications.mockImplementation(() => new Promise((resolve) => { answer = resolve; }));
    const { app, server } = renderPanel([notif(4, { title: 'Annas' })]);
    await act(async () => {});

    fireEvent.click(screen.getByRole('button', { name: 'Alle löschen' }));
    await act(async () => { jest.advanceTimersByTime(UNDO_WINDOW_MS); });
    expect(api.apiDeleteAllNotifications).toHaveBeenCalled();
    // Ben signs in while Anna's request is still on its way, then it fails.
    setPendingClearUser(2);
    server.offline = true;
    await act(async () => { answer({ ok: false, data: {} }); });

    expect(mockToastError).not.toHaveBeenCalled();
    expect(app.notifications.map((n) => n.id)).toEqual([]);
    expect(app.unreadCount).toBe(0);
  });

  it('does not count rows twice when a reload brought them back before the delete failed', async () => {
    let answer;
    api.apiDeleteAllNotifications.mockImplementation(() => new Promise((resolve) => { answer = resolve; }));
    const { app, server, loadNotifications } = renderPanel([notif(5, { title: 'Neu' })]);
    await act(async () => {});

    fireEvent.click(screen.getByRole('button', { name: 'Alle löschen' }));
    await act(async () => { jest.advanceTimersByTime(UNDO_WINDOW_MS); });
    // The panel reopens while the request is on its way: the server still has the row.
    await act(async () => { await loadNotifications(); });
    expect(app.unreadCount).toBe(1);
    server.offline = true;
    await act(async () => { answer({ ok: false, data: {} }); });

    expect(app.notifications.map((n) => n.id)).toEqual([5]);
    expect(app.unreadCount).toBe(1);
  });

  it('keeps the countdown of a page kept for "back" or frozen, and sends nothing meanwhile', async () => {
    renderPanel([notif(8)]);
    await act(async () => {});

    fireEvent.click(screen.getByRole('button', { name: 'Alle löschen' }));
    await act(async () => { jest.advanceTimersByTime(4000); });
    await act(async () => { window.dispatchEvent(pageEvent('pagehide', true)); });
    await act(async () => { jest.advanceTimersByTime(UNDO_WINDOW_MS * 3); });
    expect(api.apiDeleteAllNotifications).not.toHaveBeenCalled();

    await act(async () => { window.dispatchEvent(pageEvent('pageshow', true)); });
    await act(async () => { document.dispatchEvent(new Event('freeze')); });
    await act(async () => { jest.advanceTimersByTime(UNDO_WINDOW_MS * 3); });
    expect(api.apiDeleteAllNotifications).not.toHaveBeenCalled();

    await act(async () => { document.dispatchEvent(new Event('resume')); });
    await act(async () => { jest.advanceTimersByTime(UNDO_WINDOW_MS - 4000 - 100); });
    expect(api.apiDeleteAllNotifications).not.toHaveBeenCalled();
    await act(async () => { jest.advanceTimersByTime(200); });
    expect(api.apiDeleteAllNotifications).toHaveBeenCalledWith(8, { keepalive: false, userId: 1 });
  });

  it('drops a waiting delete without sending it when another account takes over', async () => {
    renderPanel([notif(4, { title: 'Annas' })]);
    await act(async () => {});

    fireEvent.click(screen.getByRole('button', { name: 'Alle löschen' }));
    // Signed out, and Ben signs in within the undo window.
    setPendingClearUser(null);
    setPendingClearUser(2);
    await act(async () => { jest.advanceTimersByTime(UNDO_WINDOW_MS * 2); });

    expect(api.apiDeleteAllNotifications).not.toHaveBeenCalled();
    expect(mockToastDismiss).toHaveBeenCalledWith(1);
    // Ben's list is never filtered by Anna's cutoff.
    expect(withoutPendingClear([notif(4)], 2).map((n) => n.id)).toEqual([4]);
  });

  it('leaves out reminders whose moment has passed', async () => {
    const past = new Date(Date.now() - 60000).toISOString().replace('Z', '');
    const future = new Date(Date.now() + 3600000).toISOString().replace('Z', '');
    renderWithMockApp(<NotificationCenter onClose={jest.fn()} />, {
      messages: buildTestMessages({}, 'de'),
      notifications: [
        notif(1, { title: 'Startet bald', expires_at: future }),
        notif(2, { title: 'Hat schon begonnen', expires_at: past }),
      ],
    });

    expect(screen.getByText('Startet bald')).toBeVisible();
    expect(screen.queryByText('Hat schon begonnen')).not.toBeInTheDocument();
    expect(isNotificationExpired({ expires_at: past })).toBe(true);
    expect(isNotificationExpired({ expires_at: null })).toBe(false);
  });

  it('offers delete all on the notifications page too', async () => {
    renderPanel([notif(1)], { page: true });
    await act(async () => {});

    fireEvent.click(screen.getByRole('button', { name: 'Delete all' }));
    expect(screen.getByRole('heading', { name: 'Notifications' })).toHaveFocus();
    await act(async () => { jest.advanceTimersByTime(UNDO_WINDOW_MS); });
    expect(api.apiDeleteAllNotifications).toHaveBeenCalledWith(1, { keepalive: false, userId: 1 });
  });
});

describe('NotificationCenter "Don\'t remind me"', () => {
  const AT = '2026-12-08T09:00:00';
  const reminder = (link, overrides = {}) => ({
    id: 7, type: 'event_reminder', title: 'Swimming', body: 'Starts at 09:00', link,
    read: false, created_at: new Date().toISOString(), ...overrides,
  });
  const muteButton = () => screen.getByRole('button', { name: "Don't remind me" });

  beforeEach(() => {
    jest.clearAllMocks();
    api.apiMuteEventReminder.mockImplementation((id, scope) => Promise.resolve({ ok: true, data: { reminder_muted: scope } }));
  });

  it.each([
    ['a single event right away', `/calendar?event=42&at=${AT}`, null, 'series', 'Reminder off for this event'],
    ['this occurrence of a series', `/calendar?event=42&at=${AT}&repeats=1`, 'Only this one', 'occurrence', 'Reminder off for this event'],
    ['every repetition of a series', `/calendar?event=42&at=${AT}&repeats=1`, 'All repetitions', 'series', 'Reminder off for all repetitions'],
  ])('mutes %s, with Undo', async (_, link, choice, scope, toast) => {
    const setActiveView = jest.fn();
    const announced = [];
    const listen = (e) => announced.push(e.detail.state);
    window.addEventListener('tribu:reminder-mute-changed', listen);
    renderCenter({ notifications: [reminder(link)], setActiveView });

    if (choice) {
      expect(muteButton()).toHaveAttribute('aria-expanded', 'false');
      fireEvent.click(muteButton());
      expect(muteButton()).toHaveAttribute('aria-expanded', 'true');
      expect(muteButton()).toHaveAttribute('aria-controls', screen.getByRole('group', { name: 'Stop reminders for' }).id);
      expect(api.apiMuteEventReminder).not.toHaveBeenCalled();
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: choice })); });
      expect(screen.queryByRole('group')).not.toBeInTheDocument();
    } else {
      expect(muteButton()).not.toHaveAttribute('aria-expanded');
      await act(async () => { fireEvent.click(muteButton()); });
    }

    expect(api.apiMuteEventReminder).toHaveBeenCalledWith(42, scope, AT);
    // The notification itself does not open.
    expect(setActiveView).not.toHaveBeenCalled();
    expect(screen.getByText('Reminder off')).toHaveFocus();
    expect(mockToastSuccess).toHaveBeenCalledWith(toast, expect.objectContaining({ label: 'Undo' }));

    await act(async () => { await mockToastSuccess.mock.calls[0][1].onClick(); });
    expect(api.apiUnmuteEventReminder).toHaveBeenCalledWith(42, AT);
    expect(muteButton()).toBeInTheDocument();
    expect(mockToastSuccess).toHaveBeenLastCalledWith('Reminder back on');
    // An open calendar hears about both.
    window.removeEventListener('tribu:reminder-mute-changed', listen);
    expect(announced).toEqual([scope, null]);
  });

  it('closes the choice with Escape and returns to its button', () => {
    renderCenter({ notifications: [reminder(`/calendar?event=42&at=${AT}&repeats=1`)] });
    fireEvent.click(muteButton());
    fireEvent.keyDown(screen.getByRole('button', { name: 'Only this one' }), { key: 'Escape' });

    expect(screen.queryByRole('group')).not.toBeInTheDocument();
    expect(muteButton()).toHaveFocus();
  });

  it('keeps the button and says so when muting fails', async () => {
    api.apiMuteEventReminder.mockResolvedValue({ ok: false, data: null });
    renderCenter({ notifications: [reminder(`/calendar?event=42&at=${AT}`)] });

    await act(async () => { fireEvent.click(muteButton()); });

    expect(mockToastError).toHaveBeenCalledWith('Something went wrong');
    await waitFor(() => expect(muteButton()).toHaveFocus());
  });

  it('is only offered on event reminders that name their occurrence', () => {
    renderCenter({ notifications: [
      reminder('/calendar?event=42', { id: 1 }),
      reminder('/tasks?id=3', { id: 2, type: 'task_due' }),
      reminder(`/calendar?event=42&at=${AT}`, { id: 3, type: 'event_assigned' }),
    ] });

    expect(screen.queryByRole('button', { name: "Don't remind me" })).not.toBeInTheDocument();
  });
});
