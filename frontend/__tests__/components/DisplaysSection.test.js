import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import DisplaysSection from '../../components/admin/DisplaysSection';

let mockAppState;
const toastError = jest.fn();

jest.mock('../../contexts/AppContext', () => ({
  useApp: () => mockAppState,
}));

jest.mock('../../contexts/ToastContext', () => ({
  useToast: () => ({ error: toastError }),
}));

jest.mock('../../components/ConfirmDialog', () => (props) => (
  <div role="dialog" aria-label={props.title}>
    <p>{props.message}</p>
    <button onClick={props.onConfirm}>Confirm</button>
    <button onClick={props.onCancel}>Cancel</button>
  </div>
));

jest.mock('../../lib/api', () => ({
  apiListDisplayDevices: jest.fn(),
  apiCreateDisplayDevice: jest.fn(),
  apiRevokeDisplayDevice: jest.fn(),
}));

const api = require('../../lib/api');

const messages = {
  display_title: 'Displays',
  display_intro: 'Pair shared screens.',
  display_not_a_person: 'A display is a device, not a person.',
  display_no_devices: 'No displays.',
  display_create: 'Add display',
  display_name_label: 'Display name',
  display_name_placeholder: 'Kitchen Tablet',
  display_name_helper: 'For your reference.',
  display_link_created: 'Pairing link for {name}',
  display_link_hint: 'Open once.',
  display_link_share_hint: 'Anyone with the link can show the dashboard.',
  display_status_active: 'Active',
  display_status_revoked: 'Revoked',
  display_revoke: 'Remove',
  display_revoke_confirm: 'Remove "{name}"?',
  display_last_used: 'Last used: {when}',
  display_never_used: 'Never used',
  display_created: 'Added: {when}',
  cancel: 'Cancel',
  dismiss: 'Dismiss',
  token_copied: 'Copied',
  token_copy: 'Copy',
  toast: { error: 'Error' },
};

beforeEach(() => {
  jest.clearAllMocks();
  mockAppState = {
    familyId: 7,
    messages,
    demoMode: false,
  };
  api.apiListDisplayDevices.mockResolvedValue({ ok: true, data: [] });
});

function flushAsync() {
  return act(async () => { await Promise.resolve(); });
}

describe('DisplaysSection', () => {
  test('renders the not-a-person hint and an empty state', async () => {
    await act(async () => { render(<DisplaysSection />); });

    expect(screen.getByRole('heading', { name: 'Displays' })).toBeInTheDocument();
    expect(screen.getByTestId('display-not-a-person-hint')).toHaveTextContent(/not a person/i);
    expect(screen.getByText('No displays.')).toBeInTheDocument();
    expect(api.apiListDisplayDevices).toHaveBeenCalledWith(7);
  });

  test('creating a display surfaces the one-time pairing URL with a copy control', async () => {
    api.apiCreateDisplayDevice.mockResolvedValueOnce({
      ok: true,
      data: {
        token: 'tribu_display_abc',
        device: {
          id: 1, family_id: 7, name: 'Kitchen Tablet',
          created_at: '2026-04-27T08:00:00', last_used_at: null, revoked_at: null,
        },
      },
    });
    api.apiListDisplayDevices.mockResolvedValueOnce({ ok: true, data: [] });
    api.apiListDisplayDevices.mockResolvedValueOnce({ ok: true, data: [{
      id: 1, family_id: 7, name: 'Kitchen Tablet',
      created_at: '2026-04-27T08:00:00', last_used_at: null, revoked_at: null,
    }] });

    const writeText = jest.fn().mockResolvedValue();
    Object.defineProperty(window.navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    await act(async () => { render(<DisplaysSection />); });
    await flushAsync();

    fireEvent.click(screen.getByTestId('display-create-toggle'));
    fireEvent.change(screen.getByTestId('display-create-name'), {
      target: { value: 'Kitchen Tablet' },
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('display-create-submit'));
    });
    await flushAsync();

    const banner = await screen.findByTestId('display-created-banner');
    const url = within(banner).getByTestId('display-created-url');
    expect(url).toHaveTextContent('/display?token=tribu_display_abc');
    expect(within(banner).getByText(/Pairing link for Kitchen Tablet/)).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(within(banner).getByTestId('display-copy-url'));
    });
    expect(writeText).toHaveBeenCalledWith(
      expect.stringMatching(/\/display\?token=tribu_display_abc$/),
    );
    expect(within(banner).getByText('Copied')).toBeInTheDocument();
  });

  test('listing never exposes a token field; revoke triggers confirmation + API call', async () => {
    api.apiListDisplayDevices.mockResolvedValue({
      ok: true,
      data: [{
        id: 42, family_id: 7, name: 'Hallway',
        created_at: '2026-04-20T08:00:00', last_used_at: '2026-04-26T09:00:00', revoked_at: null,
      }],
    });
    api.apiRevokeDisplayDevice.mockResolvedValue({ ok: true });

    await act(async () => { render(<DisplaysSection />); });
    await flushAsync();

    const row = await screen.findByTestId('display-row-42');
    expect(row).toHaveTextContent('Hallway');
    expect(row).toHaveTextContent('Active');
    expect(row.outerHTML).not.toMatch(/tribu_display_/);
    expect(row.outerHTML).not.toMatch(/token_hash/);

    fireEvent.click(within(row).getByTestId('display-revoke-42'));
    const dialog = await screen.findByRole('dialog', { name: 'Remove' });
    expect(dialog).toHaveTextContent('Remove "Hallway"?');

    await act(async () => {
      fireEvent.click(within(dialog).getByText('Confirm'));
    });
    expect(api.apiRevokeDisplayDevice).toHaveBeenCalledWith(7, 42);
  });

  test('a revoked device shows the revoked status and hides the revoke button', async () => {
    api.apiListDisplayDevices.mockResolvedValue({
      ok: true,
      data: [{
        id: 9, family_id: 7, name: 'Old Tablet',
        created_at: '2026-04-01T08:00:00', last_used_at: null,
        revoked_at: '2026-04-15T08:00:00',
      }],
    });

    await act(async () => { render(<DisplaysSection />); });
    await flushAsync();

    const row = await screen.findByTestId('display-row-9');
    expect(row).toHaveTextContent('Revoked');
    expect(within(row).queryByTestId('display-revoke-9')).not.toBeInTheDocument();
  });
});
