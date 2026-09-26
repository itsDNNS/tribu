// Pure helpers for the shared-home "stage" display. Everything here is
// deterministic so the layout can be unit tested without timers.

export const SIDE_CARDS = ['dinner', 'shopping', 'weather', 'reminders', 'school', 'soon', 'stars', 'birthdays'];
export const WIDE_CARDS = ['people', 'week'];
export const ZONES = ['a', 'b', 'c', 'd'];
export const ZONE_CARDS = { a: SIDE_CARDS, b: SIDE_CARDS, c: SIDE_CARDS, d: WIDE_CARDS };

const DEFAULT_LAYOUT = {
  zones: {
    a: { cards: ['dinner', 'shopping', 'weather'], interval_seconds: 60 },
    b: { cards: ['reminders', 'school'], interval_seconds: 60 },
    c: { cards: ['soon', 'stars'], interval_seconds: 60 },
    d: { cards: ['people', 'week'], interval_seconds: 60 },
  },
  stagger: true,
  skip_empty: true,
  pause_on_touch: true,
  night_dim: true,
  day_parts: { morning_start: '05:30', morning_end: '09:00', evening_start: '18:00', night_start: '22:00' },
  eink_format: 'compact',
  language: 'auto',
};

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

function clamp(value, min, max, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
}

// Mirrors backend/app/core/display_layouts.py so a stale or partial config never breaks the wall.
export function normalizeStageConfig(config) {
  const mode = config?.display_mode === 'eink' ? 'eink' : 'tablet';
  const source = config?.layout_config?.version === 2 ? config.layout_config : {};
  const zones = {};
  for (const zone of ZONES) {
    const fallback = DEFAULT_LAYOUT.zones[zone];
    const raw = source.zones?.[zone];
    const cards = Array.isArray(raw?.cards)
      ? [...new Set(raw.cards.filter((card) => ZONE_CARDS[zone].includes(card)))].slice(0, 6)
      : [];
    zones[zone] = {
      cards: cards.length ? cards : fallback.cards,
      interval_seconds: clamp(raw?.interval_seconds, 15, 600, fallback.interval_seconds),
    };
  }
  const dayParts = { ...DEFAULT_LAYOUT.day_parts };
  for (const key of Object.keys(dayParts)) {
    if (TIME_RE.test(source.day_parts?.[key] || '')) dayParts[key] = source.day_parts[key];
  }
  const flag = (key) => (typeof source[key] === 'boolean' ? source[key] : DEFAULT_LAYOUT[key]);
  return {
    mode,
    refreshSeconds: clamp(config?.refresh_interval_seconds, mode === 'eink' ? 300 : 30, 86400, mode === 'eink' ? 600 : 60),
    zones,
    stagger: flag('stagger'),
    skipEmpty: flag('skip_empty'),
    pauseOnTouch: flag('pause_on_touch'),
    nightDim: flag('night_dim'),
    dayParts,
    einkFormat: source.eink_format === 'large' ? 'large' : 'compact',
    language: typeof source.language === 'string' ? source.language : 'auto',
  };
}

export function resolveLanguage(configured, preferred = [], supported = []) {
  const available = new Set(supported);
  const candidates = configured && configured !== 'auto' ? [configured] : preferred;
  for (const candidate of candidates) {
    const code = String(candidate || '').toLowerCase().split('-')[0];
    if (available.has(code)) return code;
  }
  return 'en';
}

// Backend timestamps are naive local wall-clock strings.
export function parseLocal(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  const date = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(value) ? value : String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function minutesOf(hhmm) {
  const match = TIME_RE.exec(hhmm || '');
  return match ? Number(match[1]) * 60 + Number(match[2]) : 0;
}

export function dayPart(now, dayParts) {
  const minute = now.getHours() * 60 + now.getMinutes();
  const morningStart = minutesOf(dayParts.morning_start);
  const morningEnd = minutesOf(dayParts.morning_end);
  const eveningStart = minutesOf(dayParts.evening_start);
  const nightStart = minutesOf(dayParts.night_start);
  const within = (from, to) => (from <= to ? minute >= from && minute < to : minute >= from || minute < to);
  if (within(nightStart, morningStart)) return 'night';
  if (within(morningStart, morningEnd)) return 'morning';
  if (within(eveningStart, nightStart)) return 'evening';
  return 'day';
}

export const looksAhead = (part) => part === 'evening' || part === 'night';

export function sameDay(a, b) {
  return a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function eventKey(event) {
  return `${event.title}|${event.starts_at}`;
}

function eventEnd(event, start) {
  return parseLocal(event.ends_at) || new Date(start.getTime() + 60 * 60 * 1000);
}

// The hero shows the first timed event that has not ended yet; "live" when it already started.
export function upcomingEvents(dashboard, now) {
  const seen = new Set();
  const all = [];
  for (const event of [...(dashboard.today_events || []), ...(dashboard.tomorrow_events || []), ...(dashboard.next_events || [])]) {
    if (event.all_day || seen.has(eventKey(event))) continue;
    const start = parseLocal(event.starts_at);
    if (!start) continue;
    seen.add(eventKey(event));
    const end = eventEnd(event, start);
    if (end <= now) continue;
    all.push({ ...event, start, end, live: start <= now });
  }
  all.sort((a, b) => a.start - b.start);
  return all;
}

// Lanes (one per member, plus "everyone") for a single day, positioned in percent of the visible hours.
export function timeline(events, now, { day = now, showNow = true } = {}) {
  const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  const minutesIntoDay = (date) => Math.min(24 * 60, Math.max(0, (date - dayStart) / 60000));
  const timed = [];
  const allDay = [];
  for (const event of events || []) {
    if (event.all_day) {
      allDay.push(event);
      continue;
    }
    const start = parseLocal(event.starts_at);
    if (start) timed.push({ ...event, start, end: eventEnd(event, start) });
  }
  let startHour = 6;
  let endHour = 22;
  for (const event of timed) {
    startHour = Math.min(startHour, Math.floor(minutesIntoDay(event.start) / 60));
    endHour = Math.max(endHour, Math.ceil(minutesIntoDay(event.end) / 60));
  }
  const span = (endHour - startHour) * 60 || 60;
  const pct = (date) => Math.min(100, Math.max(0, ((minutesIntoDay(date) - startHour * 60) / span) * 100));
  const lanes = new Map();
  for (const event of timed) {
    const refs = event.member_refs?.length ? event.member_refs : [null];
    for (const ref of refs) {
      const key = ref === null ? 'all' : String(ref);
      if (!lanes.has(key)) lanes.set(key, { ref, blocks: [] });
      const left = pct(event.start);
      lanes.get(key).blocks.push({ ...event, left, width: Math.max(1.5, pct(event.end) - left) });
    }
  }
  const ordered = [...lanes.values()].sort((a, b) => (a.ref === null) - (b.ref === null) || (a.ref ?? 0) - (b.ref ?? 0));
  return {
    startHour,
    endHour,
    lanes: ordered,
    allDay,
    nowPct: showNow && sameDay(dayStart, now) ? pct(now) : null,
  };
}

export function mealsFor(dashboard, day) {
  const iso = isoDate(day);
  return (dashboard.meals || []).filter((meal) => meal.plan_date === iso);
}

export function isoDate(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function soonItems(dashboard) {
  const items = [
    ...(dashboard.countdowns || []).map((item) => ({ kind: 'event', title: item.title, days: item.days_until, date: item.starts_on })),
    ...(dashboard.upcoming_birthdays || []).map((item) => ({ kind: 'birthday', title: item.person_name, days: item.days_until, date: item.occurs_on })),
  ];
  return items.sort((a, b) => a.days - b.days);
}

// Whether a card has something useful to show; empty cards are skipped in the rotation.
export function cardHasContent(card, dashboard, { ahead = false, now = new Date() } = {}) {
  switch (card) {
    case 'dinner':
      return mealsFor(dashboard, ahead ? addDays(now, 1) : now).length > 0;
    case 'shopping':
      return (dashboard.shopping?.open_count || 0) > 0;
    case 'weather':
      return Boolean(dashboard.weather);
    case 'reminders':
      return (dashboard.due_tasks || []).length > 0 || (ahead && (dashboard.routines || []).some((routine) => !routine.done));
    case 'school':
      return ((ahead ? dashboard.tomorrow_school_timetables : dashboard.today_school_timetables) || []).length > 0;
    case 'soon':
      return soonItems(dashboard).length > 0;
    case 'stars':
      return (dashboard.rewards?.members || []).length > 0;
    case 'birthdays':
      return (dashboard.upcoming_birthdays || []).length > 0;
    case 'people':
      return (dashboard.members || []).length > 0;
    case 'week':
      return true;
    default:
      return false;
  }
}

export function rotatingCards(cards, dashboard, { skipEmpty, ahead, now }) {
  if (!skipEmpty) return cards;
  const filled = cards.filter((card) => cardHasContent(card, dashboard, { ahead, now }));
  // Keep the first card so a zone never disappears; it renders its own calm empty state.
  return filled.length ? filled : cards.slice(0, 1);
}

// WMO weather interpretation codes → icon and label key.
export function weatherKind(code) {
  if (code === 0) return 'clear';
  if (code === 1 || code === 2) return 'partly';
  if (code === 3) return 'cloudy';
  if (code === 45 || code === 48) return 'fog';
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if (code >= 95) return 'storm';
  return 'cloudy';
}

export function formatClock(date, locale, timeFormat) {
  return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', hour12: timeFormat === '12h' }).format(date);
}

export function initials(name) {
  return String(name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const FALLBACK_COLORS = ['#5b93c7', '#6f9a72', '#c26f80', '#c9953d', '#8b5e9f', '#4f9a9a'];

export function memberColor(member, index) {
  return HEX.test(member?.color || '') ? member.color : FALLBACK_COLORS[index % FALLBACK_COLORS.length];
}
