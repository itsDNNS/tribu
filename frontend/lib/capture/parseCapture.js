// Reads what a family member types into the capture field ("Morgen 15 Uhr
// Zahnarzt Max", "2 kg Äpfel", "Müll rausbringen jeden Dienstag") and
// suggests what to create. Rule based and on the device, in German and
// English (docs/tribu-2-design.md). The Flutter app has the same rules in
// lib/features/capture/capture_parser.dart and checks them against the
// shared cases in lib/capture/captureCases.json.

const L = '\\p{L}\\p{N}';
const START = `(?<![${L}])`;
const END = `(?![${L}])`;

const WEEKDAYS = [
  // [JS day index, words]
  [1, ['montag', 'monday', 'mon', 'mo\\.']],
  [2, ['dienstag', 'tuesday', 'tues', 'tue', 'di\\.']],
  [3, ['mittwoch', 'wednesday', 'wed', 'mi\\.']],
  [4, ['donnerstag', 'thursday', 'thurs', 'thu', 'do\\.']],
  [5, ['freitag', 'friday', 'fri', 'fr\\.']],
  [6, ['samstag', 'saturday', 'sat', 'sa\\.']],
  [0, ['sonntag', 'sunday', 'sun', 'so\\.']],
];

// Words that only join the recognised parts to the rest of the sentence.
const LINKS = ['am', 'um', 'ab', 'bis', 'für', 'fuer', 'von', 'den', 'nächsten', 'naechsten', 'kommenden', 'on', 'at', 'for', 'by', 'until', 'next', 'this', 'the'];

const QUANTITY = /^(\d+\/\d+|\d+(?:[.,]\d+)?|½|¼|¾)\s*(x|×|kg|g|ml|l|liter|gramm|kilogramm|milliliter|stück|stk\.?|st\.?|packungen?|dosen?|flaschen?|tuben?|el|tl|gläser|glas|tafeln?|bund|pcs|pack|packs|bottles?|cans?)?\s+(.+)$/iu;

function pad(value) {
  return String(value).padStart(2, '0');
}

function isoDate(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function addDays(date, days) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function nextWeekday(today, day) {
  const ahead = (day - today.getDay() + 7) % 7 || 7;
  return addDays(today, ahead);
}

function words(list) {
  return list.join('|');
}

function firstName(member) {
  return String(member.display_name || '').trim().split(/\s+/)[0] || '';
}

function escape(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Finds the first match of `pattern` in `state.rest`, blanks it out and
// hands the match to `use`.
function take(state, pattern, use) {
  const match = pattern.exec(state.rest);
  if (!match) return false;
  if (use(match) === false) return false;
  state.rest = state.rest.slice(0, match.index) + ' '.repeat(match[0].length) + state.rest.slice(match.index + match[0].length);
  return true;
}

function toHour(hour, minute, meridiem) {
  let h = Number(hour);
  const m = Number(minute || 0);
  if (meridiem) {
    const pm = /p/i.test(meridiem);
    if (h === 12) h = pm ? 12 : 0;
    else if (pm) h += 12;
  }
  if (h > 23 || m > 59) return null;
  return `${pad(h)}:${pad(m)}`;
}

function plusHour(time) {
  const [h, m] = time.split(':').map(Number);
  return h >= 23 ? '23:59' : `${pad(h + 1)}:${pad(m)}`;
}

function cleanTitle(text) {
  let title = text.replace(/\s+/g, ' ').trim();
  const link = new RegExp(`^(?:${words(LINKS)})${END}\\s*|\\s*${START}(?:${words(LINKS)})$`, 'iu');
  let previous;
  do {
    previous = title;
    title = title.replace(link, '').replace(/^[\s,.;:–-]+|[\s,;:–-]+$/gu, '').trim();
  } while (title !== previous);
  return title ? title[0].toLocaleUpperCase() + title.slice(1) : '';
}

function parseLine(line, options) {
  const now = options.now || new Date();
  const today = startOfDay(now);
  const firstWeekday = options.firstWeekday ?? 1;
  const state = { rest: ` ${line} ` };
  const found = { date: null, dateOnly: true, time: null, endTime: null, recurrence: null, assignees: [] };
  const setDate = (date) => {
    if (!found.date) found.date = isoDate(date);
  };

  // Repetition, with a weekday ("jeden Dienstag") or on its own.
  for (const [day, list] of WEEKDAYS) {
    take(state, new RegExp(`${START}(?:jeden|jede|every)\\s+(?:${words(list)})${END}`, 'iu'), () => {
      found.recurrence = 'weekly';
      setDate(nextWeekday(today, day));
    });
  }
  const repeats = [
    ['daily', 'jeden\\s+tag|täglich|taeglich|every\\s+day|daily'],
    ['weekly', 'jede\\s+woche|wöchentlich|woechentlich|every\\s+week|weekly'],
    ['monthly', 'jeden\\s+monat|monatlich|every\\s+month|monthly'],
    ['yearly', 'jedes\\s+jahr|jährlich|jaehrlich|every\\s+year|yearly|annually'],
  ];
  for (const [value, pattern] of repeats) {
    take(state, new RegExp(`${START}(?:${pattern})${END}`, 'iu'), () => {
      found.recurrence = found.recurrence || value;
    });
  }

  // Dates written out: 12.10., 12.10.2026, 2026-10-12, and 10/12 in English.
  take(state, new RegExp(`${START}(\\d{4})-(\\d{2})-(\\d{2})${END}`, 'u'), (m) => {
    setDate(new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  });
  take(state, new RegExp(`${START}(\\d{1,2})\\.(\\d{1,2})\\.(\\d{2,4})?(?![\\p{N}])`, 'u'), (m) => {
    const day = Number(m[1]);
    const month = Number(m[2]);
    if (day < 1 || day > 31 || month < 1 || month > 12) return false;
    let year = m[3] ? Number(m[3].length === 2 ? `20${m[3]}` : m[3]) : today.getFullYear();
    let date = new Date(year, month - 1, day);
    if (!m[3] && date < today) date = new Date(year + 1, month - 1, day);
    setDate(date);
  });
  if (options.lang !== 'de') {
    take(state, new RegExp(`${START}(\\d{1,2})/(\\d{1,2})(?:/(\\d{2,4}))?${END}`, 'u'), (m) => {
      const month = Number(m[1]);
      const day = Number(m[2]);
      if (day < 1 || day > 31 || month < 1 || month > 12) return false;
      const year = m[3] ? Number(m[3].length === 2 ? `20${m[3]}` : m[3]) : today.getFullYear();
      let date = new Date(year, month - 1, day);
      if (!m[3] && date < today) date = new Date(year + 1, month - 1, day);
      setDate(date);
    });
  }

  // Days in words.
  const relative = [
    ['übermorgen|uebermorgen|day\\s+after\\s+tomorrow', 2],
    ['heute\\s+abend|tonight', 0],
    ['heute|today', 0],
    ['morgen|tomorrow', 1],
  ];
  for (const [pattern, days] of relative) {
    take(state, new RegExp(`${START}(?:${pattern})${END}`, 'iu'), () => setDate(addDays(today, days)));
  }
  take(state, new RegExp(`${START}in\\s+(\\d{1,3}|einer|einem|a|one)\\s+(tagen?|days?|wochen?|weeks?)${END}`, 'iu'), (m) => {
    const count = Number(m[1]) || 1;
    setDate(addDays(today, /^w/i.test(m[2]) ? count * 7 : count));
  });
  take(state, new RegExp(`${START}(?:nächste|naechste|kommende)\\s+woche${END}|${START}next\\s+week${END}`, 'iu'), () => {
    const offset = (7 - ((today.getDay() - firstWeekday + 7) % 7)) % 7 || 7;
    setDate(addDays(today, offset));
  });
  for (const [day, list] of WEEKDAYS) {
    take(state, new RegExp(`${START}(?:${words(list)})${END}`, 'iu'), () => setDate(nextWeekday(today, day)));
  }

  // Times: 15-16 Uhr, 15:00–16:30, von 15 bis 16 Uhr, 15 Uhr, um 15:30, 3pm, at 3.
  take(state, new RegExp(`${START}(?:von\\s+|from\\s+)?(\\d{1,2})(?:[:.](\\d{2}))?\\s*(am|pm)?\\s*(?:-|–|bis|to|until)\\s*(\\d{1,2})(?:[:.](\\d{2}))?\\s*(uhr|h|am|pm)?${END}`, 'iu'), (m) => {
    const hasClock = m[2] || m[5] || m[6] || m[3];
    if (!hasClock) return false;
    const meridiem = m[3] || (/[ap]m/i.test(m[6] || '') ? m[6] : '');
    const start = toHour(m[1], m[2], meridiem);
    const end = toHour(m[4], m[5], /[ap]m/i.test(m[6] || '') ? m[6] : meridiem);
    if (!start || !end) return false;
    found.time = start;
    found.endTime = end;
  });
  if (!found.time) {
    take(state, new RegExp(`${START}(?:um\\s+|at\\s+|gegen\\s+)?(\\d{1,2})(?:[:.](\\d{2}))?\\s*(uhr|h)${END}`, 'iu'), (m) => {
      found.time = toHour(m[1], m[2]);
      return found.time !== null;
    });
  }
  if (!found.time) {
    take(state, new RegExp(`${START}(?:at\\s+)?(\\d{1,2})(?::(\\d{2}))?\\s*(am|pm|a\\.m\\.|p\\.m\\.)${END}`, 'iu'), (m) => {
      found.time = toHour(m[1], m[2], m[3]);
      return found.time !== null;
    });
  }
  if (!found.time) {
    take(state, new RegExp(`${START}(?:um|at)\\s+(\\d{1,2})(?:[:.](\\d{2}))?${END}`, 'iu'), (m) => {
      let hour = Number(m[1]);
      if (options.lang !== 'de' && hour >= 1 && hour <= 7) hour += 12;
      found.time = toHour(hour, m[2]);
      return found.time !== null;
    });
  }
  if (!found.time) {
    take(state, new RegExp(`${START}(\\d{1,2}):(\\d{2})${END}`, 'u'), (m) => {
      found.time = toHour(m[1], m[2]);
      return found.time !== null;
    });
  }
  if (!found.time) {
    take(state, new RegExp(`${START}(?:mittags|noon|midday)${END}`, 'iu'), () => { found.time = '12:00'; });
  }

  // People: family first names, with or without "für"/"for".
  for (const member of options.members || []) {
    const name = firstName(member);
    if (!name) continue;
    take(state, new RegExp(`${START}(?:für\\s+|fuer\\s+|for\\s+|mit\\s+|with\\s+)?${escape(name)}(?:s)?${END}`, 'iu'), () => {
      if (!found.assignees.includes(member.user_id)) found.assignees.push(member.user_id);
    });
  }

  let title = cleanTitle(state.rest);
  let spec = null;
  const quantity = QUANTITY.exec(title);
  if (quantity) {
    const unit = (quantity[2] || '').toLowerCase();
    spec = unit === 'x' || unit === '×' || !unit ? quantity[1] : `${quantity[1]} ${quantity[2]}`;
    title = cleanTitle(quantity[3]);
  }
  const product = !quantity && Boolean(options.isProduct?.(title));

  let kind;
  if (found.time) kind = 'event';
  else if ((spec || product) && !found.date && !found.recurrence && !found.assignees.length) kind = 'shopping';
  else if (found.date || found.recurrence || found.assignees.length) kind = 'task';
  else kind = options.defaultKind || 'task';

  if (found.time && !found.date) found.date = isoDate(today);
  if (found.time) {
    found.dateOnly = false;
    if (!found.endTime) found.endTime = plusHour(found.time);
  }

  return {
    kind,
    title,
    date: found.date,
    time: found.time,
    endTime: found.endTime,
    dateOnly: found.dateOnly,
    assignees: found.assignees,
    recurrence: found.recurrence,
    spec,
    text: line.trim(),
  };
}

// Several lines, or a comma list of products, become several entries.
export function parseCapture(text, options = {}) {
  const lines = String(text || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const entries = [];
  for (const line of lines) {
    const parts = line.split(/\s*,\s*/).filter(Boolean);
    const productList = parts.length > 1 && parts.every((part) => {
      const parsed = parseLine(part, options);
      return parsed.kind === 'shopping';
    });
    for (const part of productList ? parts : [line]) {
      const entry = parseLine(part, options);
      if (entry.title) entries.push(entry);
    }
  }
  return entries;
}
