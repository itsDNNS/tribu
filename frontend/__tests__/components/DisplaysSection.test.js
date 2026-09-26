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
  apiGetWeatherLocation: jest.fn(),
  apiSetWeatherLocation: jest.fn(),
  apiClearWeatherLocation: jest.fn(),
  apiSearchWeatherLocation: jest.fn(),
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
  display_refresh_label: 'Refresh interval',
  display_refresh_eink_label: 'Turn page and refresh',
  display_show_composer: 'Configure display',
  display_create_section_title: 'New display',
  display_create_hint: 'Name it and choose what it shows.',
  display_language_label: 'Language',
  display_language_auto: 'Device language',
  display_editor_device: 'Device',
  display_editor_zones: 'Rotating areas',
  display_editor_zones_hint: 'Each area shows its cards one after another.',
  display_eink_rotation_hint: 'On e-ink every area turns one card per refresh.',
  display_zone_a: 'Right, top',
  display_zone_b: 'Right, middle',
  display_zone_c: 'Right, bottom',
  display_zone_d: 'Bottom, wide',
  display_card_dinner: 'Meals',
  display_card_shopping: 'Shopping list',
  display_card_weather: 'Weather today',
  display_card_reminders: "Don't forget",
  display_card_school: 'School timetable',
  display_card_soon: 'Coming up',
  display_card_stars: 'Stars',
  display_card_birthdays: 'Birthdays',
  display_card_people: 'People',
  display_card_week: 'This week',
  display_add_card: 'Add card',
  display_card_move_up: 'Move {card} up',
  display_card_move_down: 'Move {card} down',
  display_card_remove: 'Remove {card}',
  display_zone_interval: 'Change',
  display_every_seconds: 'every {count} s',
  display_every_minutes: 'every {count} min',
  display_editor_behaviour: 'Behaviour',
  display_stagger: 'Change one area at a time',
  display_stagger_hint: 'Areas take turns.',
  display_skip_empty: 'Skip empty cards',
  display_skip_empty_hint: 'Empty cards are left out.',
  display_pause_on_touch: 'Hold on touch',
  display_pause_on_touch_hint: 'Tapping holds an area.',
  display_night_dim: 'Dim at night',
  display_night_dim_hint: 'Darkens the screen at night.',
  display_editor_day_parts: 'Times of day',
  display_morning_start: 'Morning from',
  display_morning_end: 'Morning until',
  display_evening_start: 'Evening from',
  display_night_start: 'Night from',
  display_weather_title: 'Weather on displays',
  display_weather_off: 'Off',
  display_weather_choose: 'Choose place',
  display_weather_change: 'Change place',
  display_weather_remove: 'Turn off weather',
  display_weather_search_label: 'Town or city',
  display_weather_search: 'Search',
  display_weather_no_results: 'No places found.',
  display_weather_unavailable: 'The place search is not reachable right now.',
  display_weather_privacy: 'Forecasts come from Open-Meteo.',
  close: 'Close',
  save: 'Save',
  cancel: 'Cancel',
  dismiss: 'Dismiss',
  token_copied: 'Copied',
  token_copy: 'Copy',
  toast: { error: 'Error' },
};

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
});

beforeEach(() => {
  jest.clearAllMocks();
  mockAppState = {
    familyId: 7,
    messages,
    demoMode: false,
    lang: 'de',
  };
  api.apiListDisplayDevices.mockResolvedValue({ ok: true, data: [] });
  api.apiGetWeatherLocation.mockResolvedValue({ ok: true, data: { name: null, latitude: null, longitude: null } });
});

function flushAsync() {
  return act(async () => { await Promise.resolve(); });
}

describe('DisplaysSection', () => {
  test('renders the not-a-person hint and an empty state', async () => {
    let rendered;
    await act(async () => { rendered = render(<DisplaysSection />); });

    expect(rendered.container.querySelector('.admin-subpage-displays')).toBeInTheDocument();
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

const DEVICE = {
  id: 5, family_id: 7, name: 'Kitchen', created_at: '2026-09-01T08:00:00', last_used_at: null, revoked_at: null,
  display_mode: 'tablet', refresh_interval_seconds: 60, layout_preset: 'stage',
  layout_config: {
    version: 2,
    zones: {
      a: { cards: ['dinner', 'shopping', 'weather'], interval_seconds: 60 },
      b: { cards: ['reminders', 'school'], interval_seconds: 60 },
      c: { cards: ['soon', 'stars'], interval_seconds: 60 },
      d: { cards: ['people', 'week'], interval_seconds: 60 },
    },
    stagger: true, skip_empty: true, pause_on_touch: true, night_dim: true,
    day_parts: { morning_start: '05:30', morning_end: '09:00', evening_start: '18:00', night_start: '22:00' },
    eink_format: 'compact', language: 'auto',
  },
};

async function openEditor() {
  api.apiListDisplayDevices.mockResolvedValue({ ok: true, data: [DEVICE] });
  api.apiUpdateDisplayDevice.mockResolvedValue({ ok: true, data: DEVICE });
  await act(async () => { render(<DisplaysSection />); });
  await flushAsync();
  fireEvent.click(await screen.findByTestId('display-config-toggle-5'));
}

describe('DisplaysSection stage editor', () => {
  test('a new display is created with the default stage rotation', async () => {
    api.apiCreateDisplayDevice.mockResolvedValue({ ok: true, data: { token: 'tribu_display_x', device: { ...DEVICE, id: 6 } } });
    await act(async () => { render(<DisplaysSection />); });
    await flushAsync();
    fireEvent.click(screen.getByTestId('display-create-toggle'));
    fireEvent.change(screen.getByTestId('display-create-name'), { target: { value: 'Hall' } });
    await act(async () => { fireEvent.click(screen.getByTestId('display-create-submit')); });

    const payload = api.apiCreateDisplayDevice.mock.calls[0][1];
    expect(payload).toMatchObject({ name: 'Hall', display_mode: 'tablet', refresh_interval_seconds: 60 });
    expect(payload.layout_config.version).toBe(2);
    expect(payload.layout_config.zones.a).toEqual({ cards: ['dinner', 'shopping', 'weather'], interval_seconds: 60 });
    expect(payload).not.toHaveProperty('layout_preset');
  });

  test('admins choose, order and time the cards of each area', async () => {
    await openEditor();
    const zoneA = screen.getByTestId('display-zone-editor-a');
    fireEvent.click(within(zoneA).getByRole('button', { name: 'Move Weather today up' }));
    fireEvent.click(within(zoneA).getByRole('button', { name: 'Remove Meals' }));
    fireEvent.change(within(zoneA).getByTestId('display-zone-interval-a'), { target: { value: '120' } });

    const zoneB = screen.getByTestId('display-zone-editor-b');
    fireEvent.change(within(zoneB).getByRole('combobox', { name: 'Add card · B' }), { target: { value: 'stars' } });
    // Wide-only cards are not offered in the side areas.
    expect(within(zoneB).queryByRole('option', { name: 'People' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('display-toggle-stagger'));
    fireEvent.change(screen.getByTestId('display-daypart-evening_start'), { target: { value: '19:30' } });
    fireEvent.change(screen.getByTestId('display-language-select'), { target: { value: 'de' } });
    await act(async () => { fireEvent.click(screen.getByTestId('display-save-config')); });

    const payload = api.apiUpdateDisplayDevice.mock.calls[0][2];
    expect(payload.layout_config.zones.a).toEqual({ cards: ['weather', 'shopping'], interval_seconds: 120 });
    expect(payload.layout_config.zones.b.cards).toEqual(['reminders', 'school', 'stars']);
    expect(payload.layout_config.stagger).toBe(false);
    expect(payload.layout_config.day_parts.evening_start).toBe('19:30');
    expect(payload.layout_config.language).toBe('de');
  });

  test('the last card of an area cannot be removed', async () => {
    await openEditor();
    const zoneD = screen.getByTestId('display-zone-editor-d');
    fireEvent.click(within(zoneD).getByRole('button', { name: 'Remove People' }));
    expect(within(zoneD).getByRole('button', { name: 'Remove This week' })).toBeDisabled();
  });

  test('switching to e-ink uses page refreshes instead of per-area timers', async () => {
    await openEditor();
    fireEvent.change(screen.getByTestId('display-mode-select'), { target: { value: 'eink' } });
    expect(screen.getByTestId('display-refresh-select')).toHaveValue('600');
    expect(screen.queryByTestId('display-zone-interval-a')).not.toBeInTheDocument();
    expect(screen.queryByTestId('display-toggle-stagger')).not.toBeInTheDocument();
    expect(screen.getByText('On e-ink every area turns one card per refresh.')).toBeInTheDocument();
    await act(async () => { fireEvent.click(screen.getByTestId('display-save-config')); });
    expect(api.apiUpdateDisplayDevice.mock.calls[0][2]).toMatchObject({ display_mode: 'eink', refresh_interval_seconds: 600 });
  });
});

describe('DisplaysSection weather place', () => {
  test('admins search, choose and remove the family weather place', async () => {
    api.apiSearchWeatherLocation.mockResolvedValue({ ok: true, data: [
      { name: 'Hamburg', region: 'Hamburg', country: 'Germany', latitude: 53.55, longitude: 9.99 },
      { name: 'Hamburg', region: 'New York', country: 'United States', latitude: 42.7, longitude: -78.8 },
    ] });
    api.apiSetWeatherLocation.mockResolvedValue({ ok: true, data: { name: 'Hamburg', latitude: 53.55, longitude: 9.99 } });
    api.apiClearWeatherLocation.mockResolvedValue({ ok: true, data: {} });

    await act(async () => { render(<DisplaysSection />); });
    await flushAsync();
    expect(screen.getByTestId('display-weather-place')).toHaveTextContent('Off');

    fireEvent.click(screen.getByTestId('display-weather-choose'));
    fireEvent.change(screen.getByTestId('display-weather-query'), { target: { value: 'Hamb' } });
    await act(async () => { fireEvent.click(screen.getByTestId('display-weather-search')); });
    expect(api.apiSearchWeatherLocation).toHaveBeenCalledWith(7, 'Hamb', 'de');

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Hamburg Hamburg, Germany/ })); });
    expect(api.apiSetWeatherLocation).toHaveBeenCalledWith(7, { name: 'Hamburg', latitude: 53.55, longitude: 9.99 });
    expect(screen.getByTestId('display-weather-place')).toHaveTextContent('Hamburg');

    await act(async () => { fireEvent.click(screen.getByTestId('display-weather-remove')); });
    expect(api.apiClearWeatherLocation).toHaveBeenCalledWith(7);
    expect(screen.getByTestId('display-weather-place')).toHaveTextContent('Off');
  });

  test('a place from another region keeps its region in the name', async () => {
    api.apiSearchWeatherLocation.mockResolvedValue({ ok: true, data: [
      { name: 'Hamburg', region: 'New York', country: 'United States', latitude: 42.7, longitude: -78.8 },
    ] });
    api.apiSetWeatherLocation.mockResolvedValue({ ok: true, data: { name: 'Hamburg, New York', latitude: 42.7, longitude: -78.8 } });
    await act(async () => { render(<DisplaysSection />); });
    await flushAsync();
    fireEvent.click(screen.getByTestId('display-weather-choose'));
    fireEvent.change(screen.getByTestId('display-weather-query'), { target: { value: 'Hamburg' } });
    await act(async () => { fireEvent.click(screen.getByTestId('display-weather-search')); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /New York, United States/ })); });
    expect(api.apiSetWeatherLocation).toHaveBeenCalledWith(7, { name: 'Hamburg, New York', latitude: 42.7, longitude: -78.8 });
  });

  test('an unreachable place search shows a clear message', async () => {
    api.apiSearchWeatherLocation.mockResolvedValue({ ok: false, status: 502, data: null });
    await act(async () => { render(<DisplaysSection />); });
    await flushAsync();
    fireEvent.click(screen.getByTestId('display-weather-choose'));
    fireEvent.change(screen.getByTestId('display-weather-query'), { target: { value: 'Hamb' } });
    await act(async () => { fireEvent.click(screen.getByTestId('display-weather-search')); });
    expect(screen.getByRole('alert')).toHaveTextContent('The place search is not reachable right now.');
  });

  test('demo mode hides the weather place', async () => {
    mockAppState = { ...mockAppState, demoMode: true };
    await act(async () => { render(<DisplaysSection />); });
    expect(screen.queryByTestId('display-weather-panel')).not.toBeInTheDocument();
    expect(api.apiGetWeatherLocation).not.toHaveBeenCalled();
  });
});
