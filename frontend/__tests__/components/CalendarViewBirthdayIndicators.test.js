import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

import CalendarView from '../../components/calendar';

const mockUseApp = jest.fn();
const mockUseCalendar = jest.fn();

jest.mock('../../contexts/AppContext', () => ({
  useApp: () => mockUseApp(),
}));

jest.mock('../../hooks/useCalendar', () => ({
  useCalendar: () => mockUseCalendar(),
}));

function baseApp() {
  return {
    familyId: 1,
    families: [{ family_id: 1, family_name: 'Family' }],
    messages: {
      calendar: 'Calendar',
      'module.calendar.weekdays': 'Sun,Mon,Tue,Wed,Thu,Fri,Sat',
      'module.calendar.today': 'Today',
      'module.calendar.month': 'Month',
      'module.calendar.week': 'Week',
      'aria.previous_month': 'Previous month',
      'aria.next_month': 'Next month',
      'aria.events': '{count} events',
    },
    isMobile: false,
    lang: 'en',
    demoMode: false,
    events: [],
    setActiveView: jest.fn(),
    isChild: false,
    members: [],
    timeFormat: '24h',
  };
}

function monthCell(day, events = []) {
  return { empty: false, day, count: events.length, events };
}

function emptyCell() {
  return { empty: true };
}

function baseCalendar(cells) {
  return {
    calendarView: 'month',
    calendarMonth: new Date(2026, 4, 1),
    selectedDate: null,
    monthCells: cells,
    setCalendarMonth: jest.fn(),
    setSelectedDate: jest.fn(),
    startsAt: '',
    setStartsAt: jest.fn(),
    weekInfo: { weekNumber: 18, weekStart: new Date(2026, 4, 1), weekEnd: new Date(2026, 4, 8), days: [] },
    setCalendarView: jest.fn(),
    prevWeek: jest.fn(),
    nextWeek: jest.fn(),
    goToCurrentWeek: jest.fn(),
    deleteConfirm: null,
    setDeleteConfirm: jest.fn(),
    performDelete: jest.fn(),
    deleteEvent: jest.fn(),
    startEdit: jest.fn(),
  };
}

describe('CalendarView birthday month indicators', () => {
  beforeEach(() => {
    mockUseApp.mockReturnValue(baseApp());
  });

  it('shows a cake indicator instead of a regular dot for a birthday-only day', () => {
    mockUseCalendar.mockReturnValue(baseCalendar([
      emptyCell(),
      monthCell(1, [{ id: 'birthday-1', title: 'Mia Birthday', _isBirthday: true, color: '#f43f5e' }]),
    ]));

    render(<CalendarView />);

    const birthdayDay = screen.getByRole('button', { name: /May 1, 1 birthday/i });
    expect(birthdayDay.querySelector('.calendar-day-birthday-indicator')).toBeInTheDocument();
    expect(birthdayDay.querySelector('.calendar-day-dot')).not.toBeInTheDocument();
  });

  it('shows both birthday and regular event cues on a mixed day', () => {
    mockUseCalendar.mockReturnValue(baseCalendar([
      emptyCell(),
      monthCell(2, [
        { id: 'birthday-2', title: 'Noah Birthday', _isBirthday: true, color: '#f43f5e' },
        { id: 42, title: 'Football', color: '#2563eb' },
      ]),
    ]));

    render(<CalendarView />);

    const mixedDay = screen.getByRole('button', { name: /May 2, 1 birthday, 1 event/i });
    expect(mixedDay.querySelector('.calendar-day-birthday-indicator')).toBeInTheDocument();
    expect(mixedDay.querySelectorAll('.calendar-day-dot')).toHaveLength(1);
  });

  it('keeps regular event-only days on dot indicators', () => {
    mockUseCalendar.mockReturnValue(baseCalendar([
      emptyCell(),
      monthCell(3, [{ id: 99, title: 'Dentist', color: '#16a34a' }]),
    ]));

    render(<CalendarView />);

    const eventDay = screen.getByRole('button', { name: /May 3, 1 event/i });
    expect(eventDay.querySelector('.calendar-day-birthday-indicator')).not.toBeInTheDocument();
    expect(eventDay.querySelectorAll('.calendar-day-dot')).toHaveLength(1);
  });

  it('shows allowlisted event icons instead of regular dots in month cells', () => {
    mockUseCalendar.mockReturnValue(baseCalendar([
      emptyCell(),
      monthCell(4, [{ id: 77, title: 'Soccer practice', color: '#16a34a', icon: 'soccer' }]),
    ]));

    render(<CalendarView />);

    const eventDay = screen.getByRole('button', { name: /May 4, 1 event: Soccer training/i });
    expect(eventDay.querySelector('.calendar-day-icon-indicator')).toHaveTextContent('⚽');
    expect(eventDay.querySelector('.calendar-day-dot')).not.toBeInTheDocument();
  });
});
