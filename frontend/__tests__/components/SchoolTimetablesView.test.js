import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import SchoolTimetablesView from '../../components/SchoolTimetablesView';
import { buildMessages } from '../../lib/i18n';

let mockAppState = {};

jest.mock('../../contexts/AppContext', () => ({
  useApp: () => mockAppState,
}));

const mockToastSuccess = jest.fn();
jest.mock('../../contexts/ToastContext', () => ({
  useToast: () => ({ success: mockToastSuccess, error: jest.fn() }),
}));

let mockNow = new Date(2026, 8, 28, 8, 10); // Monday, first period
jest.mock('../../hooks/useCurrentMinute', () => ({ useCurrentMinute: () => mockNow }));

const apiListSchoolTimetables = jest.fn();
const apiCreateSchoolTimetable = jest.fn();
const apiUpdateSchoolTimetable = jest.fn();
const apiDeleteSchoolTimetable = jest.fn();

jest.mock('../../lib/api', () => ({
  apiListSchoolTimetables: (...args) => apiListSchoolTimetables(...args),
  apiCreateSchoolTimetable: (...args) => apiCreateSchoolTimetable(...args),
  apiUpdateSchoolTimetable: (...args) => apiUpdateSchoolTimetable(...args),
  apiDeleteSchoolTimetable: (...args) => apiDeleteSchoolTimetable(...args),
}));

const timetable = {
  id: 41,
  family_id: 1,
  name: 'Riley school week',
  class_label: '5B',
  include_saturday: false,
  notes: '',
  assigned_member_user_ids: [12],
  assigned_members: [{ user_id: 12, display_name: 'Riley', is_adult: false }],
  periods: [
    { position: 1, label: '1', start_time: '08:00', end_time: '08:45', kind: 'lesson', break_label: null },
    { position: 2, label: 'Break', start_time: '08:45', end_time: '09:00', kind: 'break', break_label: 'Break' },
  ],
  lessons: [
    { weekday: 1, period_position: 1, subject: 'Math', room: '205', teacher: 'Ms. Klein', color: '#7c3aed' },
  ],
};

function renderSchoolTimetables(locale = 'en', timetables = [timetable]) {
  mockAppState = {
    familyId: '1',
    messages: buildMessages(locale),
    demoMode: false,
    members: [
      { user_id: 12, display_name: 'Riley', is_adult: false },
      { user_id: 13, display_name: 'Alex', is_adult: true },
    ],
  };
  apiListSchoolTimetables.mockResolvedValue({ ok: true, data: timetables });
  return render(<SchoolTimetablesView />);
}

describe('SchoolTimetablesView localization', () => {
  beforeEach(() => {
    apiListSchoolTimetables.mockReset();
    apiCreateSchoolTimetable.mockReset();
    apiUpdateSchoolTimetable.mockReset();
    apiDeleteSchoolTimetable.mockReset();
  });

  it('shows the timetable first, today and the running period marked', async () => {
    renderSchoolTimetables('en');

    const grid = await screen.findByRole('grid', { name: 'School timetable' });
    expect(screen.getByText('Riley school week')).toBeVisible();
    // No form fields until someone asks to edit.
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Who is this plan for?' })).not.toBeInTheDocument();
    expect(within(grid).getByText('Today')).toBeVisible();
    expect(within(grid).getByLabelText('Monday, period 1, Math')).toHaveClass('now');
    expect(within(grid).getAllByText('Now')).toHaveLength(1);
    expect(screen.getByRole('tab', { name: 'Mon' })).toHaveAttribute('aria-selected', 'true');
  });

  it('edits behind "Edit" and returns to the plan on cancel', async () => {
    renderSchoolTimetables('en');
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    expect(screen.getByRole('heading', { name: 'Edit timetable' })).toBeVisible();
    fireEvent.change(screen.getByDisplayValue('Riley school week'), { target: { value: 'Changed' } });

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('heading', { name: 'Edit timetable' })).not.toBeInTheDocument();
    expect(screen.getByText('Riley school week')).toBeVisible();
    expect(apiUpdateSchoolTimetable).not.toHaveBeenCalled();
  });

  it('saves and shows the plan again', async () => {
    apiUpdateSchoolTimetable.mockImplementation(async (id, payload) => ({ ok: true, data: { ...timetable, name: payload.name } }));
    renderSchoolTimetables('en');
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByDisplayValue('Riley school week'), { target: { value: 'Riley term two' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save timetable' }));

    await waitFor(() => expect(apiUpdateSchoolTimetable).toHaveBeenCalledWith(41, expect.objectContaining({ name: 'Riley term two' })));
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Edit timetable' })).not.toBeInTheDocument());
    expect(mockToastSuccess).toHaveBeenCalledWith('Saved.');
  });

  it('renders the timetable editor in English without German labels', async () => {
    renderSchoolTimetables('en');

    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));

    expect(screen.getByRole('heading', { name: 'Who is this plan for?' })).toBeVisible();
    expect(screen.getByText('Tap a cell to add a subject.')).toBeVisible();
    expect(screen.getByRole('tablist', { name: 'Choose weekday' })).toBeVisible();
    expect(screen.getByRole('grid', { name: 'School timetable' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Add lesson' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add break' })).toBeInTheDocument();

    const grid = screen.getByRole('grid', { name: 'School timetable' });
    expect(within(grid).getByText('Monday')).toBeVisible();
    expect(screen.getByLabelText('Monday, period 1, Math')).toBeInTheDocument();

    expect(screen.queryByText('Für wen ist dieser Plan?')).not.toBeInTheDocument();
    expect(screen.queryByText('Tippe in eine Zelle, um ein Fach einzutragen.')).not.toBeInTheDocument();
    expect(screen.queryByRole('tablist', { name: 'Wochentag wählen' })).not.toBeInTheDocument();
    expect(screen.queryByRole('grid', { name: 'Stundenplan' })).not.toBeInTheDocument();
  });

  it('uses localized default break labels in German instead of persisting English fallback text', async () => {
    apiCreateSchoolTimetable.mockImplementation(async (payload) => ({
      ok: true,
      data: { ...timetable, id: 99, name: payload.name, periods: payload.periods, lessons: [] },
    }));
    renderSchoolTimetables('de', []);

    fireEvent.click(await screen.findByRole('button', { name: 'Ersten Stundenplan erstellen' }));

    expect(screen.getByRole('heading', { name: 'Für wen ist dieser Plan?' })).toBeVisible();
    expect(screen.getByText('Tippe in eine Zelle, um ein Fach einzutragen.')).toBeVisible();
    expect(screen.getByRole('grid', { name: 'Stundenplan' })).toBeVisible();
    expect(screen.getAllByText('Pause').length).toBeGreaterThan(0);
    expect(screen.queryByText('Break')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Montagsplan' } });
    fireEvent.click(screen.getByRole('button', { name: 'Stundenplan speichern' }));

    await waitFor(() => expect(apiCreateSchoolTimetable).toHaveBeenCalled());
    const payload = apiCreateSchoolTimetable.mock.calls[0][0];
    expect(payload.periods.find((period) => period.kind === 'break')).toMatchObject({
      label: '2',
      break_label: null,
    });
  });
});
