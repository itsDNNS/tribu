import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import NotificationDestinationsTab from '../../components/settings/NotificationDestinationsTab';
import { buildMessages } from '../../lib/i18n';
import * as api from '../../lib/api';

let mockAppState = {};
const toastSuccess = jest.fn();
const toastError = jest.fn();

jest.mock('../../lib/api');
jest.mock('../../contexts/AppContext', () => ({
  useApp: () => mockAppState,
}));
jest.mock('../../contexts/ToastContext', () => ({
  useToast: () => ({ success: toastSuccess, error: toastError }),
}));

describe('NotificationDestinationsTab', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAppState = { familyId: 1, messages: buildMessages('en') };
    api.apiListNotificationDestinations.mockResolvedValue({ ok: true, data: [] });
    api.apiGetNotificationDestinationProviderStatus.mockResolvedValue({ ok: true, data: { available: true } });
    api.apiCreateNotificationDestination.mockResolvedValue({ ok: true, data: { id: 1 } });
    api.apiUpdateNotificationDestination.mockResolvedValue({ ok: true, data: { id: 1 } });
    api.apiDeleteNotificationDestination.mockResolvedValue({ ok: true, data: { status: 'deleted' } });
    api.apiTestNotificationDestination.mockResolvedValue({ ok: true, data: { status: 'delivered' } });
  });

  it('lists redacted destinations and never renders raw secret values', async () => {
    api.apiListNotificationDestinations.mockResolvedValue({
      ok: true,
      data: [{
        id: 7,
        name: 'Kitchen ntfy',
        provider: 'apprise',
        url_redacted: 'ntfy://[redacted]',
        events: ['calendar.reminder', 'task.reminder', 'shopping.item.changed'],
        active: true,
        respect_quiet_hours: true,
        has_secret: true,
        last_status: 'never',
      }],
    });

    render(<NotificationDestinationsTab />);

    expect(await screen.findByText('Kitchen ntfy')).toBeInTheDocument();
    expect(screen.getByText('ntfy://[redacted]')).toBeInTheDocument();
    expect(screen.getByText(/Destination URLs may contain passwords or tokens/)).toBeInTheDocument();
    expect(screen.queryByText(/placeholder-token/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/placeholder-topic/i)).not.toBeInTheDocument();
    expect(screen.getAllByText(/Shopping item changes/).length).toBeGreaterThan(0);
  });

  it('creates a destination and sends safe test notifications', async () => {
    render(<NotificationDestinationsTab />);

    fireEvent.change(await screen.findByLabelText('Name'), { target: { value: 'Household Gotify' } });
    fireEvent.change(screen.getByLabelText('Apprise URL'), { target: { value: 'gotify://host.example/placeholder-token' } });
    expect(screen.getByLabelText('Shopping list changes')).not.toBeChecked();
    fireEvent.click(screen.getByLabelText('Shopping item changes'));
    fireEvent.click(screen.getByRole('button', { name: 'Add destination' }));

    await waitFor(() => expect(api.apiCreateNotificationDestination).toHaveBeenCalledTimes(1));
    expect(api.apiCreateNotificationDestination).toHaveBeenCalledWith(expect.objectContaining({
      family_id: 1,
      name: 'Household Gotify',
      target_url_secret: 'gotify://host.example/placeholder-token',
      events: expect.arrayContaining(['calendar.reminder', 'shopping.item.changed']),
    }));
    expect(api.apiCreateNotificationDestination.mock.calls[0][0].events).not.toContain('shopping.list.changed');
    expect(toastSuccess).toHaveBeenCalledWith('Notification destination saved');

    api.apiListNotificationDestinations.mockResolvedValue({
      ok: true,
      data: [{
        id: 9,
        name: 'Household Gotify',
        provider: 'apprise',
        url_redacted: 'gotify://[redacted]',
        events: ['calendar.reminder'],
        active: true,
        respect_quiet_hours: true,
        has_secret: true,
        last_status: 'never',
      }],
    });
    render(<NotificationDestinationsTab />);
    fireEvent.click(await screen.findByRole('button', { name: 'Send test' }));

    await waitFor(() => expect(api.apiTestNotificationDestination).toHaveBeenCalledWith(9));
    expect(toastSuccess).toHaveBeenCalledWith('Test notification sent');
    expect(screen.queryByText(/placeholder-token/i)).not.toBeInTheDocument();
  });

  it('shows provider unavailable state without hiding existing in-app notification settings', async () => {
    api.apiGetNotificationDestinationProviderStatus.mockResolvedValue({
      ok: true,
      data: { available: false },
    });

    render(<NotificationDestinationsTab />);

    expect(await screen.findByText('Apprise is not available on this server')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Household Gotify' } });
    fireEvent.change(screen.getByLabelText('Apprise URL'), { target: { value: 'gotify://host.example/placeholder-token' } });
    expect(screen.getByRole('button', { name: 'Add destination' })).not.toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Add destination' }));
    await waitFor(() => expect(api.apiCreateNotificationDestination).toHaveBeenCalledTimes(1));
  });

  it('disables test sends while the provider is unavailable', async () => {
    api.apiGetNotificationDestinationProviderStatus.mockResolvedValue({ ok: true, data: { available: false } });
    api.apiListNotificationDestinations.mockResolvedValue({
      ok: true,
      data: [{
        id: 9,
        name: 'Household Gotify',
        provider: 'apprise',
        url_redacted: 'gotify://[redacted]',
        events: ['calendar.reminder'],
        active: true,
        respect_quiet_hours: true,
        has_secret: true,
        last_status: 'never',
      }],
    });

    render(<NotificationDestinationsTab />);

    expect(await screen.findByText('Household Gotify')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send test' })).toBeDisabled();
  });

  it('shows failed test notifications as errors instead of success toasts', async () => {
    api.apiListNotificationDestinations.mockResolvedValue({
      ok: true,
      data: [{
        id: 9,
        name: 'Household Gotify',
        provider: 'apprise',
        url_redacted: 'gotify://[redacted]',
        events: ['calendar.reminder'],
        active: true,
        respect_quiet_hours: true,
        has_secret: true,
        last_status: 'never',
      }],
    });
    api.apiTestNotificationDestination.mockResolvedValue({ ok: true, data: { status: 'failed', error: 'send_failed' } });

    render(<NotificationDestinationsTab />);
    fireEvent.click(await screen.findByRole('button', { name: 'Send test' }));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Test notification failed'));
    expect(toastSuccess).not.toHaveBeenCalledWith('Test notification failed');
  });

  it('asks for confirmation before deleting a destination', async () => {
    api.apiListNotificationDestinations.mockResolvedValue({
      ok: true,
      data: [{
        id: 9,
        name: 'Household Gotify',
        provider: 'apprise',
        url_redacted: 'gotify://[redacted]',
        events: ['calendar.reminder'],
        active: true,
        respect_quiet_hours: true,
        has_secret: true,
        last_status: 'never',
      }],
    });
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(false);

    render(<NotificationDestinationsTab />);
    fireEvent.click(await screen.findByLabelText('Delete Household Gotify'));

    expect(confirmSpy).toHaveBeenCalledWith('Delete notification destination Household Gotify?');
    expect(api.apiDeleteNotificationDestination).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });
});
