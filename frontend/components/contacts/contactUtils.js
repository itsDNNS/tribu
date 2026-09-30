// Helpers for the contacts view: every person is a contact, and the
// birthday is part of it; family members' own birthdays come from their
// profiles.

const AVATAR_COLORS = [
  'var(--member-1)', 'var(--member-2)', 'var(--member-3)', 'var(--member-4)',
  'var(--success)', 'var(--sapphire)', 'var(--warning)',
];

export function avatarColor(name) {
  let hash = 0;
  for (let i = 0; i < (name || '').length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export function initials(name) {
  return (name || '?').split(/\s+/).filter(Boolean).map((word) => word[0]).join('').slice(0, 2).toUpperCase() || '?';
}

export function channels(contact) {
  const emails = contact.email_values?.length ? contact.email_values : contact.email ? [contact.email] : [];
  const phones = contact.phone_values?.length ? contact.phone_values : contact.phone ? [contact.phone] : [];
  return { emails, phones };
}

function fold(value) {
  return String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

// A contact matches a search by name, email, phone, organization or note.
export function matchesQuery(contact, query) {
  const wanted = fold(query).trim();
  if (!wanted) return true;
  const { emails, phones } = channels(contact);
  const digits = wanted.replace(/\D/g, '');
  return [contact.full_name, contact.organization, contact.note, ...emails].some((value) => fold(value).includes(wanted))
    || (digits.length >= 3 && phones.some((phone) => phone.replace(/\D/g, '').includes(digits)));
}

export function groupByLetter(contacts, locale) {
  const sorted = [...contacts].sort((a, b) => (a.full_name || '').localeCompare(b.full_name || '', locale));
  const groups = new Map();
  for (const contact of sorted) {
    const letter = fold(contact.full_name || '#').charAt(0).toUpperCase() || '#';
    const key = /[A-Z]/.test(letter) ? letter : '#';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(contact);
  }
  return [...groups];
}

export function daysUntil(month, day, now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let next = new Date(now.getFullYear(), month - 1, day);
  if (next < today) next = new Date(now.getFullYear() + 1, month - 1, day);
  return Math.round((next - today) / 86400000);
}

// The age someone turns on their next birthday, or null without a year.
export function turningAge(year, month, day, now = new Date()) {
  if (!year) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const thisYear = new Date(now.getFullYear(), month - 1, day);
  return (thisYear < today ? now.getFullYear() + 1 : now.getFullYear()) - year;
}

// Everyone with a birthday: contacts, and members from their profiles.
export function birthdayPeople({ contacts = [], members = [] }) {
  const people = [];
  for (const contact of contacts) {
    if (!contact.birthday_month || !contact.birthday_day) continue;
    people.push({
      key: `contact-${contact.id}`,
      contact,
      name: contact.full_name,
      month: contact.birthday_month,
      day: contact.birthday_day,
      year: contact.birthday_year || null,
    });
  }
  for (const member of members) {
    const match = String(member?.date_of_birth || '').match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (!match) continue;
    people.push({
      key: `member-${member.user_id}`,
      member,
      name: member.display_name || '',
      month: Number(match[2]),
      day: Number(match[3]),
      year: Number(match[1]),
      color: member.color,
    });
  }
  return people;
}

export function upcoming(people, now = new Date(), limit = 6) {
  return [...people]
    .map((person) => ({ ...person, days: daysUntil(person.month, person.day, now) }))
    .sort((a, b) => a.days - b.days || a.name.localeCompare(b.name))
    .slice(0, limit);
}

// By month, starting with this month so what comes next is on top.
export function groupByMonth(people, now = new Date()) {
  const current = now.getMonth() + 1;
  const order = (month) => (month - current + 12) % 12;
  const groups = new Map();
  for (const person of [...people].sort((a, b) => order(a.month) - order(b.month) || a.day - b.day || a.name.localeCompare(b.name))) {
    if (!groups.has(person.month)) groups.set(person.month, []);
    groups.get(person.month).push(person);
  }
  return [...groups];
}

export function birthdayDate(month, day, locale) {
  return new Date(2000, month - 1, day).toLocaleDateString(locale, { day: 'numeric', month: 'long' });
}

export function monthName(month, locale) {
  return new Date(2000, month - 1, 1).toLocaleDateString(locale, { month: 'long' });
}
