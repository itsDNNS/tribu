import { groupTasks, postponeOptions, postponeTarget, taskGroup } from '../../lib/taskGroups';

// Wednesday, 30 September 2026, 10:00 local time.
const NOW = new Date(2026, 8, 30, 10, 0);

describe('taskGroups', () => {
  it('groups open tasks by when they are due and keeps done tasks apart', () => {
    expect(taskGroup({ status: 'open', due_date: '2026-09-29T18:00:00' }, NOW)).toBe('overdue');
    expect(taskGroup({ status: 'open', due_date: '2026-09-30T08:00:00' }, NOW)).toBe('today');
    expect(taskGroup({ status: 'open', due_date: '2026-09-30T00:00:00', due_is_date: true }, NOW)).toBe('today');
    expect(taskGroup({ status: 'open', due_date: '2026-10-01T09:00:00' }, NOW)).toBe('upcoming');
    expect(taskGroup({ status: 'open', due_date: null }, NOW)).toBe('no_date');
    expect(taskGroup({ status: 'done', due_date: '2026-09-01T09:00:00' }, NOW)).toBe('done');
  });

  it('sorts dated groups by due date and undated ones by priority, then newest', () => {
    const groups = groupTasks([
      { id: 1, status: 'open', due_date: '2026-10-03T09:00:00' },
      { id: 2, status: 'open', due_date: '2026-10-01T09:00:00' },
      { id: 3, status: 'open', priority: 'normal', created_at: '2026-09-20T09:00:00' },
      { id: 4, status: 'open', priority: 'high', created_at: '2026-09-01T09:00:00' },
      { id: 5, status: 'open', priority: 'normal', created_at: '2026-09-25T09:00:00' },
    ], NOW);
    expect(groups.upcoming.map((task) => task.id)).toEqual([2, 1]);
    expect(groups.no_date.map((task) => task.id)).toEqual([4, 5, 3]);
  });

  it('offers this evening only before seven', () => {
    expect(postponeOptions(NOW)).toEqual(['tonight', 'tomorrow', 'next_week']);
    expect(postponeOptions(new Date(2026, 8, 30, 20, 0))).toEqual(['tomorrow', 'next_week']);
  });

  it('keeps the time of day and whether a task is date-only', () => {
    const timed = { due_date: '2026-09-29T18:30:00', due_is_date: false };
    const dateOnly = { due_date: '2026-09-29T00:00:00', due_is_date: true };
    expect(postponeTarget(timed, 'tomorrow', NOW)).toEqual({ due_date: '2026-10-01T18:30:00', due_is_date: false });
    expect(postponeTarget(dateOnly, 'tomorrow', NOW)).toEqual({ due_date: '2026-10-01T00:00:00', due_is_date: true });
    expect(postponeTarget({ due_date: null }, 'tonight', NOW)).toEqual({ due_date: '2026-09-30T19:00:00', due_is_date: false });
  });

  it('moves next week to the first day of the family week', () => {
    expect(postponeTarget({ due_date: null }, 'next_week', NOW, 1).due_date).toBe('2026-10-05T00:00:00');
    expect(postponeTarget({ due_date: null }, 'next_week', NOW, 0).due_date).toBe('2026-10-04T00:00:00');
    const monday = new Date(2026, 9, 5, 9, 0);
    expect(postponeTarget({ due_date: null }, 'next_week', monday, 1).due_date).toBe('2026-10-12T00:00:00');
  });
});
