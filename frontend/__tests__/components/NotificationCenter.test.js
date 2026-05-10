import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import NotificationCenter from '../../components/NotificationCenter';
import { buildMessages } from '../../lib/i18n';

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
});
