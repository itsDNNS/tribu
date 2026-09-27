import {
  mondayBasedWeekday,
  selectedWeekdays,
  toggleWeekday,
  weekdaysPayload,
} from '../../lib/calendar-recurrence';

describe('calendar recurrence weekdays', () => {
  it('counts weekdays from Monday like the backend', () => {
    expect(mondayBasedWeekday('2026-10-05T18:00')).toBe(0);
    expect(mondayBasedWeekday('2026-10-11')).toBe(6);
    expect(mondayBasedWeekday('')).toBeNull();
  });

  it("shows the start's weekday until others are chosen", () => {
    expect(selectedWeekdays([], '2026-10-07T18:00')).toEqual([2]);
    expect(selectedWeekdays([0, 3], '2026-10-07T18:00')).toEqual([0, 3]);
  });

  it('adds and removes days but keeps at least one', () => {
    const start = '2026-10-05T18:00';
    expect(toggleWeekday([], start, 3)).toEqual([0, 3]);
    expect(toggleWeekday([0, 3], start, 0)).toEqual([3]);
    expect(toggleWeekday([3], start, 3)).toEqual([3]);
  });

  it('sends weekdays only for weekly rules', () => {
    expect(weekdaysPayload('weekly', [0, 3])).toEqual([0, 3]);
    expect(weekdaysPayload('biweekly', [1])).toEqual([1]);
    expect(weekdaysPayload('weekly', [])).toBeNull();
    expect(weekdaysPayload('monthly', [0, 3])).toBeNull();
    expect(weekdaysPayload('', [0])).toBeNull();
  });
});
