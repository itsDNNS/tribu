import { nextDueDate } from '../../lib/tasks/nextDue';

const iso = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

describe('nextDueDate (T7)', () => {
  it('follows the recurrence from the due date', () => {
    expect(iso(nextDueDate('2026-09-30T00:00:00', 'daily'))).toBe('2026-10-01');
    expect(iso(nextDueDate('2026-09-30T18:00:00', 'weekly'))).toBe('2026-10-07');
    expect(iso(nextDueDate('2026-09-30T18:00:00', 'biweekly'))).toBe('2026-10-14');
    expect(iso(nextDueDate('2026-01-31T00:00:00', 'monthly'))).toBe('2026-02-28');
    expect(iso(nextDueDate('2028-02-29T00:00:00', 'yearly'))).toBe('2029-02-28');
    // The first Monday of October 2026 is the 5th.
    expect(iso(nextDueDate('2026-09-07T00:00:00', 'monthly_first_monday'))).toBe('2026-10-05');
  });

  it('counts from now without a due date and knows nothing else', () => {
    expect(iso(nextDueDate(null, 'daily', new Date(2026, 8, 30, 10)))).toBe('2026-10-01');
    expect(nextDueDate('2026-09-30T00:00:00', null)).toBeNull();
    expect(nextDueDate('2026-09-30T00:00:00', 'hourly')).toBeNull();
  });
});
