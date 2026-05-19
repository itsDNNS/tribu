import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import NotificationCenter from '../../components/NotificationCenter';
import { buildMessages } from '../../lib/i18n';
import * as api from '../../lib/api';

let mockAppState = {};

jest.mock('../../lib/api', () => ({
  apiMarkNotificationRead: jest.fn(),
  apiMarkAllNotificationsRead: jest.fn(),
  apiDeleteNotification: jest.fn(),
}));

jest.mock('../../contexts/AppContext', () => ({
  useApp: () => mockAppState,
}));

function baseState(overrides = {}) {
  return {
    messages: buildMessages('en'),
    lang: 'en',
    notifications: [],
    setNotifications: jest.fn(),
    unreadCount: 0,
    setUnreadCount: jest.fn(),
    loadNotifications: jest.fn(),
    setActiveView: jest.fn(),
    isAdmin: true,
    isChild: false,
    demoMode: false,
    ...overrides,
  };
}

describe('NotificationCenter external destination callout', () => {
  beforeEach(() => {
    sessionStorage.clear();
    api.apiMarkNotificationRead.mockResolvedValue({ ok: true });
    api.apiMarkAllNotificationsRead.mockResolvedValue({ ok: true });
    api.apiDeleteNotification.mockResolvedValue({ ok: true });
    mockAppState = baseState();
  });

  it('links admins from the notifications page to household notification destinations', () => {
    const setActiveView = jest.fn();
    mockAppState = baseState({ setActiveView });

    render(<NotificationCenter />);

    fireEvent.click(screen.getByRole('button', { name: 'Configure household notifications' }));

    expect(sessionStorage.getItem('tribu_settings_tab')).toBe('notification_destinations');
    expect(setActiveView).toHaveBeenCalledWith('settings');
  });

  it('does not show the destination callout to non-admins', () => {
    mockAppState = baseState({ isAdmin: false });

    render(<NotificationCenter />);

    expect(screen.queryByRole('button', { name: 'Configure household notifications' })).not.toBeInTheDocument();
  });

  it('localizes scheduler notification body fallbacks', () => {
    mockAppState = baseState({
      messages: buildMessages('de'),
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

    render(<NotificationCenter />);

    expect(screen.getByText('Beginnt in 15 Minuten')).toBeVisible();
    expect(screen.getByText('Aufgabe ist überfällig')).toBeVisible();
    expect(screen.getByText('Geburtstag morgen (May 13)')).toBeVisible();
    expect(screen.queryByText('Starts in 15 minutes')).not.toBeInTheDocument();
    expect(screen.queryByText('Task is overdue')).not.toBeInTheDocument();
  });

  it('normalizes concrete notification links to the owning PWA view', () => {
    const setActiveView = jest.fn();
    mockAppState = baseState({
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

    render(<NotificationCenter />);

    fireEvent.click(screen.getByRole('button', { name: /Musikschule/i }));

    expect(setActiveView).toHaveBeenCalledWith('calendar');
  });

  it('routes birthday notification links to contacts in the PWA', () => {
    const setActiveView = jest.fn();
    mockAppState = baseState({
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

    render(<NotificationCenter />);

    fireEvent.click(screen.getByRole('button', { name: /Oma/i }));

    expect(setActiveView).toHaveBeenCalledWith('contacts');
  });
});
