import React, { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

import EventEditor from '../../components/calendar/EventEditor';

jest.mock('../../lib/i18n', () => ({
  t: (_messages, key) => key,
}));

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});

function Harness({ recurrence, onWeekdays }) {
  const [recurrenceWeekdays, setRecurrenceWeekdays] = useState([]);
  const cal = {
    title: 'Training', setTitle: () => {},
    startsAt: '2026-10-05T18:00', setStartsAt: () => {},
    endsAt: '', setEndsAt: () => {},
    location: '', setLocation: () => {},
    description: '', setDescription: () => {},
    assignedTo: [], setAssignedTo: () => {},
    color: '', setColor: () => {},
    recurrence, setRecurrence: () => {},
    recurrenceEnd: '', setRecurrenceEnd: () => {},
    recurrenceWeekdays,
    setRecurrenceWeekdays: (value) => { setRecurrenceWeekdays(value); onWeekdays(value); },
    icon: '', setIcon: () => {},
    allDay: false, setAllDay: () => {},
    duplicateSource: null,
  };
  return <EventEditor cal={cal} editing={false} members={[]} messages={{}} locale="en-US" onClose={() => {}} onDelete={() => {}} />;
}

describe('EventEditor weekly weekdays', () => {
  it("offers weekdays for weekly rules with the start's weekday preselected", () => {
    const onWeekdays = jest.fn();
    render(<Harness recurrence="weekly" onWeekdays={onWeekdays} />);

    const group = screen.getByRole('group', { name: 'module.calendar.repeat_on' });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Mon' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Thu' })).not.toBeChecked();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Thu' }));

    expect(onWeekdays).toHaveBeenLastCalledWith([0, 3]);
    expect(screen.getByRole('checkbox', { name: 'Thu' })).toBeChecked();
  });

  it('hides the weekdays for other rules', () => {
    render(<Harness recurrence="monthly" onWeekdays={() => {}} />);

    expect(screen.queryByRole('group', { name: 'module.calendar.repeat_on' })).not.toBeInTheDocument();
  });
});
