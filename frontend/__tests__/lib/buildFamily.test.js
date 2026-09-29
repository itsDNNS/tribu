import { buildFamily } from '../../lib/family/buildFamily';
import cases from '../../lib/family/familyCases.json';

function localDate(wall) {
  const [date, time] = wall.split('T');
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  return new Date(year, month - 1, day, hour, minute);
}

describe('buildFamily', () => {
  it.each(cases.cases.map((c) => [c.name, c]))('%s', (_name, c) => {
    const result = buildFamily({ ...c, now: localDate(c.now) });
    expect(result).toEqual(c.expected);
  });

  it('leaves points and goals out without a reward currency', () => {
    const [c] = cases.cases;
    const result = buildFamily({ ...c, now: localDate(c.now), balances: null });
    expect(result.people.every((person) => person.points === null && person.goal === null)).toBe(true);
  });
});
