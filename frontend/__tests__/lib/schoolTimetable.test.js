import { currentPeriodPosition, openingWeekday, schoolToday } from '../../lib/schoolTimetable';

const periods = [
  { position: 1, start_time: '08:00', end_time: '08:45', kind: 'lesson' },
  { position: 2, start_time: '08:45:00', end_time: '09:00:00', kind: 'break' },
  { position: 3, start_time: '09:00', end_time: '09:45', kind: 'lesson' },
];

describe('school timetable', () => {
  it('finds the period running now', () => {
    expect(currentPeriodPosition(periods, new Date(2026, 8, 29, 8, 0))).toBe(1);
    expect(currentPeriodPosition(periods, new Date(2026, 8, 29, 8, 50))).toBe(2);
    expect(currentPeriodPosition(periods, new Date(2026, 8, 29, 9, 45))).toBeNull();
    expect(currentPeriodPosition(periods, new Date(2026, 8, 29, 7, 59))).toBeNull();
  });

  it('opens on today, or on the first school day', () => {
    const weekdays = [1, 2, 3, 4, 5];
    expect(openingWeekday(weekdays, new Date(2026, 8, 30))).toBe(3); // Wednesday
    expect(openingWeekday(weekdays, new Date(2026, 9, 3))).toBe(1); // Saturday
    expect(openingWeekday(weekdays, new Date(2026, 9, 4))).toBe(1); // Sunday
    expect(openingWeekday([...weekdays, 6], new Date(2026, 9, 3))).toBe(6);
    expect(schoolToday(weekdays, new Date(2026, 9, 4))).toBeNull();
    expect(schoolToday(weekdays, new Date(2026, 8, 29))).toBe(2);
  });
});
