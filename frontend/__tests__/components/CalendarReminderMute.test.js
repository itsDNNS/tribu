import React, { useState } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import CalendarView from '../../components/calendar';
import en from '../../i18n/en.json';
import { useApp } from '../../contexts/AppContext';
import * as api from '../../lib/api';
import { handOff } from '../../lib/viewHandoff';
import { announceReminderMute, openEventLink } from '../../lib/reminderMute';

const mockToastSuccess = jest.fn();
jest.mock('../../contexts/AppContext', () => ({ useApp: jest.fn() }));
jest.mock('../../contexts/ToastContext', () => ({ useToast: () => ({ success: mockToastSuccess, error: jest.fn() }) }));
jest.mock('../../lib/api', () => ({
  apiCreateEvent: jest.fn(), apiUpdateEvent: jest.fn(), apiDeleteEvent: jest.fn(), apiGetEvents: jest.fn(),
  apiMuteEventReminder: jest.fn(), apiUnmuteEventReminder: jest.fn(),
}));

const anna = { user_id: 1, display_name: 'Anna' };
const cleo = { user_id: 3, display_name: 'Cleo' };
const swim = {
  id: 7, family_id: 1, title: 'Swimming', starts_at: '2026-05-04T14:00:00', ends_at: '2026-05-04T15:00:00',
  all_day: false, recurrence: 'weekly', is_recurring: true, assigned_to: [1], created_by_user_id: 1,
  remind_only_creator: false, reminder_muted: null,
};

let switchToFamily;
function Harness({ me = anna, isChild = false }) {
  const [events, setEvents] = useState([swim]);
  const [summary, setSummary] = useState({ next_events: [] });
  const [familyId, setFamilyId] = useState(1);
  switchToFamily = async (fid) => { setEvents([]); setFamilyId(Number(fid)); };
  useApp.mockReturnValue({
    familyId, me, members: [anna, cleo], messages: en, lang: 'en', weekStart: 'monday', timeFormat: '24h',
    isChild, demoMode: false, birthdays: [], loadDashboard: jest.fn(), events, setEvents, summary, setSummary,
    families: [{ family_id: 1 }, { family_id: 2 }],
  });
  return <CalendarView />;
}

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
beforeEach(() => {
  jest.clearAllMocks();
  handOff('tribu_calendar_focus', '2026-05-04T12:00:00');
  api.apiGetEvents.mockResolvedValue({ ok: true, data: [swim] });
  api.apiMuteEventReminder.mockImplementation((id, scope) => Promise.resolve({ ok: true, data: { reminder_muted: scope } }));
  api.apiUnmuteEventReminder.mockResolvedValue({ ok: true, data: { reminder_muted: null } });
});

describe('My reminder in the calendar', () => {
  it('takes a child off all repetitions from the event view, without edit rights', async () => {
    render(<Harness me={cleo} isChild />);
    await waitFor(() => expect(api.apiGetEvents).toHaveBeenCalled());
    fireEvent.click(screen.getAllByRole('button', { name: /Swimming/ })[0]);
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).queryByRole('button', { name: 'Edit', exact: true })).not.toBeInTheDocument();
    // Opening the event does not land on the choice.
    expect(within(dialog).getByRole('radio', { name: 'On' })).not.toHaveFocus();

    await act(async () => {
      fireEvent.click(within(dialog).getByRole('radio', { name: 'Off for all repetitions' }));
    });

    expect(api.apiMuteEventReminder).toHaveBeenCalledWith(7, 'series', '2026-05-04T14:00:00');
    expect(within(dialog).getByRole('radio', { name: 'Off for all repetitions' })).toBeChecked();
    expect(mockToastSuccess).toHaveBeenCalledWith('Reminder off for all repetitions');
    // The other occurrences change too, so the range is loaded again.
    await waitFor(() => expect(api.apiGetEvents.mock.calls.length).toBeGreaterThan(1));

    await act(async () => {
      fireEvent.click(within(dialog).getByRole('radio', { name: 'On' }));
    });
    expect(api.apiUnmuteEventReminder).toHaveBeenCalledWith(7, '2026-05-04T14:00:00');
  });

  it('shows a mute made in the notification panel', async () => {
    render(<Harness />);
    await waitFor(() => expect(api.apiGetEvents).toHaveBeenCalledTimes(1));
    api.apiGetEvents.mockResolvedValue({ ok: true, data: [{ ...swim, reminder_muted: 'series' }] });

    act(() => {
      announceReminderMute({ eventId: 7, at: '2026-05-04T14:00:00', state: 'series' });
    });
    await waitFor(() => expect(api.apiGetEvents).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getAllByRole('button', { name: /Swimming/ })[0]);

    expect(within(screen.getByRole('dialog')).getByRole('radio', { name: 'Off for all repetitions' })).toBeChecked();
  });

  it('opens the occurrence from a reminder link with the choice in focus', async () => {
    handOff('tribu_calendar_event', JSON.stringify({ eventId: 7, at: '2026-05-04T14:00:00', repeats: true, choose: true }));
    render(<Harness />);

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'Swimming' })).toBeInTheDocument();
    await waitFor(() => expect(within(dialog).getByRole('radio', { name: 'On' })).toHaveFocus());
    expect(within(dialog).getByRole('group', { name: 'My reminder' })).toBeInTheDocument();
  });

  it('opens a push link of another family after switching to it', async () => {
    const choir = { ...swim, id: 9, family_id: 2, title: 'Choir' };
    api.apiGetEvents.mockImplementation((fid) => Promise.resolve({ ok: true, data: String(fid) === '2' ? [choir] : [swim] }));
    render(<Harness />);
    await waitFor(() => expect(api.apiGetEvents).toHaveBeenCalled());

    await act(async () => {
      await openEventLink(
        { eventId: 9, familyId: 2, at: '2026-05-04T14:00:00', repeats: true, choose: true },
        { familyId: 1, families: [{ family_id: 1 }, { family_id: 2 }], switchFamily: (fid) => switchToFamily(fid), setActiveView: jest.fn() },
      );
    });

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'Choir' })).toBeInTheDocument();
    await waitFor(() => expect(within(dialog).getByRole('radio', { name: 'On' })).toHaveFocus());
  });

  it('says that leaving "all repetitions off" brings the others back', async () => {
    api.apiGetEvents.mockResolvedValue({ ok: true, data: [{ ...swim, reminder_muted: 'series' }] });
    render(<Harness />);
    await waitFor(() => expect(api.apiGetEvents).toHaveBeenCalled());
    await waitFor(() => fireEvent.click(screen.getAllByRole('button', { name: /Swimming/ })[0]));
    const group = within(screen.getByRole('dialog')).getByRole('group', { name: 'My reminder' });
    expect(group).toHaveAccessibleDescription(
      'Only your own reminder changes, not who takes part. On and Off for this one both bring back the reminders for the other repetitions.',
    );

    await act(async () => {
      fireEvent.click(within(group).getByRole('radio', { name: 'Off for this one' }));
    });
    expect(group).toHaveAccessibleDescription('Only your own reminder changes, not who takes part.');
  });

  it('opens a link that arrives while the calendar is open', async () => {
    render(<Harness />);
    await waitFor(() => expect(api.apiGetEvents).toHaveBeenCalled());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    act(() => {
      handOff('tribu_calendar_event', JSON.stringify({ eventId: 7, at: '2026-05-04T14:00:00', repeats: true, choose: true }));
      window.dispatchEvent(new Event('tribu:open-event'));
    });

    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(within(dialog).getByRole('radio', { name: 'On' })).toHaveFocus());
  });
});
