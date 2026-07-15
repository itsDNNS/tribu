import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

import DayDetailPanel from '../../components/calendar/DayDetailPanel';

function baseCal(overrides = {}) {
  return {
    selectedDate: new Date(2026, 4, 12),
    selectedDayEvents: [],
    duplicateSource: null,
    editingEvent: null,
    title: '',
    setTitle: jest.fn(),
    description: '',
    setDescription: jest.fn(),
    location: '',
    setLocation: jest.fn(),
    startsAt: '2026-05-12T09:00',
    setStartsAt: jest.fn(),
    endsAt: '',
    setEndsAt: jest.fn(),
    allDay: false,
    setAllDay: jest.fn(),
    recurrence: '',
    setRecurrence: jest.fn(),
    recurrenceEnd: '',
    setRecurrenceEnd: jest.fn(),
    assignedTo: [],
    setAssignedTo: jest.fn(),
    color: '',
    setColor: jest.fn(),
    icon: '',
    setIcon: jest.fn(),
    createEvent: jest.fn(),
    cancelDuplicate: jest.fn(),
    creating: false,
    ...overrides,
  };
}

const messages = {
  'module.calendar.no_events_day': 'No events on this day',
  'module.calendar.quick_add': 'Quick add',
  'module.calendar.duplicate_event': 'Duplicate event',
  'module.calendar.duplicating_hint': 'Duplicating "{title}". Adjust the details and save it as a new event.',
  'module.calendar.new_event': 'New event...',
  'module.calendar.location': 'Location or address',
  'module.calendar.description': 'Description',
  'module.calendar.no_repeat': 'Does not repeat',
  'module.calendar.repeat_daily': 'Daily',
  'module.calendar.repeat_weekly': 'Weekly',
  'module.calendar.repeat_biweekly': 'Every two weeks',
  'module.calendar.repeat_monthly': 'Monthly',
  'module.calendar.repeat_yearly': 'Yearly',
  'module.calendar.recurring': 'Recurring',
  'module.calendar.assign_to': 'Assign to',
  'module.calendar.color': 'Color',
  'module.calendar.color_none': 'No color',
  'module.calendar.icon': 'Icon',
  'module.calendar.icon_none': 'No icon',
  all_day: 'All day',
  cancel: 'Cancel',
  create_event: 'Create event',
};

function renderPanel(cal, props = {}) {
  return render(
    <DayDetailPanel
      cal={cal}
      locale="en-US"
      messages={messages}
      lang="en"
      timeFormat="24h"
      events={[]}
      members={[]}
      isChild={false}
      demoMode
      setActiveView={jest.fn()}
      {...props}
    />,
  );
}

describe('DayDetailPanel duplicate draft', () => {
  it('shows distinguishable editable fields, cancel, and a disabled in-flight submit', () => {
    const cal = baseCal({
      duplicateSource: { id: 5, title: 'Family dinner' },
      title: 'Family dinner',
      description: 'Bring dessert',
      allDay: true,
      creating: true,
    });

    renderPanel(cal);

    expect(screen.getByText('Duplicate event')).toBeInTheDocument();
    expect(screen.getByText('Duplicating "Family dinner". Adjust the details and save it as a new event.'))
      .toHaveClass('cal-edit-recurring-hint');
    expect(screen.getByPlaceholderText('Description')).toHaveValue('Bring dessert');
    expect(screen.getByRole('checkbox', { name: 'All day' })).toBeChecked();
    expect(screen.getByRole('combobox', { name: 'Recurring' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create event' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(cal.cancelDuplicate).toHaveBeenCalledTimes(1);
  });

  it('focuses and selects the duplicate title on desktop only', () => {
    const cal = baseCal({ duplicateSource: { id: 5, title: 'Family dinner' }, title: 'Family dinner' });
    const { unmount } = renderPanel(cal);
    const desktopTitle = screen.getByDisplayValue('Family dinner');

    expect(desktopTitle).toHaveFocus();
    expect(desktopTitle.selectionStart).toBe(0);
    expect(desktopTitle.selectionEnd).toBe('Family dinner'.length);

    unmount();
    renderPanel(cal, { isMobile: true });
    expect(screen.getByDisplayValue('Family dinner')).not.toHaveFocus();
  });

  it('hides the duplicate draft while editing, then restores it after edit cancel', () => {
    const cal = baseCal({
      duplicateSource: { id: 5, title: 'Family dinner' },
      editingEvent: { id: 8, title: 'Other event', is_recurring: false },
      editTitle: 'Other event',
      setEditTitle: jest.fn(),
      editLocation: '',
      setEditLocation: jest.fn(),
      editStartsAt: '2026-05-12T10:00',
      setEditStartsAt: jest.fn(),
      editEndsAt: '',
      setEditEndsAt: jest.fn(),
      editRecurrence: '',
      setEditRecurrence: jest.fn(),
      editRecurrenceEnd: '',
      setEditRecurrenceEnd: jest.fn(),
      editAssignedTo: [],
      setEditAssignedTo: jest.fn(),
      editColor: '',
      setEditColor: jest.fn(),
      editIcon: '',
      setEditIcon: jest.fn(),
      editDescription: '',
      setEditDescription: jest.fn(),
      saveEdit: jest.fn(),
      cancelEdit: jest.fn(),
    });
    const { rerender } = renderPanel(cal);

    expect(screen.queryByText('Duplicate event')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(cal.cancelEdit).toHaveBeenCalledTimes(1);

    rerender(
      <DayDetailPanel cal={{ ...cal, editingEvent: null }} locale="en-US" messages={messages} lang="en"
        timeFormat="24h" events={[]} members={[]} isChild={false} demoMode
        setActiveView={jest.fn()} />,
    );
    expect(screen.getByText('Duplicate event')).toBeInTheDocument();

    rerender(
      <DayDetailPanel cal={baseCal()} locale="en-US" messages={messages} lang="en"
        timeFormat="24h" events={[]} members={[]} isChild={false} demoMode
        setActiveView={jest.fn()} />,
    );
    expect(screen.getByText('Quick add')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Description')).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'All day' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
  });
});
