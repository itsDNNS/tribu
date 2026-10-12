import { alternateFromFor, formatDutyTime, isoDate, isWeekA, orderedWeekdays, weekdayName } from '../../lib/duties';

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

describe('alternating weeks', () => {
  it('tells week A from week B like the server', () => {
    expect(isWeekA('2026-12-07', new Date(2026, 11, 9))).toBe(true);
    expect(isWeekA('2026-12-07', new Date(2026, 11, 14))).toBe(false);
    expect(isWeekA('2026-12-07', new Date(2026, 11, 27))).toBe(true); // a Sunday still counts with its Monday
    expect(isWeekA('2026-12-07', new Date(2026, 10, 30))).toBe(false); // before the anchor
  });

  it('picks the anchor that makes this week A or B', () => {
    const wednesday = new Date(2026, 11, 16);
    expect(alternateFromFor(true, wednesday)).toBe('2026-12-14');
    expect(alternateFromFor(false, wednesday)).toBe('2026-12-07');
    expect(isWeekA(alternateFromFor(false, wednesday), wednesday)).toBe(false);
  });

  it('counts across a change to daylight saving time', () => {
    expect(isWeekA('2027-03-22', new Date(2027, 2, 29, 12))).toBe(false);
    expect(isWeekA('2027-03-22', new Date(2027, 3, 5, 12))).toBe(true);
  });
});
