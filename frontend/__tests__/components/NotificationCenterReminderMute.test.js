import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import NotificationCenter from '../../components/NotificationCenter';
import * as api from '../../lib/api';
import { buildTestMessages, renderWithMockApp } from '../test-utils';

const mockToastSuccess = jest.fn();
const mockToastError = jest.fn();

jest.mock('../../lib/api', () => require('../test-utils').createMockApi({
  apiMuteEventReminder: jest.fn(),
  apiUnmuteEventReminder: jest.fn(),
}));

jest.mock('../../contexts/AppContext', () => ({
  useApp: () => require('../test-utils').getMockAppState(),
}));

jest.mock('../../contexts/ToastContext', () => ({
  useToast: () => ({ success: mockToastSuccess, error: mockToastError, dismiss: jest.fn() }),
}));

const AT = '2026-12-08T09:00:00';

function reminder(overrides = {}) {
  return {
    id: 7,
    type: 'event_reminder',
    title: 'Swimming',
    body: 'Starts at 09:00',
    link: `/calendar?event=42&at=${AT}`,
    read: false,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

function renderCenter(notifications, overrides = {}) {
  const setActiveView = jest.fn();
  renderWithMockApp(<NotificationCenter />, {
    messages: buildTestMessages(),
    lang: 'en',
    isAdmin: false,
    isChild: false,
    demoMode: false,
    notifications,
    setActiveView,
    ...overrides,
  });
  return { setActiveView };
}

describe('NotificationCenter "Don\'t remind me"', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    api.apiMuteEventReminder.mockImplementation((id, scope) => Promise.resolve({ ok: true, data: { reminder_muted: scope } }));
    api.apiUnmuteEventReminder.mockResolvedValue({ ok: true, data: { reminder_muted: null } });
  });

  it('mutes a single event right away, with Undo', async () => {
    const { setActiveView } = renderCenter([reminder()]);
    const announced = [];
    const listen = (e) => announced.push(e.detail);
    window.addEventListener('tribu:reminder-mute-changed', listen);

    const button = screen.getByRole('button', { name: "Don't remind me" });
    expect(button).not.toHaveAttribute('aria-expanded');
    await act(async () => { fireEvent.click(button); });

    expect(api.apiMuteEventReminder).toHaveBeenCalledWith(42, 'series', AT);
    // The notification itself does not open.
    expect(setActiveView).not.toHaveBeenCalled();
    expect(screen.getByText('Reminder off')).toHaveFocus();
    expect(screen.queryByRole('button', { name: "Don't remind me" })).not.toBeInTheDocument();
    expect(mockToastSuccess).toHaveBeenCalledWith('Reminder off for this event', expect.objectContaining({ label: 'Undo' }));

    const undo = mockToastSuccess.mock.calls[0][1].onClick;
    await act(async () => { await undo(); });
    expect(api.apiUnmuteEventReminder).toHaveBeenCalledWith(42, AT);
    // An open calendar hears about both.
    window.removeEventListener('tribu:reminder-mute-changed', listen);
    expect(announced).toEqual([{ eventId: 42, at: AT, state: 'series' }, { eventId: 42, at: AT, state: null }]);
    expect(screen.getByRole('button', { name: "Don't remind me" })).toBeInTheDocument();
    expect(mockToastSuccess).toHaveBeenLastCalledWith('Reminder back on');
  });

  it('asks "only this one or all repetitions" for a series', async () => {
    renderCenter([reminder({ link: `/calendar?event=42&at=${AT}&repeats=1` })]);

    const button = screen.getByRole('button', { name: "Don't remind me" });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    const choice = screen.getByRole('group', { name: 'Stop reminders for' });
    expect(button).toHaveAttribute('aria-controls', choice.id);
    expect(api.apiMuteEventReminder).not.toHaveBeenCalled();

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Only this one' })); });

    expect(api.apiMuteEventReminder).toHaveBeenCalledWith(42, 'occurrence', AT);
    expect(mockToastSuccess).toHaveBeenCalledWith('Reminder off for this one', expect.anything());
    expect(screen.queryByRole('group', { name: 'Stop reminders for' })).not.toBeInTheDocument();
  });

  it('mutes every repetition from the choice', async () => {
    renderCenter([reminder({ link: `/calendar?event=42&at=${AT}&repeats=1` })]);

    fireEvent.click(screen.getByRole('button', { name: "Don't remind me" }));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'All repetitions' })); });

    expect(api.apiMuteEventReminder).toHaveBeenCalledWith(42, 'series', AT);
    expect(mockToastSuccess).toHaveBeenCalledWith('Reminder off for all repetitions', expect.anything());
  });

  it('closes the choice with Escape and returns to its button', () => {
    renderCenter([reminder({ link: `/calendar?event=42&at=${AT}&repeats=1` })]);

    const button = screen.getByRole('button', { name: "Don't remind me" });
    fireEvent.click(button);
    fireEvent.keyDown(screen.getByRole('button', { name: 'Only this one' }), { key: 'Escape' });

    expect(screen.queryByRole('group')).not.toBeInTheDocument();
    expect(button).toHaveFocus();
  });

  it('keeps the button and says so when muting fails', async () => {
    api.apiMuteEventReminder.mockResolvedValue({ ok: false, data: null });
    renderCenter([reminder()]);

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: "Don't remind me" })); });

    expect(mockToastError).toHaveBeenCalledWith('Something went wrong');
    await waitFor(() => expect(screen.getByRole('button', { name: "Don't remind me" })).toHaveFocus());
  });

  it('is only offered on event reminders that name their occurrence', () => {
    renderCenter([
      reminder({ id: 1, link: '/calendar?event=42' }),
      reminder({ id: 2, type: 'task_due', title: 'Bins', link: '/tasks?id=3' }),
      reminder({ id: 3, type: 'event_assigned', title: 'Assigned', link: `/calendar?event=42&at=${AT}` }),
    ]);

    expect(screen.queryByRole('button', { name: "Don't remind me" })).not.toBeInTheDocument();
  });
});
