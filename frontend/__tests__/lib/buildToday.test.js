import cases from '../../lib/today/todayCases.json';
import { buildToday } from '../../lib/today/buildToday';

function localDate(value) {
  const [date, time] = value.split('T');
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  return new Date(year, month - 1, day, hour, minute);
}

describe('buildToday', () => {
  it.each(cases.cases.map((entry) => [entry.name, entry]))('builds the day for %s', (_, entry) => {
    const result = buildToday({
      now: localDate(entry.now || cases.now),
      events: cases.events,
      tasks: cases.tasks,
      meals: cases.meals,
      birthdays: cases.birthdays,
      members: cases.members,
      memberId: entry.memberId,
    });
    expect(result).toEqual(entry.expect);
  });

  it('is empty without data', () => {
    expect(buildToday({ now: localDate(cases.now) })).toEqual({ today: [], nowIndex: 0, overdue: [], week: [] });
  });
});
