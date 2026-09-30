import {
  birthdayPeople,
  daysUntil,
  groupByLetter,
  groupByMonth,
  matchesQuery,
  turningAge,
  upcoming,
} from '../../components/contacts/contactUtils';

const now = new Date(2026, 8, 30); // 30 September 2026

describe('contact helpers', () => {
  it('counts the days to a birthday, wrapping into next year', () => {
    expect(daysUntil(9, 30, now)).toBe(0);
    expect(daysUntil(10, 2, now)).toBe(2);
    expect(daysUntil(9, 29, now)).toBe(364);
  });

  it('knows the age someone turns next', () => {
    expect(turningAge(1948, 10, 2, now)).toBe(78);
    expect(turningAge(1990, 3, 14, now)).toBe(37);
    expect(turningAge(2000, 9, 30, now)).toBe(26);
    expect(turningAge(null, 3, 14, now)).toBeNull();
  });

  it('puts contacts and members with a birthday in order', () => {
    const people = birthdayPeople({
      contacts: [
        { id: 1, full_name: 'Helga', birthday_month: 10, birthday_day: 2, birthday_year: 1948 },
        { id: 2, full_name: 'No birthday' },
      ],
      members: [{ user_id: 5, display_name: 'Mia', date_of_birth: '2017-09-30', color: '#8b5cf6' }],
    });
    expect(upcoming(people, now).map((p) => [p.name, p.days])).toEqual([['Mia', 0], ['Helga', 2]]);
    expect(groupByMonth(people, now).map(([month]) => month)).toEqual([9, 10]);
  });

  it('starts the months with the current one', () => {
    const people = [{ name: 'A', month: 3, day: 1 }, { name: 'B', month: 11, day: 1 }, { name: 'C', month: 9, day: 5 }];
    expect(groupByMonth(people, now).map(([month]) => month)).toEqual([9, 11, 3]);
  });

  it('matches names without accents and phone numbers by digits', () => {
    const contact = { full_name: 'Jürgen Groß', phone_values: ['+49 170 1234567'], email: 'j@example.com' };
    expect(matchesQuery(contact, 'jurgen')).toBe(true);
    expect(matchesQuery(contact, '0170 1234567'.slice(1))).toBe(true);
    expect(matchesQuery(contact, 'example')).toBe(true);
    expect(matchesQuery(contact, 'anna')).toBe(false);
  });

  it('groups by first letter, accents folded', () => {
    const groups = groupByLetter([{ full_name: 'Özlem' }, { full_name: 'Otto' }, { full_name: '1 Plumber' }], 'de-DE');
    expect(groups.map(([letter, list]) => [letter, list.length])).toEqual([['#', 1], ['O', 2]]);
  });
});
