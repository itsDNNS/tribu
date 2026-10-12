import { formatDutyTime, isoDate, orderedWeekdays, weekdayName } from '../../lib/duties';

describe('weekly duty helpers', () => {
  it('orders the weekdays from the configured first day', () => {
    expect(orderedWeekdays(1)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(orderedWeekdays(0)).toEqual([6, 0, 1, 2, 3, 4, 5]);
  });

  it('names a server weekday', () => {
    expect(weekdayName(0, 'en-US', 'long')).toBe('Monday');
    expect(weekdayName(6, 'en-US', 'long')).toBe('Sunday');
  });

  it('writes the local calendar date', () => {
    expect(isoDate(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05');
  });

  it('shows the due time in the chosen clock', () => {
    expect(formatDutyTime('15:30:00', 'en-US', '24h')).toBe('15:30');
    expect(formatDutyTime('15:30:00', 'en-US', '12h')).toBe('03:30 PM');
    expect(formatDutyTime(null, 'en-US')).toBeNull();
  });
});
