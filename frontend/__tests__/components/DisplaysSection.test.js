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
  apiUpdateDisplayDevice: jest.fn(),
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
  display_mode_label: 'Display mode',
  display_mode_tablet: 'Tablet',
  display_mode_eink: 'E-Ink',
  display_layout_label: 'Layout preset',
  display_layout_hearth: 'Hearth',
  display_layout_agenda_first: 'Agenda first',
  display_layout_family_board: 'Family board',
  display_layout_eink_compact: 'E-Ink compact',
  display_layout_eink_agenda: 'E-Ink agenda',
  display_refresh_label: 'Refresh interval',
  display_refresh_helper: 'Seconds. E-Ink mode is clamped to slower, panel-friendly refreshes.',
  display_live_preview_label: 'Live preview',
  display_slot_editor_label: 'Slot editor',
  display_slot_widget_label: 'Widget',
  display_slot_x_label: 'Column',
  display_slot_y_label: 'Row',
  display_slot_w_label: 'Width',
  display_slot_h_label: 'Height',
  display_widget_home_header: 'Home header',
  display_widget_identity: 'Home title',
  display_widget_clock: 'Clock',
  display_widget_focus: 'Focus',
  display_widget_agenda: 'Agenda',
  display_widget_birthdays: 'Birthdays',
  display_widget_members: 'Family members',
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

describe('DisplaysSection layout composer', () => {
  const PRESETS = ['hearth', 'agenda_first', 'family_board', 'eink_compact', 'eink_agenda'];
  const WHITELIST = ['home_header', 'identity', 'clock', 'focus', 'agenda', 'birthdays', 'members'];

  async function openCreateForm() {
    await act(async () => { render(<DisplaysSection />); });
    await flushAsync();
    fireEvent.click(screen.getByTestId('display-create-toggle'));
  }

  test('renders a card and mini preview for every layout preset inside the controls', async () => {
    await openCreateForm();

    const controls = screen.getByTestId('display-config-controls');
    for (const preset of PRESETS) {
      const card = within(controls).getByTestId(`display-layout-card-${preset}`);
      expect(card).toBeInTheDocument();
      expect(within(card).getByTestId(`display-layout-preview-${preset}`)).toBeInTheDocument();
    }
    // The default mode is `tablet`, so the default preset is `hearth`.
    expect(screen.getByTestId('display-layout-card-hearth')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('display-layout-card-agenda_first')).toHaveAttribute('aria-pressed', 'false');
  });

  test('clicking a preset card switches the selection and updates the live preview', async () => {
    await openCreateForm();

    const livePreview = screen.getByTestId('display-live-preview');
    expect(livePreview).toHaveTextContent(/hearth/i);

    fireEvent.click(screen.getByTestId('display-layout-card-agenda_first'));

    expect(screen.getByTestId('display-layout-card-agenda_first')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('display-layout-card-hearth')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('display-live-preview')).toHaveTextContent(/Agenda first/i);
  });

  test('slot editor lists draft slots and constrains widget type to whitelisted values', async () => {
    await openCreateForm();

    // Hearth has 5 widgets on a 3x3 grid.
    const row0 = screen.getByTestId('display-slot-editor-row-0');
    expect(row0).toBeInTheDocument();
    expect(screen.getByTestId('display-slot-editor-row-4')).toBeInTheDocument();

    const typeSelect = within(row0).getByTestId('display-slot-editor-row-0-type');
    const optionValues = Array.from(typeSelect.querySelectorAll('option')).map((o) => o.value);
    expect(new Set(optionValues)).toEqual(new Set(WHITELIST));

    const xInput = within(row0).getByTestId('display-slot-editor-row-0-x');
    expect(xInput).toHaveAttribute('type', 'number');
    expect(xInput).toHaveAttribute('min', '0');
    expect(xInput).toHaveAttribute('max', '2'); // hearth has 3 columns → max x is 2

    const yInput = within(row0).getByTestId('display-slot-editor-row-0-y');
    expect(yInput).toHaveAttribute('max', '2');
  });

  test('editing a slot type updates the live preview before save', async () => {
    await openCreateForm();

    const row0 = screen.getByTestId('display-slot-editor-row-0');
    fireEvent.change(within(row0).getByTestId('display-slot-editor-row-0-type'), {
      target: { value: 'members' },
    });

    const livePreview = screen.getByTestId('display-live-preview');
    expect(livePreview).toHaveTextContent(/members/);
  });

  test('create payload includes layout_config when the slot editor was touched', async () => {
    api.apiCreateDisplayDevice.mockResolvedValueOnce({
      ok: true,
      data: {
        token: 'tribu_display_xyz',
        device: {
          id: 1, family_id: 7, name: 'Wall',
          created_at: '2026-04-27T08:00:00', last_used_at: null, revoked_at: null,
        },
      },
    });

    await openCreateForm();
    fireEvent.change(screen.getByTestId('display-create-name'), { target: { value: 'Wall' } });

    const row0 = screen.getByTestId('display-slot-editor-row-0');
    fireEvent.change(within(row0).getByTestId('display-slot-editor-row-0-type'), {
      target: { value: 'members' },
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('display-create-submit'));
    });
    await flushAsync();

    expect(api.apiCreateDisplayDevice).toHaveBeenCalledTimes(1);
    const [familyArg, payload] = api.apiCreateDisplayDevice.mock.calls[0];
    expect(familyArg).toBe(7);
    expect(payload).toMatchObject({
      name: 'Wall',
      display_mode: 'tablet',
      layout_preset: 'hearth',
      refresh_interval_seconds: 60,
    });
    expect(payload.layout_config).toBeDefined();
    expect(payload.layout_config.columns).toBe(3);
    expect(payload.layout_config.rows).toBe(3);
    expect(payload.layout_config.widgets[0].type).toBe('members');
  });

  test('save payload for an existing device includes the modified layout_config', async () => {
    api.apiListDisplayDevices.mockResolvedValue({
      ok: true,
      data: [{
        id: 11, family_id: 7, name: 'Hallway',
        display_mode: 'tablet', layout_preset: 'hearth',
        refresh_interval_seconds: 60,
        created_at: '2026-04-20T08:00:00', last_used_at: null, revoked_at: null,
      }],
    });
    api.apiUpdateDisplayDevice.mockResolvedValue({ ok: true, data: {} });

    await act(async () => { render(<DisplaysSection />); });
    await flushAsync();

    const row = await screen.findByTestId('display-row-11');
    const slotRow = within(row).getByTestId('display-slot-editor-row-0');
    // Hearth's home_header starts with w=1; bumping to 2 forces a real onChange.
    fireEvent.change(within(slotRow).getByTestId('display-slot-editor-row-0-w'), {
      target: { value: '2' },
    });

    await act(async () => {
      fireEvent.click(within(row).getByTestId('display-save-config'));
    });
    await flushAsync();

    expect(api.apiUpdateDisplayDevice).toHaveBeenCalledTimes(1);
    const [familyArg, deviceArg, payload] = api.apiUpdateDisplayDevice.mock.calls[0];
    expect(familyArg).toBe(7);
    expect(deviceArg).toBe(11);
    expect(payload).toMatchObject({
      display_mode: 'tablet',
      layout_preset: 'hearth',
      refresh_interval_seconds: 60,
    });
    expect(payload.layout_config).toBeDefined();
    expect(payload.layout_config.widgets[0].w).toBe(2);
  });



  test('changing display mode on an existing device clears stale custom layout_config before save', async () => {
    api.apiListDisplayDevices.mockResolvedValue({
      ok: true,
      data: [{
        id: 12, family_id: 7, name: 'Kitchen',
        display_mode: 'tablet', layout_preset: 'hearth',
        refresh_interval_seconds: 60,
        layout_config: {
          columns: 3,
          rows: 3,
          widgets: [{ type: 'home_header', x: 0, y: 0, w: 3, h: 1 }],
        },
        created_at: '2026-04-20T08:00:00', last_used_at: null, revoked_at: null,
      }],
    });
    api.apiUpdateDisplayDevice.mockResolvedValue({ ok: true, data: {} });

    await act(async () => { render(<DisplaysSection />); });
    await flushAsync();

    const row = await screen.findByTestId('display-row-12');
    fireEvent.change(within(row).getByTestId('display-mode-select'), {
      target: { value: 'eink' },
    });

    await act(async () => {
      fireEvent.click(within(row).getByTestId('display-save-config'));
    });
    await flushAsync();

    const [, , payload] = api.apiUpdateDisplayDevice.mock.calls[0];
    expect(payload).toMatchObject({
      display_mode: 'eink',
      layout_preset: 'hearth',
      refresh_interval_seconds: 60,
      layout_config: null,
    });
  });

  test('slot size controls are bounded by the current slot origin so slots stay inside the grid', async () => {
    await openCreateForm();

    const row0 = screen.getByTestId('display-slot-editor-row-0');
    fireEvent.change(within(row0).getByTestId('display-slot-editor-row-0-x'), {
      target: { value: '2' },
    });

    const wInput = within(row0).getByTestId('display-slot-editor-row-0-w');
    expect(wInput).toHaveAttribute('max', '1');

    fireEvent.change(wInput, { target: { value: '3' } });
    expect(screen.getByTestId('display-live-preview')).toHaveTextContent(/1×2 @ \(2,0\)/);
  });

  test('layout composer labels use localized display messages instead of raw keys', async () => {
    await openCreateForm();

    expect(screen.getByText('Live preview')).toBeInTheDocument();
    expect(screen.getByText('Slot editor')).toBeInTheDocument();
    expect(screen.getAllByText('Home header').length).toBeGreaterThan(0);
    expect(screen.queryByText('display_live_preview_label')).not.toBeInTheDocument();
  });

  test('does not allow arbitrary widget strings: invalid types are rejected from the select options', async () => {
    await openCreateForm();
    const typeSelect = within(screen.getByTestId('display-slot-editor-row-0'))
      .getByTestId('display-slot-editor-row-0-type');
    const optionValues = Array.from(typeSelect.querySelectorAll('option')).map((o) => o.value);
    expect(optionValues).not.toContain('arbitrary_widget');
    expect(optionValues).not.toContain('script');
    expect(optionValues.every((v) => WHITELIST.includes(v))).toBe(true);
  });
});
