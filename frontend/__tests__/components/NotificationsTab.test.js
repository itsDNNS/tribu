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
      data: {
        reminders_enabled: true,
        reminder_minutes: 30,
        quiet_start: null,
        quiet_end: null,
        push_enabled: false,
        push_categories: {
          calendar_reminders: true,
          task_due: true,
          birthdays: true,
          event_assignments: false,
          shopping_changes: false,
          meal_plan_changes: false,
          family_changes: false,
        },
      },
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

  it('renders grouped category preferences and saves row-level choices', async () => {
    api.apiUpdateNotificationPreferences.mockResolvedValue({ ok: true, data: {} });

    render(<NotificationsTab />);

    expect(await screen.findByRole('heading', { name: 'Calendar & appointments' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Tasks' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Family' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Home' })).toBeInTheDocument();

    const assignmentToggle = screen.getByLabelText(/Event assignments/i);
    expect(screen.getByLabelText(/Calendar reminders/i)).toBeChecked();
    expect(assignmentToggle).not.toBeChecked();

    fireEvent.click(screen.getByText(/Events where someone assigns or mentions you/i));
    expect(assignmentToggle).toBeChecked();

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(api.apiUpdateNotificationPreferences).toHaveBeenCalled());
    expect(api.apiUpdateNotificationPreferences).toHaveBeenCalledWith(expect.objectContaining({
      push_categories: expect.objectContaining({
        calendar_reminders: true,
        event_assignments: true,
      }),
    }));
  });
});
