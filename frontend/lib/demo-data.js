// Demo data for Tribu — realistic family content
// All dates are generated relative to "now" so the demo always feels fresh.
// Supports 'de' (German) and 'en' (English) locales.

function today() {
  return new Date();
}

function dateAt(dayOffset, hour = 9, minute = 0) {
  const d = today();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

function birthdayIn(days, lang = 'en') {
  const d = today();
  d.setDate(d.getDate() + days);
  const locale = lang === 'de' ? 'de-DE' : 'en-US';
  return { month: d.getMonth() + 1, day: d.getDate(), occurs_on: d.toLocaleDateString(locale, { day: 'numeric', month: 'long' }) };
}

let _nextId = 100;
function nextId() { return _nextId++; }

const strings = {
  en: {
    familyName: 'Müller Family',
    events: [
      { title: "Doctor's appointment Leon", desc: 'Pediatrician Dr. Hoffmann' },
      { title: 'Parent-teacher meeting', desc: 'Elementary school, Room 204' },
      { title: 'Swimming lessons Max', desc: null },
      { title: 'Family brunch at Grandma\'s', desc: 'Bring cake!' },
      { title: 'Dentist Anna', desc: 'Checkup + cleaning' },
      { title: 'Lena\'s birthday party', desc: '6 kids invited, prepare decorations' },
      { title: 'Plumber (bathroom)', desc: 'Tiler coming, someone needs to be home' },
      { title: 'Music lesson Lena', desc: 'Recorder' },
      { title: 'Weekly grocery shopping', desc: null },
      { title: 'Movie night', desc: 'Family film at the cinema' },
      { title: 'Lantern parade daycare', desc: 'Meeting point at main entrance' },
      { title: 'Car inspection', desc: 'TÜV / MOT due' },
    ],
    recurringEvents: [
      { title: 'Piano lesson', desc: null, recurrence: 'weekly' },
      { title: 'Recycling', desc: null, recurrence: 'biweekly' },
      { title: 'Game night', desc: null, recurrence: 'weekly' },
    ],
    shoppingLists: [
      {
        name: 'Grocery Store',
        items: [
          { name: 'Milk', spec: '1L', checked: false },
          { name: 'Sourdough bread', spec: null, checked: false },
          { name: 'Eggs', spec: 'organic 10-pack', checked: false },
          { name: 'Cheddar cheese', spec: '200g', checked: false },
          { name: 'Bananas', spec: null, checked: false },
          { name: 'Chicken breast', spec: '500g', checked: false },
          { name: 'Olive oil', spec: null, checked: true },
          { name: 'Oat milk', spec: null, checked: true },
        ],
      },
      {
        name: 'Drugstore',
        items: [
          { name: 'Shampoo', spec: null, checked: false },
          { name: 'Toothpaste', spec: null, checked: false },
          { name: 'Sunscreen', spec: 'SPF 50', checked: false },
          { name: 'Tissues', spec: null, checked: true },
        ],
      },
    ],
    tasks: [
      { title: 'Grocery shopping', desc: 'Milk, bread, eggs, cheese, fruit' },
      { title: 'Take out trash', desc: null },
      { title: 'Get gift for Grandma', desc: 'Birthday in 2 weeks — book or scarf?' },
      { title: 'Schedule pediatrician', desc: 'Checkup for Lena' },
      { title: 'Pump up bikes', desc: null },
      { title: 'Water plants', desc: null },
      { title: 'Prepare tax return', desc: 'Sort receipts, check e-filing login' },
      { title: 'Build bookshelf', desc: 'IKEA Kallax, Max\'s room' },
      { title: 'Prepare for parent meeting', desc: 'Note questions about after-school clubs' },
      { title: 'Do laundry', desc: null },
    ],
  },
  de: {
    familyName: 'Familie Müller',
    events: [
      { title: 'Arzttermin Leon', desc: 'Kinderarzt Dr. Hoffmann' },
      { title: 'Elternabend Schule', desc: 'Grundschule am Park, Raum 204' },
      { title: 'Schwimmkurs Max', desc: null },
      { title: 'Familienbrunch bei Oma', desc: 'Kuchen mitbringen!' },
      { title: 'Zahnarzt Anna', desc: 'Kontrolle + Reinigung' },
      { title: 'Kindergeburtstag Lena', desc: '6 Kinder eingeladen, Deko vorbereiten' },
      { title: 'Handwerker (Bad)', desc: 'Fliesenleger kommt, jemand muss da sein' },
      { title: 'Musikschule Lena', desc: 'Blockflöte' },
      { title: 'Wocheneinkauf', desc: null },
      { title: 'Kino-Abend', desc: 'Familienfilm im CineStar' },
      { title: 'Laternenumzug Kita', desc: 'Treffpunkt am Haupteingang' },
      { title: 'Auto TÜV', desc: 'DEKRA Starnberger Str.' },
    ],
    recurringEvents: [
      { title: 'Klavierunterricht', desc: null, recurrence: 'weekly' },
      { title: 'Altpapier', desc: null, recurrence: 'biweekly' },
      { title: 'Spieleabend', desc: null, recurrence: 'weekly' },
    ],
    shoppingLists: [
      {
        name: 'Supermarkt',
        items: [
          { name: 'Milch', spec: '1L', checked: false },
          { name: 'Sauerteigbrot', spec: null, checked: false },
          { name: 'Eier', spec: 'Bio 10er', checked: false },
          { name: 'Gouda', spec: '200g', checked: false },
          { name: 'Bananen', spec: null, checked: false },
          { name: 'Hähnchenbrust', spec: '500g', checked: false },
          { name: 'Olivenöl', spec: null, checked: true },
          { name: 'Hafermilch', spec: null, checked: true },
        ],
      },
      {
        name: 'Drogerie',
        items: [
          { name: 'Shampoo', spec: null, checked: false },
          { name: 'Zahnpasta', spec: null, checked: false },
          { name: 'Sonnencreme', spec: 'LSF 50', checked: false },
          { name: 'Taschentücher', spec: null, checked: true },
        ],
      },
    ],
    tasks: [
      { title: 'Einkaufen', desc: 'Milch, Brot, Eier, Käse, Obst' },
      { title: 'Müll rausbringen', desc: null },
      { title: 'Geschenk für Oma besorgen', desc: 'Geburtstag in 2 Wochen — Buch oder Schal?' },
      { title: 'Kinderarzt-Termin vereinbaren', desc: 'U-Untersuchung für Lena' },
      { title: 'Fahrräder aufpumpen', desc: null },
      { title: 'Blumen gießen', desc: null },
      { title: 'Steuererklärung vorbereiten', desc: 'Belege sortieren, ELSTER-Login prüfen' },
      { title: 'Bücherregal aufbauen', desc: 'IKEA Kallax, Kinderzimmer Max' },
      { title: 'Elternabend vorbereiten', desc: 'Fragen zur AG-Wahl notieren' },
      { title: 'Wäsche waschen', desc: null },
    ],
  },
};

export function buildDemoData(lang = 'en') {
  _nextId = 100;
  const s = strings[lang] || strings.en;

  const me = {
    user_id: 1,
    email: 'demo@tribu.local',
    display_name: 'Dennis',
    profile_image: '',
  };

  const families = [
    { family_id: 1, family_name: s.familyName, role: 'owner' },
  ];

  const members = [
    { user_id: 1, display_name: 'Dennis', family_id: 1, is_adult: true, role: 'owner', color: '#7c3aed' },
    { user_id: 2, display_name: 'Anna', family_id: 1, is_adult: true, role: 'admin', color: '#f43f5e' },
    { user_id: 3, display_name: 'Max', family_id: 1, is_adult: false, role: 'member', color: '#06b6d4' },
    { user_id: 4, display_name: 'Lena', family_id: 1, is_adult: false, role: 'member', color: '#f59e0b' },
  ];

  const ev = s.events;
  const events = [
    { id: nextId(), family_id: 1, title: ev[0].title, starts_at: dateAt(0, 10, 30), ends_at: dateAt(0, 11, 0), all_day: false, description: ev[0].desc, is_recurring: false, occurrence_date: null, recurrence: null },
    { id: nextId(), family_id: 1, title: ev[1].title, starts_at: dateAt(1, 19, 0), ends_at: dateAt(1, 20, 30), all_day: false, description: ev[1].desc, is_recurring: false, occurrence_date: null, recurrence: null },
    { id: nextId(), family_id: 1, title: ev[2].title, starts_at: dateAt(2, 15, 0), ends_at: dateAt(2, 16, 0), all_day: false, description: ev[2].desc, is_recurring: false, occurrence_date: null, recurrence: null },
    { id: nextId(), family_id: 1, title: ev[3].title, starts_at: dateAt(3, 11, 0), ends_at: dateAt(3, 14, 0), all_day: false, description: ev[3].desc, is_recurring: false, occurrence_date: null, recurrence: null },
    { id: nextId(), family_id: 1, title: ev[4].title, starts_at: dateAt(5, 8, 30), ends_at: dateAt(5, 9, 15), all_day: false, description: ev[4].desc, is_recurring: false, occurrence_date: null, recurrence: null },
    { id: nextId(), family_id: 1, title: ev[5].title, starts_at: dateAt(7, 14, 0), ends_at: dateAt(7, 17, 0), all_day: false, description: ev[5].desc, is_recurring: false, occurrence_date: null, recurrence: null },
    { id: nextId(), family_id: 1, title: ev[6].title, starts_at: dateAt(4, 8, 0), ends_at: dateAt(4, 12, 0), all_day: false, description: ev[6].desc, is_recurring: false, occurrence_date: null, recurrence: null },
    { id: nextId(), family_id: 1, title: ev[7].title, starts_at: dateAt(1, 16, 0), ends_at: dateAt(1, 17, 0), all_day: false, description: ev[7].desc, is_recurring: false, occurrence_date: null, recurrence: null },
    { id: nextId(), family_id: 1, title: ev[8].title, starts_at: dateAt(2, 9, 0), ends_at: dateAt(2, 10, 30), all_day: false, description: ev[8].desc, is_recurring: false, occurrence_date: null, recurrence: null },
    { id: nextId(), family_id: 1, title: ev[9].title, starts_at: dateAt(6, 20, 0), ends_at: dateAt(6, 22, 30), all_day: false, description: ev[9].desc, is_recurring: false, occurrence_date: null, recurrence: null },
    { id: nextId(), family_id: 1, title: ev[10].title, starts_at: dateAt(10, 17, 0), ends_at: dateAt(10, 18, 30), all_day: false, description: ev[10].desc, is_recurring: false, occurrence_date: null, recurrence: null },
    { id: nextId(), family_id: 1, title: ev[11].title, starts_at: dateAt(12, 7, 30), ends_at: dateAt(12, 9, 0), all_day: false, description: ev[11].desc, is_recurring: false, occurrence_date: null, recurrence: null },
  ];

  // Expand recurring demo events for current month
  const rec = s.recurringEvents;
  const now = today();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  // Piano/Klavierunterricht: weekly, Mondays 16:00
  const pianoId = nextId();
  // Recycling/Altpapier: biweekly, Wednesdays 7:00
  const recyclingId = nextId();
  // Game night/Spieleabend: weekly, Fridays 19:30
  const gameId = nextId();

  const recurringDefs = [
    { id: pianoId, title: rec[0].title, desc: rec[0].desc, recurrence: rec[0].recurrence, dayOfWeek: 1, hour: 16, minute: 0, durationMin: 60 },
    { id: recyclingId, title: rec[1].title, desc: rec[1].desc, recurrence: rec[1].recurrence, dayOfWeek: 3, hour: 7, minute: 0, durationMin: 30 },
    { id: gameId, title: rec[2].title, desc: rec[2].desc, recurrence: rec[2].recurrence, dayOfWeek: 5, hour: 19, minute: 30, durationMin: 120 },
  ];

  for (const def of recurringDefs) {
    // Find first occurrence of the day in the month
    let d = new Date(monthStart);
    while (d.getDay() !== def.dayOfWeek) d.setDate(d.getDate() + 1);
    const stepDays = def.recurrence === 'biweekly' ? 14 : 7;
    while (d <= monthEnd) {
      const starts = new Date(d.getFullYear(), d.getMonth(), d.getDate(), def.hour, def.minute);
      const ends = new Date(starts.getTime() + def.durationMin * 60000);
      const occDate = starts.toISOString().slice(0, 10);
      events.push({
        id: def.id, family_id: 1, title: def.title, description: def.desc,
        starts_at: starts.toISOString(), ends_at: ends.toISOString(),
        all_day: false, is_recurring: true, occurrence_date: occDate,
        recurrence: def.recurrence,
      });
      d.setDate(d.getDate() + stepDays);
    }
  }

  const tk = s.tasks;
  const tasks = [
    { id: nextId(), family_id: 1, title: tk[0].title, description: tk[0].desc, status: 'open', priority: 'normal', due_date: dateAt(0, 18, 0), recurrence: 'weekly', assigned_to_user_id: 2, created_at: dateAt(-3), updated_at: dateAt(-3) },
    { id: nextId(), family_id: 1, title: tk[1].title, description: tk[1].desc, status: 'open', priority: 'high', due_date: dateAt(-1, 7, 0), recurrence: 'weekly', assigned_to_user_id: 3, created_at: dateAt(-5), updated_at: dateAt(-5) },
    { id: nextId(), family_id: 1, title: tk[2].title, description: tk[2].desc, status: 'open', priority: 'normal', due_date: dateAt(10), recurrence: null, assigned_to_user_id: 1, created_at: dateAt(-2), updated_at: dateAt(-2) },
    { id: nextId(), family_id: 1, title: tk[3].title, description: tk[3].desc, status: 'open', priority: 'high', due_date: dateAt(3), recurrence: null, assigned_to_user_id: 2, created_at: dateAt(-7), updated_at: dateAt(-7) },
    { id: nextId(), family_id: 1, title: tk[4].title, description: tk[4].desc, status: 'open', priority: 'low', due_date: dateAt(5), recurrence: null, assigned_to_user_id: 1, created_at: dateAt(-1), updated_at: dateAt(-1) },
    { id: nextId(), family_id: 1, title: tk[5].title, description: tk[5].desc, status: 'done', priority: 'low', due_date: null, recurrence: 'daily', assigned_to_user_id: 4, created_at: dateAt(-10), updated_at: dateAt(0) },
    { id: nextId(), family_id: 1, title: tk[6].title, description: tk[6].desc, status: 'open', priority: 'high', due_date: dateAt(14), recurrence: null, assigned_to_user_id: 1, created_at: dateAt(-4), updated_at: dateAt(-4) },
    { id: nextId(), family_id: 1, title: tk[7].title, description: tk[7].desc, status: 'done', priority: 'normal', due_date: dateAt(-3), recurrence: null, assigned_to_user_id: 1, created_at: dateAt(-8), updated_at: dateAt(-2) },
    { id: nextId(), family_id: 1, title: tk[8].title, description: tk[8].desc, status: 'open', priority: 'normal', due_date: dateAt(1, 18, 0), recurrence: null, assigned_to_user_id: 2, created_at: dateAt(-1), updated_at: dateAt(-1) },
    { id: nextId(), family_id: 1, title: tk[9].title, description: tk[9].desc, status: 'done', priority: 'low', due_date: null, recurrence: 'weekly', assigned_to_user_id: 2, created_at: dateAt(-6), updated_at: dateAt(-1) },
  ];

  const bd1 = birthdayIn(5, lang);
  const bd2 = birthdayIn(12, lang);
  const bd3 = birthdayIn(22, lang);

  const contacts = [
    { id: nextId(), family_id: 1, full_name: 'Helga Müller', email: 'helga@familie-mueller.de', phone: null, birthday_month: bd1.month, birthday_day: bd1.day },
    { id: nextId(), family_id: 1, full_name: 'Thomas Müller', email: null, phone: '+49 171 9876543', birthday_month: bd2.month, birthday_day: bd2.day },
    { id: nextId(), family_id: 1, full_name: 'Sophie Weber', email: 'sophie.w@gmail.com', phone: '+49 152 1234567', birthday_month: bd3.month, birthday_day: bd3.day },
    { id: nextId(), family_id: 1, full_name: 'Markus Fischer', email: 'markus.f@outlook.com', phone: null, birthday_month: 6, birthday_day: 14 },
    { id: nextId(), family_id: 1, full_name: 'Dr. Hoffmann', email: 'praxis@dr-hoffmann.de', phone: '+49 89 5554321', birthday_month: null, birthday_day: null },
    { id: nextId(), family_id: 1, full_name: 'Claudia Braun', email: null, phone: '+49 176 7778899', birthday_month: 3, birthday_day: 8 },
    { id: nextId(), family_id: 1, full_name: 'Peter Schneider', email: 'peter.schneider@web.de', phone: '+49 163 2223344', birthday_month: 11, birthday_day: 25 },
  ];

  const shoppingLists = s.shoppingLists.map((list) => {
    const listId = nextId();
    const items = list.items.map((item) => ({
      id: nextId(),
      list_id: listId,
      name: item.name,
      spec: item.spec,
      checked: item.checked,
      checked_at: item.checked ? dateAt(-1) : null,
      added_by_user_id: [1, 2][Math.floor(Math.random() * 2)],
      created_at: dateAt(-3),
    }));
    const itemCount = items.length;
    const checkedCount = items.filter((i) => i.checked).length;
    return {
      id: listId,
      family_id: 1,
      name: list.name,
      created_by_user_id: 1,
      created_at: dateAt(-7),
      item_count: itemCount,
      checked_count: checkedCount,
      items,
    };
  });

  const summary = {
    next_events: events.filter((e) => new Date(e.starts_at) >= today()).sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at)).slice(0, 5),
    upcoming_birthdays: [
      { person_name: 'Helga Müller', occurs_on: bd1.occurs_on, days_until: 5, month: bd1.month, day: bd1.day },
      { person_name: 'Thomas Müller', occurs_on: bd2.occurs_on, days_until: 12, month: bd2.month, day: bd2.day },
      { person_name: 'Sophie Weber', occurs_on: bd3.occurs_on, days_until: 22, month: bd3.month, day: bd3.day },
    ],
  };

  return { me, families, members, events, tasks, contacts, shoppingLists, summary };
}
