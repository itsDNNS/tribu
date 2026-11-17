import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

import EventDetails from '../../components/calendar/EventDetails';
import { buildTestMessages } from '../test-utils';

// The German texts, as Dennis sees them.
const messages = buildTestMessages(require('../../i18n/de.json'));
const ME = { user_id: 2, display_name: 'Ben' };
const SERIES = {
  id: 5, family_id: 1, title: 'Schwimmen', starts_at: '2026-12-08T09:00:00', ends_at: '2026-12-08T10:00:00',
  all_day: false, recurrence: 'weekly', is_recurring: true, assigned_to: [1], created_by_user_id: 1,
  remind_only_creator: false, reminder_muted: null,
};
const SINGLE = { ...SERIES, recurrence: null, is_recurring: false };

function renderDetails(overrides = {}, onReminderChange = jest.fn(async (state) => state)) {
  render(
    <EventDetails
      event={{ ...SERIES, ...overrides }}
      members={[{ user_id: 1, display_name: 'Anna' }, ME]}
      messages={messages}
      locale="de-DE"
      timeFormat="24h"
      me={ME}
      onReminderChange={onReminderChange}
    />,
  );
  return onReminderChange;
}

const choose = (name) => act(async () => { fireEvent.click(screen.getByRole('radio', { name })); });

describe('My reminder in the event details', () => {
  it('offers on, off for this occurrence and off for all repetitions for a series', async () => {
    const onChange = renderDetails();
    expect(screen.getByRole('group', { name: 'Meine Erinnerung' })).toHaveAccessibleDescription(
      'Nur deine Erinnerung ändert sich, nicht wer dabei ist.',
    );
    expect(screen.getByRole('radio', { name: 'An' })).toBeChecked();

    for (const [name, state] of [['Aus für diesen Termin', 'occurrence'], ['Aus für alle Wiederholungen', 'series'], ['An', null]]) {
      await choose(name);
      expect(onChange).toHaveBeenLastCalledWith(state);
      expect(screen.getByRole('radio', { name })).toBeChecked();
    }
    // Who takes part is not part of it.
    expect(screen.getByText('Anna')).toBeInTheDocument();
  });

  it.each([
    ['the saved state', { reminder_muted: 'series' }, 'Aus für alle Wiederholungen'],
    ['a changed occurrence as part of its series', { ...SINGLE, recurrence_id: '2026-12-08T09:00:00' }, 'An'],
  ])('shows %s', (_, overrides, checked) => {
    renderDetails(overrides);
    expect(screen.getByRole('radio', { name: checked })).toBeChecked();
  });

  it('has a single switch for a single event', async () => {
    const onChange = renderDetails(SINGLE);
    const toggle = screen.getByRole('switch', { name: 'Mich erinnern' });
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();

    for (const [checked, state] of [[false, 'series'], [true, null]]) {
      await act(async () => { fireEvent.click(toggle); });
      expect(onChange).toHaveBeenLastCalledWith(state);
      expect(toggle.checked).toBe(checked);
    }
  });

  it('goes back when saving fails', async () => {
    renderDetails({}, jest.fn(async () => undefined));
    await choose('Aus für alle Wiederholungen');
    expect(screen.getByRole('radio', { name: 'An' })).toBeChecked();
  });

  it.each([
    ['only the creator is reminded and that is someone else', { remind_only_creator: true }, false],
    ['the creator of a creator-only event', { remind_only_creator: true, created_by_user_id: 2 }, true],
    ['everyone when the creator left the family', { remind_only_creator: true, created_by_user_id: null }, true],
    ['an all-day event', { all_day: true }, false],
    ['a birthday', { _isBirthday: true }, false],
    ['an event without a reminder state (the dashboard)', { reminder_muted: undefined }, false],
    ['a place where no one can change it (Today keeps the plain details)', {}, false, null],
  ])('is shown for %s: %s', (_, overrides, shown, onReminderChange = jest.fn()) => {
    renderDetails(overrides, onReminderChange);
    expect(Boolean(screen.queryByRole('group', { name: 'Meine Erinnerung' }))).toBe(shown);
  });
});
