// Demo data for Tribu — realistic German family content
// All dates are generated relative to "now" so the demo always feels fresh.

function today() {
  return new Date();
}

function dateAt(dayOffset, hour = 9, minute = 0) {
  const d = today();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

function birthdayIn(days) {
  const d = today();
  d.setDate(d.getDate() + days);
  return { month: d.getMonth() + 1, day: d.getDate(), occurs_on: d.toLocaleDateString('de-DE', { day: 'numeric', month: 'long' }) };
}

let _nextId = 100;
function nextId() { return _nextId++; }

export function buildDemoData() {
  const me = {
    user_id: 1,
    email: 'demo@tribu.local',
    display_name: 'Dennis',
    profile_image: '',
  };

  const families = [
    { family_id: 1, family_name: 'Familie Müller', role: 'owner' },
  ];

  const members = [
    { user_id: 1, display_name: 'Dennis', family_id: 1, is_adult: true, role: 'owner' },
    { user_id: 2, display_name: 'Anna', family_id: 1, is_adult: true, role: 'admin' },
    { user_id: 3, display_name: 'Max', family_id: 1, is_adult: false, role: 'member' },
    { user_id: 4, display_name: 'Lena', family_id: 1, is_adult: false, role: 'member' },
  ];

  const events = [
    { id: nextId(), family_id: 1, title: 'Arzttermin Leon', starts_at: dateAt(0, 10, 30), ends_at: dateAt(0, 11, 0), all_day: false, description: 'Kinderarzt Dr. Hoffmann' },
    { id: nextId(), family_id: 1, title: 'Elternabend Schule', starts_at: dateAt(1, 19, 0), ends_at: dateAt(1, 20, 30), all_day: false, description: 'Grundschule am Park, Raum 204' },
    { id: nextId(), family_id: 1, title: 'Schwimmkurs Max', starts_at: dateAt(2, 15, 0), ends_at: dateAt(2, 16, 0), all_day: false, description: null },
    { id: nextId(), family_id: 1, title: 'Familienbrunch bei Oma', starts_at: dateAt(3, 11, 0), ends_at: dateAt(3, 14, 0), all_day: false, description: 'Kuchen mitbringen!' },
    { id: nextId(), family_id: 1, title: 'Zahnarzt Anna', starts_at: dateAt(5, 8, 30), ends_at: dateAt(5, 9, 15), all_day: false, description: 'Kontrolle + Reinigung' },
    { id: nextId(), family_id: 1, title: 'Kindergeburtstag Lena', starts_at: dateAt(7, 14, 0), ends_at: dateAt(7, 17, 0), all_day: false, description: '6 Kinder eingeladen, Deko vorbereiten' },
    { id: nextId(), family_id: 1, title: 'Handwerker (Bad)', starts_at: dateAt(4, 8, 0), ends_at: dateAt(4, 12, 0), all_day: false, description: 'Fliesenleger kommt, jemand muss da sein' },
    { id: nextId(), family_id: 1, title: 'Musikschule Lena', starts_at: dateAt(1, 16, 0), ends_at: dateAt(1, 17, 0), all_day: false, description: 'Blockflöte' },
    { id: nextId(), family_id: 1, title: 'Wocheneinkauf', starts_at: dateAt(2, 9, 0), ends_at: dateAt(2, 10, 30), all_day: false, description: null },
    { id: nextId(), family_id: 1, title: 'Kino-Abend', starts_at: dateAt(6, 20, 0), ends_at: dateAt(6, 22, 30), all_day: false, description: 'Familienfilm im CineStar' },
    { id: nextId(), family_id: 1, title: 'Laternenumzug Kita', starts_at: dateAt(10, 17, 0), ends_at: dateAt(10, 18, 30), all_day: false, description: 'Treffpunkt am Haupteingang' },
    { id: nextId(), family_id: 1, title: 'Auto TÜV', starts_at: dateAt(12, 7, 30), ends_at: dateAt(12, 9, 0), all_day: false, description: 'DEKRA Starnberger Str.' },
  ];

  const tasks = [
    { id: nextId(), family_id: 1, title: 'Einkaufen', description: 'Milch, Brot, Eier, Käse, Obst', status: 'open', priority: 'normal', due_date: dateAt(0, 18, 0), recurrence: 'weekly', assigned_to_user_id: 2, created_at: dateAt(-3), updated_at: dateAt(-3) },
    { id: nextId(), family_id: 1, title: 'Müll rausbringen', description: null, status: 'open', priority: 'high', due_date: dateAt(-1, 7, 0), recurrence: 'weekly', assigned_to_user_id: 3, created_at: dateAt(-5), updated_at: dateAt(-5) },
    { id: nextId(), family_id: 1, title: 'Geschenk für Oma besorgen', description: 'Geburtstag in 2 Wochen — Buch oder Schal?', status: 'open', priority: 'normal', due_date: dateAt(10), recurrence: null, assigned_to_user_id: 1, created_at: dateAt(-2), updated_at: dateAt(-2) },
    { id: nextId(), family_id: 1, title: 'Kinderarzt-Termin vereinbaren', description: 'U-Untersuchung für Lena', status: 'open', priority: 'high', due_date: dateAt(3), recurrence: null, assigned_to_user_id: 2, created_at: dateAt(-7), updated_at: dateAt(-7) },
    { id: nextId(), family_id: 1, title: 'Fahrräder aufpumpen', description: null, status: 'open', priority: 'low', due_date: dateAt(5), recurrence: null, assigned_to_user_id: 1, created_at: dateAt(-1), updated_at: dateAt(-1) },
    { id: nextId(), family_id: 1, title: 'Blumen gießen', description: null, status: 'done', priority: 'low', due_date: null, recurrence: 'daily', assigned_to_user_id: 4, created_at: dateAt(-10), updated_at: dateAt(0) },
    { id: nextId(), family_id: 1, title: 'Steuererklärung vorbereiten', description: 'Belege sortieren, ELSTER-Login prüfen', status: 'open', priority: 'high', due_date: dateAt(14), recurrence: null, assigned_to_user_id: 1, created_at: dateAt(-4), updated_at: dateAt(-4) },
    { id: nextId(), family_id: 1, title: 'Bücherregal aufbauen', description: 'IKEA Kallax, Kinderzimmer Max', status: 'done', priority: 'normal', due_date: dateAt(-3), recurrence: null, assigned_to_user_id: 1, created_at: dateAt(-8), updated_at: dateAt(-2) },
    { id: nextId(), family_id: 1, title: 'Elternabend vorbereiten', description: 'Fragen zur AG-Wahl notieren', status: 'open', priority: 'normal', due_date: dateAt(1, 18, 0), recurrence: null, assigned_to_user_id: 2, created_at: dateAt(-1), updated_at: dateAt(-1) },
    { id: nextId(), family_id: 1, title: 'Wäsche waschen', description: null, status: 'done', priority: 'low', due_date: null, recurrence: 'weekly', assigned_to_user_id: 2, created_at: dateAt(-6), updated_at: dateAt(-1) },
  ];

  const bd1 = birthdayIn(5);
  const bd2 = birthdayIn(12);
  const bd3 = birthdayIn(22);

  const contacts = [
    { id: nextId(), family_id: 1, full_name: 'Helga Müller', email: 'helga@familie-mueller.de', phone: null, birthday_month: bd1.month, birthday_day: bd1.day },
    { id: nextId(), family_id: 1, full_name: 'Thomas Müller', email: null, phone: '+49 171 9876543', birthday_month: bd2.month, birthday_day: bd2.day },
    { id: nextId(), family_id: 1, full_name: 'Sophie Weber', email: 'sophie.w@gmail.com', phone: '+49 152 1234567', birthday_month: bd3.month, birthday_day: bd3.day },
    { id: nextId(), family_id: 1, full_name: 'Markus Fischer', email: 'markus.f@outlook.com', phone: null, birthday_month: 6, birthday_day: 14 },
    { id: nextId(), family_id: 1, full_name: 'Dr. Hoffmann', email: 'praxis@dr-hoffmann.de', phone: '+49 89 5554321', birthday_month: null, birthday_day: null },
    { id: nextId(), family_id: 1, full_name: 'Claudia Braun', email: null, phone: '+49 176 7778899', birthday_month: 3, birthday_day: 8 },
    { id: nextId(), family_id: 1, full_name: 'Peter Schneider', email: 'peter.schneider@web.de', phone: '+49 163 2223344', birthday_month: 11, birthday_day: 25 },
  ];

  const summary = {
    next_events: events.filter((e) => new Date(e.starts_at) >= today()).sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at)).slice(0, 5),
    upcoming_birthdays: [
      { person_name: 'Helga Müller', occurs_on: bd1.occurs_on, days_until: 5, month: bd1.month, day: bd1.day },
      { person_name: 'Thomas Müller', occurs_on: bd2.occurs_on, days_until: 12, month: bd2.month, day: bd2.day },
      { person_name: 'Sophie Weber', occurs_on: bd3.occurs_on, days_until: 22, month: bd3.month, day: bd3.day },
    ],
  };

  return { me, families, members, events, tasks, contacts, summary };
}
