import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import NotificationsTab from '../../components/settings/NotificationsTab';
import { buildMessages } from '../../lib/i18n';
import * as api from '../../lib/api';
import usePushSubscription from '../../hooks/usePushSubscription';

let mockAppState = {};
const toastSuccess = jest.fn();

jest.mock('../../lib/api');
jest.mock('../../hooks/usePushSubscription');
jest.mock('../../contexts/AppContext', () => ({
  useApp: () => mockAppState,
}));
jest.mock('../../contexts/ToastContext', () => ({
  useToast: () => ({ success: toastSuccess }),
}));

describe('NotificationsTab push diagnostics', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAppState = { messages: buildMessages('en'), loggedIn: true, demoMode: false };
    api.apiGetNotificationPreferences.mockResolvedValue({
      ok: true,
      data: { reminders_enabled: true, reminder_minutes: 30, quiet_start: null, quiet_end: null, push_enabled: false },
    });
    api.apiGetPushStatus.mockResolvedValue({
      ok: true,
      data: {
        server_configured: false,
        vapid_public_key_available: false,
        pywebpush_available: true,
        subscription_count: 0,
        push_enabled: false,
        ready: false,
        blocked_reason: 'server_not_configured',
        last_attempt: null,
      },
    });
    usePushSubscription.mockReturnValue({
      pushSupported: true,
      pushSubscription: null,
      pushPermission: 'default',
      subscribe: jest.fn(),
      unsubscribe: jest.fn(),
    });
  });

  it('shows a server-side push configuration problem instead of an enabled-looking control', async () => {
    render(<NotificationsTab />);

    expect(await screen.findByText('Server push is not configured')).toBeInTheDocument();
    expect(screen.getByText(/Ask an admin to add VAPID keys/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enable push notifications' })).toBeDisabled();
  });

  it('shows unsupported browser and iOS installed-PWA guidance when push APIs are missing', async () => {
    usePushSubscription.mockReturnValue({
      pushSupported: false,
      pushSubscription: null,
      pushPermission: 'default',
      subscribe: jest.fn(),
      unsubscribe: jest.fn(),
    });

    render(<NotificationsTab />);

    expect(await screen.findByText('Push is not available in this browser')).toBeInTheDocument();
    expect(screen.getByText(/On iPhone or iPad, install Tribu to the Home Screen/)).toBeInTheDocument();
  });

  it('shows the current device as not subscribed even when another device is ready', async () => {
    api.apiGetPushStatus.mockResolvedValue({
      ok: true,
      data: {
        server_configured: true,
        vapid_public_key_available: true,
        pywebpush_available: true,
        subscription_count: 1,
        push_enabled: true,
        ready: true,
        blocked_reason: null,
        last_attempt: null,
      },
    });

    render(<NotificationsTab />);

    expect(await screen.findByText('This device is not subscribed yet')).toBeInTheDocument();
    expect(screen.queryByText('This device is ready')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enable push notifications' })).toBeEnabled();
  });

  it('sends a test push only when the device and server are ready', async () => {
    const testPush = jest.fn().mockResolvedValue({
      ok: true,
      data: { status: 'sent', attempted: 1, succeeded: 1, failed: 0, removed: 0, skipped_reason: null },
    });
    api.apiSendTestPush.mockImplementation(testPush);
    api.apiGetPushStatus.mockResolvedValue({
      ok: true,
      data: {
        server_configured: true,
        vapid_public_key_available: true,
        pywebpush_available: true,
        subscription_count: 1,
        push_enabled: true,
        ready: true,
        blocked_reason: null,
        last_attempt: { status: 'delivered', last_attempt_at: '2026-04-29T12:00:00' },
      },
    });
    usePushSubscription.mockReturnValue({
      pushSupported: true,
      pushSubscription: { endpoint: 'https://push.example/private' },
      pushPermission: 'granted',
      subscribe: jest.fn(),
      unsubscribe: jest.fn(),
    });

    render(<NotificationsTab />);

    const button = await screen.findByRole('button', { name: 'Send test notification' });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);

    await waitFor(() => expect(testPush).toHaveBeenCalledTimes(1));
    expect(toastSuccess).toHaveBeenCalledWith('Test notification sent');
    expect(screen.queryByText(/push.example/)).not.toBeInTheDocument();
  });
});
