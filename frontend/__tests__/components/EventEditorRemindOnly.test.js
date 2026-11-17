import React, { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

import EventEditor from '../../components/calendar/EventEditor';

const MESSAGES = {
  'module.calendar.remind_only_me': 'Nur mich erinnern',
  'module.calendar.remind_only_me_hint': 'Andere Familienmitglieder bekommen keine Erinnerung zu diesem Termin.',
  'module.calendar.remind_only_member': 'Nur {name} wird erinnert.',
};

jest.mock('../../lib/i18n', () => ({
  t: (messages, key) => messages[key] ?? key,
}));

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});

const MEMBERS = [
  { user_id: 1, display_name: 'Anna' },
  { user_id: 2, display_name: 'Ben' },
];

function Harness({ editing = false, owns = false, event = null, initial = false, onChange = () => {} }) {
  const [remind, setRemind] = useState(initial);
  const prefix = editing ? 'edit' : '';
  const name = (key) => (prefix ? `${prefix}${key[0].toUpperCase()}${key.slice(1)}` : key);
  const set = (key) => `set${name(key)[0].toUpperCase()}${name(key).slice(1)}`;
  const cal = { duplicateSource: null, editingEvent: event, ownsEditingEvent: owns };
  const values = {
    title: 'Dentist', startsAt: '2026-10-05T18:00', endsAt: '', location: '', description: '',
    assignedTo: [], color: '', recurrence: '', recurrenceEnd: '', recurrenceWeekdays: [], icon: '', allDay: false,
  };
  for (const [key, value] of Object.entries(values)) {
    cal[name(key)] = value;
    cal[set(key)] = () => {};
  }
  cal[name('remindOnlyCreator')] = remind;
  cal[set('remindOnlyCreator')] = (value) => { setRemind(value); onChange(value); };
  return (
    <EventEditor cal={cal} editing={editing} members={MEMBERS} messages={MESSAGES} locale="de-DE" onClose={() => {}} onDelete={() => {}} />
  );
}

describe('EventEditor remind only me', () => {
  it('offers the choice when creating an event, described by its hint', () => {
    const onChange = jest.fn();
    render(<Harness onChange={onChange} />);

    const toggle = screen.getByRole('checkbox', { name: 'Nur mich erinnern' });
    expect(toggle).not.toBeChecked();
    expect(toggle).toHaveAccessibleDescription('Andere Familienmitglieder bekommen keine Erinnerung zu diesem Termin.');

    fireEvent.click(toggle);
    expect(onChange).toHaveBeenLastCalledWith(true);
    expect(toggle).toBeChecked();
  });

  it('lets the creator change it when editing', () => {
    const onChange = jest.fn();
    render(
      <Harness
        editing
        owns
        initial
        event={{ id: 5, created_by_user_id: 1, remind_only_creator: true }}
        onChange={onChange}
      />,
    );

    const toggle = screen.getByRole('checkbox', { name: 'Nur mich erinnern' });
    expect(toggle).toBeChecked();
    fireEvent.click(toggle);
    expect(onChange).toHaveBeenLastCalledWith(false);
    expect(screen.queryByText('Nur Anna wird erinnert.')).not.toBeInTheDocument();
  });

  it('shows everyone else who is reminded, without a toggle', () => {
    render(
      <Harness editing initial event={{ id: 5, created_by_user_id: 1, remind_only_creator: true }} />,
    );

    expect(screen.queryByRole('checkbox', { name: 'Nur mich erinnern' })).not.toBeInTheDocument();
    expect(screen.getByText('Nur Anna wird erinnert.')).toBeInTheDocument();
  });

  it('shows nothing to others while everyone is reminded', () => {
    render(<Harness editing event={{ id: 5, created_by_user_id: 1, remind_only_creator: false }} />);

    expect(screen.queryByRole('checkbox', { name: 'Nur mich erinnern' })).not.toBeInTheDocument();
    expect(screen.queryByText(/wird erinnert/)).not.toBeInTheDocument();
  });

  it('shows nothing when the creator has left the family, since everyone is reminded then', () => {
    render(<Harness editing initial event={{ id: 5, created_by_user_id: 99, remind_only_creator: true }} />);

    expect(screen.queryByRole('checkbox', { name: 'Nur mich erinnern' })).not.toBeInTheDocument();
    expect(screen.queryByText(/wird erinnert/)).not.toBeInTheDocument();
  });
});
