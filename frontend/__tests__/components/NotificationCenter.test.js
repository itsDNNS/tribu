import { fireEvent, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import NotificationCenter from '../../components/NotificationCenter';
import * as api from '../../lib/api';
import { buildTestMessages, renderWithMockApp } from '../test-utils';

jest.mock('../../lib/api', () => require('../test-utils').createMockApi());

jest.mock('../../contexts/AppContext', () => ({
  useApp: () => require('../test-utils').getMockAppState(),
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
