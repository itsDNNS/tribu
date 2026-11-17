import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

import EventDetails from '../../components/calendar/EventDetails';
import { buildTestMessages } from '../test-utils';

// The German texts, as Dennis sees them.
const messages = buildTestMessages(require('../../i18n/de.json'));
const ME = { user_id: 2, display_name: 'Ben' };

function occurrence(overrides = {}) {
  return {
    id: 5,
    family_id: 1,
    title: 'Schwimmen',
    starts_at: '2026-12-08T09:00:00',
    ends_at: '2026-12-08T10:00:00',
    all_day: false,
    recurrence: 'weekly',
    is_recurring: true,
    assigned_to: [1],
    created_by_user_id: 1,
    remind_only_creator: false,
    reminder_muted: null,
    ...overrides,
  };
}

function renderDetails(event, onReminderChange = jest.fn(async (state) => state), me = ME) {
  render(
    <EventDetails
      event={event}
      members={[{ user_id: 1, display_name: 'Anna' }, ME]}
      messages={messages}
      locale="de-DE"
      timeFormat="24h"
      me={me}
      onReminderChange={onReminderChange}
    />,
  );
  return onReminderChange;
}

describe('My reminder in the event details', () => {
  it('offers on, off for this occurrence and off for all repetitions for a series', async () => {
    const onChange = renderDetails(occurrence());

    const group = screen.getByRole('group', { name: 'Meine Erinnerung' });
    expect(group).toHaveAccessibleDescription('Nur deine Erinnerung ändert sich, nicht wer dabei ist.');
    expect(screen.getByRole('radio', { name: 'An' })).toBeChecked();

    await act(async () => { fireEvent.click(screen.getByRole('radio', { name: 'Aus für diesen Termin' })); });
    expect(onChange).toHaveBeenLastCalledWith('occurrence');
    expect(screen.getByRole('radio', { name: 'Aus für diesen Termin' })).toBeChecked();

    await act(async () => { fireEvent.click(screen.getByRole('radio', { name: 'Aus für alle Wiederholungen' })); });
    expect(onChange).toHaveBeenLastCalledWith('series');

    await act(async () => { fireEvent.click(screen.getByRole('radio', { name: 'An' })); });
    expect(onChange).toHaveBeenLastCalledWith(null);
    // Who takes part is not part of it.
    expect(screen.getByText('Anna')).toBeInTheDocument();
  });

  it('shows the saved state of the occurrence', () => {
    renderDetails(occurrence({ reminder_muted: 'series' }));
    expect(screen.getByRole('radio', { name: 'Aus für alle Wiederholungen' })).toBeChecked();
  });

  it('has a single switch for a single event', async () => {
    const onChange = renderDetails(occurrence({ recurrence: null, is_recurring: false }));

    const toggle = screen.getByRole('switch', { name: 'Mich erinnern' });
    expect(toggle).toBeChecked();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();

    await act(async () => { fireEvent.click(toggle); });
    expect(onChange).toHaveBeenLastCalledWith('series');
    expect(toggle).not.toBeChecked();

    await act(async () => { fireEvent.click(toggle); });
    expect(onChange).toHaveBeenLastCalledWith(null);
    expect(toggle).toBeChecked();
  });

  it('treats a changed occurrence of a series as part of it', () => {
    renderDetails(occurrence({ recurrence: null, is_recurring: false, recurrence_id: '2026-12-08T09:00:00' }));
    expect(screen.getByRole('radio', { name: 'Aus für diesen Termin' })).toBeInTheDocument();
  });

  it('goes back when saving fails', async () => {
    renderDetails(occurrence(), jest.fn(async () => undefined));

    await act(async () => { fireEvent.click(screen.getByRole('radio', { name: 'Aus für alle Wiederholungen' })); });
    expect(screen.getByRole('radio', { name: 'An' })).toBeChecked();
  });

  it('is not shown when only the creator is reminded and that is someone else', () => {
    renderDetails(occurrence({ remind_only_creator: true }));
    expect(screen.queryByRole('group', { name: 'Meine Erinnerung' })).not.toBeInTheDocument();
  });

  it('is shown to the creator of a creator-only event', () => {
    renderDetails(occurrence({ remind_only_creator: true, created_by_user_id: 2 }));
    expect(screen.getByRole('group', { name: 'Meine Erinnerung' })).toBeInTheDocument();
  });

  it('is not shown for events without reminders or without a state', () => {
    const { rerender } = render(<div />);
    for (const event of [
      occurrence({ all_day: true }),
      occurrence({ _isBirthday: true }),
      (() => { const e = occurrence(); delete e.reminder_muted; return e; })(),
    ]) {
      rerender(
        <EventDetails event={event} members={[]} messages={messages} locale="de-DE" timeFormat="24h" me={ME} onReminderChange={jest.fn()} />,
      );
      expect(screen.queryByRole('group')).not.toBeInTheDocument();
      expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    }
  });

  it('is not shown where no one can change it (Today keeps the plain details)', () => {
    render(
      <EventDetails event={occurrence()} members={[]} messages={messages} locale="de-DE" timeFormat="24h" me={ME} />,
    );
    expect(screen.queryByRole('group')).not.toBeInTheDocument();
  });
});
