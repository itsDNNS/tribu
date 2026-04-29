import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import WebhooksTab from '../../components/settings/WebhooksTab';
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

describe('WebhooksTab', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAppState = { familyId: 1 };
    api.apiListWebhooks.mockResolvedValue({ ok: true, data: [] });
    api.apiCreateWebhook.mockResolvedValue({ ok: true, data: { id: 1 } });
    api.apiUpdateWebhook.mockResolvedValue({ ok: true, data: { id: 1 } });
    api.apiDeleteWebhook.mockResolvedValue({ ok: true, data: { status: 'deleted' } });
    api.apiTestWebhook.mockResolvedValue({ ok: true, data: { status: 'delivered' } });
  });

  it('lists configured webhooks with redacted target URLs only', async () => {
    api.apiListWebhooks.mockResolvedValue({
      ok: true,
      data: [{
        id: 42,
        name: 'Home Assistant',
        url_redacted: 'https://ha.example/hooks/[redacted]',
        events: ['calendar.event.created', 'task.created'],
        active: true,
        has_secret: true,
        secret_header_name: 'X-Tribu-Secret',
      }],
    });

    render(<WebhooksTab />);

    expect(await screen.findByText('Home Assistant')).toBeInTheDocument();
    expect(screen.getByText('https://ha.example/hooks/[redacted]')).toBeInTheDocument();
    expect(screen.queryByText(/token=secret/i)).not.toBeInTheDocument();
    expect(screen.getByText('Secret Header: X-Tribu-Secret')).toBeInTheDocument();
  });

  it('creates a webhook for the active family', async () => {
    render(<WebhooksTab />);

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Node-RED' } });
    fireEvent.change(screen.getByLabelText('Webhook URL'), { target: { value: 'https://node-red.example/webhook/abc?token=private' } });
    fireEvent.change(screen.getByLabelText('Optionaler Secret Header'), { target: { value: 'X-Tribu-Secret' } });
    fireEvent.change(screen.getByPlaceholderText('Secret Wert'), { target: { value: 'super-secret' } });
    fireEvent.click(screen.getByRole('button', { name: 'Webhook hinzufügen' }));

    await waitFor(() => expect(api.apiCreateWebhook).toHaveBeenCalledTimes(1));
    expect(api.apiCreateWebhook).toHaveBeenCalledWith(expect.objectContaining({
      family_id: 1,
      name: 'Node-RED',
      url: 'https://node-red.example/webhook/abc?token=private',
      secret_header_name: 'X-Tribu-Secret',
      secret_header_value: 'super-secret',
    }));
    expect(toastSuccess).toHaveBeenCalledWith('Webhook gespeichert');
  });

  it('sends a test webhook without showing secret values', async () => {
    api.apiListWebhooks.mockResolvedValue({
      ok: true,
      data: [{
        id: 7,
        name: 'Gotify',
        url_redacted: 'https://gotify.example/message?[redacted]',
        events: ['shopping.item.created'],
        active: true,
        has_secret: false,
      }],
    });

    render(<WebhooksTab />);

    const testButton = await screen.findByRole('button', { name: 'Test senden' });
    fireEvent.click(testButton);

    await waitFor(() => expect(api.apiTestWebhook).toHaveBeenCalledWith(7));
    expect(toastSuccess).toHaveBeenCalledWith('Test-Webhook gesendet');
    expect(screen.queryByText(/super-secret/i)).not.toBeInTheDocument();
  });
});
