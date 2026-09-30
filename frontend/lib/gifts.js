// Gifts around people and occasions. Ideas are plans for someone that stay
// hidden from them; wishes are what someone wishes for. The server decides
// who sees what; these helpers shape it for the screen (and play the server
// in the demo).

export const GIFT_STATUSES = ['idea', 'ordered', 'purchased', 'gifted'];
export const GIFT_OCCASIONS = ['birthday', 'christmas', 'easter', 'other'];
export const GIFT_KINDS = ['idea', 'wish'];
const UNDER_WAY = ['ordered', 'purchased', 'gifted'];
const HOLIDAYS = ['christmas', 'easter'];

export function priceToCents(value) {
  if (value === '' || value === null || value === undefined) return null;
  const num = Number(String(value).replace(',', '.'));
  if (!Number.isFinite(num) || num < 0) return null;
  return Math.round(num * 100);
}

export function centsToInput(cents) {
  return cents == null ? '' : (cents / 100).toFixed(2);
}

export function formatPrice(cents, currency = 'EUR', locale) {
  if (cents == null) return '';
  const whole = cents % 100 === 0;
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency', currency: currency || 'EUR', minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2,
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency || 'EUR'}`;
  }
}

function pad(value) {
  return String(value).padStart(2, '0');
}

export function isoDate(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function parseIsoDate(value) {
  if (!value) return null;
  const [year, month, day] = String(value).slice(0, 10).split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function startOfToday(now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export function daysBetween(from, to) {
  return Math.round((to.getTime() - from.getTime()) / 86400000);
}

/** The next birthday on or after today; 29 February is the 28th in common years. */
export function nextBirthday(month, day, today) {
  const on = (year) => new Date(year, month - 1, Math.min(day, new Date(year, month, 0).getDate()));
  const candidate = on(today.getFullYear());
  return candidate >= today ? candidate : on(today.getFullYear() + 1);
}

/** Easter Sunday (Western), anonymous Gregorian algorithm. */
export function easterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

export function nextHoliday(occasion, today) {
  const on = (year) => (occasion === 'christmas' ? new Date(year, 11, 24) : easterSunday(year));
  const candidate = on(today.getFullYear());
  return candidate >= today ? candidate : on(today.getFullYear() + 1);
}

function fold(name) {
  return String(name || '').trim().split(/\s+/).join(' ').toLocaleLowerCase();
}

/**
 * Who gifts are for: contacts that are family members, and names that are a
 * contact or a member ("Opa Karl" typed by hand is the contact).
 */
export function recipientLinks(contacts = [], members = []) {
  const contactMembers = new Map();
  const targets = new Map();
  const add = (name, key) => {
    const folded = fold(name);
    if (!folded) return;
    if (!targets.has(folded)) targets.set(folded, new Set());
    targets.get(folded).add(key);
  };
  for (const contact of contacts) {
    if (contact?.member_user_id) contactMembers.set(contact.id, contact.member_user_id);
    add(contact?.full_name, contact?.member_user_id ? `u:${contact.member_user_id}` : `c:${contact?.id}`);
  }
  for (const member of members) add(member?.display_name, `u:${member?.user_id}`);
  const names = new Map();
  for (const [name, keys] of targets) if (keys.size === 1) names.set(name, [...keys][0]);
  return { contactMembers, names };
}

const NO_LINKS = { contactMembers: new Map(), names: new Map() };

export function recipientMember(gift, links = NO_LINKS) {
  if (gift.for_user_id != null) return gift.for_user_id;
  if (gift.for_contact_id != null) return links.contactMembers.get(gift.for_contact_id) ?? null;
  const target = gift.for_person_name ? links.names.get(fold(gift.for_person_name)) : null;
  return target?.startsWith('u:') ? Number(target.slice(2)) : null;
}

/** "u:<member>", "c:<contact>", "n:<name>", or null for no recipient. */
export function recipientKey(gift, links = NO_LINKS) {
  const member = recipientMember(gift, links);
  if (member != null) return `u:${member}`;
  if (gift.for_contact_id != null) return `c:${gift.for_contact_id}`;
  if (gift.for_person_name) {
    const name = fold(gift.for_person_name);
    return links.names.get(name) || `n:${name}`;
  }
  return null;
}

export function birthdayKey(birthday, links = NO_LINKS) {
  const member = birthday.member_user_id ?? (birthday.contact_id != null ? links.contactMembers.get(birthday.contact_id) : null) ?? null;
  if (member != null) return { key: `u:${member}`, member };
  if (birthday.contact_id != null) return { key: `c:${birthday.contact_id}`, member: null };
  const name = fold(birthday.person_name);
  const key = links.names.get(name) || `n:${name}`;
  return { key, member: key.startsWith('u:') ? Number(key.slice(2)) : null };
}

/** What the caller's own view of a gift looks like, as the server hands it out. */
export function viewFor(gift, meId, isAdult, links = NO_LINKS) {
  const forMe = recipientMember(gift, links) === meId;
  if (forMe && gift.kind !== 'wish') return null;
  if (!forMe && !isAdult && gift.kind !== 'wish' && ![gift.created_by_user_id, gift.claimed_by_user_id].includes(meId)) return null;
  const view = { ...gift, for_me: forMe };
  if (forMe && gift.status !== 'gifted') {
    Object.assign(view, { status: 'idea', claimed_by_user_id: null, claimed_at: null, notes: null, gifted_at: null });
  } else if (forMe || (!isAdult && ![gift.created_by_user_id, gift.claimed_by_user_id].includes(meId))) {
    view.notes = null;
  }
  return view;
}

export function isUnderWay(gift) {
  return gift.claimed_by_user_id != null || UNDER_WAY.includes(gift.status);
}

/**
 * Coming occasions with their gifts, the same way the server builds them
 * (the demo has no server).
 */
export function buildOccasions({ gifts = [], birthdays = [], contacts = [], members = [], budgets = {}, meId, isAdult, today, days = 120 }) {
  const links = recipientLinks(contacts, members);
  const until = new Date(today);
  until.setDate(until.getDate() + days);
  const instances = new Map();
  const instance = (occasion, on, key, extra = {}) => {
    const id = `${occasion}:${isoDate(on)}:${key}`;
    if (!instances.has(id)) {
      instances.set(id, {
        key: id, occasion, date: isoDate(on), days_until: daysBetween(today, on), recipient_key: key,
        for_user_id: null, for_contact_id: null, person_name: null, turns: null, for_me: false,
        gift_ids: [], gift_count: 0, claimed_count: 0, purchased_count: 0, wish_count: 0,
        budget_cents: null, spent_cents: null, ...extra,
      });
    }
    return instances.get(id);
  };
  const extraFor = (gift) => {
    const key = recipientKey(gift, links) || '';
    if (key.startsWith('u:')) return { for_user_id: Number(key.slice(2)), for_me: Number(key.slice(2)) === meId };
    if (key.startsWith('c:')) return { for_contact_id: Number(key.slice(2)), person_name: gift.for_person_name || null };
    return { person_name: gift.for_person_name || null };
  };

  for (const birthday of birthdays) {
    const on = nextBirthday(birthday.month, birthday.day, today);
    if (on > until) continue;
    const { key, member } = birthdayKey(birthday, links);
    instance('birthday', on, key, {
      person_name: birthday.person_name,
      turns: birthday.year ? on.getFullYear() - birthday.year : null,
      for_me: member === meId,
      for_user_id: member,
      for_contact_id: member == null ? birthday.contact_id ?? null : null,
    });
  }
  const christmas = nextHoliday('christmas', today);
  if (christmas <= until) instance('christmas', christmas, 'family');

  const visible = gifts.map((gift) => viewFor(gift, meId, isAdult, links)).filter(Boolean);
  for (const gift of visible) {
    const occasion = (gift.occasion || '').trim();
    if (!occasion) continue;
    const key = recipientKey(gift, links);
    const date = parseIsoDate(gift.occasion_date);
    let target;
    if (HOLIDAYS.includes(occasion)) {
      const on = nextHoliday(occasion, today);
      if (on > until || (date && date.getFullYear() !== on.getFullYear())) continue;
      if (!date && gift.status === 'gifted') continue;
      target = instance(occasion, on, 'family');
    } else if (occasion === 'birthday' && key) {
      const match = [...instances.values()].find((item) => item.occasion === 'birthday' && item.recipient_key === key);
      if (!match) {
        if (!date || date < today || date > until) continue;
        target = instance('birthday', date, key, extraFor(gift));
      } else if ((date && isoDate(date) !== match.date) || (!date && gift.status === 'gifted')) {
        continue;
      } else {
        target = match;
      }
    } else {
      if (!date || date < today || date > until) continue;
      target = instance(occasion, date, key || 'family', extraFor(gift));
    }
    if (target.recipient_key !== 'family' && gift.for_me && gift.kind !== 'wish') continue;
    target.gift_ids.push(gift.id);
    target.gift_count += 1;
    if (isUnderWay(gift)) {
      target.claimed_count += 1;
      if (gift.current_price_cents != null && !gift.for_me) target.spent_cents = (target.spent_cents || 0) + gift.current_price_cents;
    }
    if (gift.status === 'purchased' || gift.status === 'gifted') target.purchased_count += 1;
  }

  const openWishes = new Map();
  for (const gift of visible) {
    if (gift.kind !== 'wish' || gift.status === 'gifted') continue;
    if (gift.claimed_by_user_id != null && !gift.for_me) continue;
    const key = recipientKey(gift, links);
    if (key) openWishes.set(key, (openWishes.get(key) || 0) + 1);
  }

  const items = [];
  for (const item of instances.values()) {
    if (item.recipient_key !== 'family') item.wish_count = openWishes.get(item.recipient_key) || 0;
    if (item.occasion === 'easter' && item.gift_ids.length === 0) continue;
    if (isAdult && !item.for_me) {
      item.budget_cents = budgets[`${item.occasion}:${item.date}:${item.recipient_key}`] ?? null;
    } else {
      item.spent_cents = null;
    }
    items.push(item);
  }
  items.sort((a, b) => a.date.localeCompare(b.date) || a.occasion.localeCompare(b.occasion)
    || String(a.person_name || '').localeCompare(String(b.person_name || '')));
  return items;
}

/**
 * Everyone gifts go to: members (without me), then contacts and names that
 * have gifts, each with their next birthday and what is planned.
 */
export function buildPeople({ gifts = [], members = [], birthdays = [], contacts = [], meId, today }) {
  const links = recipientLinks(contacts, members);
  const people = new Map();
  const person = (key, base) => {
    if (!people.has(key)) {
      people.set(key, { key, name: '', member: null, contactId: null, nextBirthday: null, ideas: [], wishes: [], gifted: [], ...base });
    }
    return people.get(key);
  };
  for (const member of members) {
    if (member.user_id === meId) continue;
    person(`u:${member.user_id}`, { name: member.display_name, member });
  }
  for (const birthday of birthdays) {
    const { key } = birthdayKey(birthday, links);
    const existing = people.get(key);
    const on = nextBirthday(birthday.month, birthday.day, today);
    if (existing) {
      if (!existing.nextBirthday || on < existing.nextBirthday) existing.nextBirthday = on;
    }
  }
  const contactsById = new Map(contacts.map((contact) => [contact.id, contact]));
  for (const gift of gifts) {
    if (gift.for_me) continue;
    const key = recipientKey(gift, links) || 'none';
    let entry = people.get(key);
    if (!entry) {
      if (key.startsWith('u:')) continue;
      const contactId = key.startsWith('c:') ? Number(key.slice(2)) : null;
      const contact = contactId != null ? contactsById.get(contactId) : null;
      entry = person(key, {
        name: key === 'none' ? '' : contact?.full_name || gift.for_person_name || '',
        contactId,
      });
      const birthday = birthdays.find((item) => birthdayKey(item, links).key === key);
      if (birthday) entry.nextBirthday = nextBirthday(birthday.month, birthday.day, today);
    }
    if (gift.status === 'gifted') entry.gifted.push(gift);
    else if (gift.kind === 'wish') entry.wishes.push(gift);
    else entry.ideas.push(gift);
  }
  const list = [...people.values()];
  const rank = (entry) => (entry.key === 'none' ? 2 : entry.member ? 0 : 1);
  return list.sort((a, b) => rank(a) - rank(b) || (a.member && b.member ? 0 : a.name.localeCompare(b.name)));
}

/** "open", "mine", "other" or "hidden" (the recipient never sees it). */
export function claimState(gift, meId) {
  if (gift.for_me) return 'hidden';
  if (gift.claimed_by_user_id == null && !UNDER_WAY.includes(gift.status)) return 'open';
  if (gift.claimed_by_user_id === meId) return 'mine';
  // Bought before anyone said who: on its way all the same.
  return 'other';
}

export function canEditGift(gift, meId, isAdult) {
  if (gift.for_me) return true;
  return isAdult || gift.created_by_user_id === meId;
}

export function canDeleteGift(gift, meId, isAdult) {
  if (gift.for_me) return gift.created_by_user_id === meId;
  return isAdult || gift.created_by_user_id === meId;
}

export function canSetStatus(gift, meId, isAdult) {
  if (gift.for_me) return false;
  return isAdult || [gift.created_by_user_id, gift.claimed_by_user_id].includes(meId);
}

/** Open occasions first: nothing planned soon is what needs attention. */
export function needsAttention(occasion) {
  return !occasion.for_me && occasion.recipient_key !== 'family' && occasion.claimed_count === 0 && occasion.days_until <= 14;
}

export function createEmptyGiftForm(overrides = {}) {
  return {
    kind: 'idea',
    title: '',
    description: '',
    url: '',
    image: null,
    site: '',
    recipient: '',
    for_person_name: '',
    occasion: '',
    occasion_label: '',
    occasion_date: '',
    notes: '',
    price: '',
    currency: 'EUR',
    ...overrides,
  };
}

/** The form for an existing gift. `recipient` is "u:<id>", "c:<id>", "name" or "". */
export function formFromGift(gift) {
  const known = GIFT_OCCASIONS.includes(gift.occasion || '');
  let recipient = '';
  if (gift.for_user_id != null) recipient = `u:${gift.for_user_id}`;
  else if (gift.for_contact_id != null) recipient = `c:${gift.for_contact_id}`;
  else if (gift.for_person_name) recipient = 'name';
  return createEmptyGiftForm({
    kind: gift.kind || 'idea',
    title: gift.title || '',
    description: gift.description || '',
    url: gift.url || '',
    image: gift.image || null,
    recipient,
    for_person_name: gift.for_person_name || '',
    occasion: gift.occasion ? (known ? gift.occasion : 'other') : '',
    occasion_label: gift.occasion && !known ? gift.occasion : '',
    occasion_date: gift.occasion_date || '',
    notes: gift.notes || '',
    price: centsToInput(gift.current_price_cents),
    currency: gift.currency || 'EUR',
  });
}

export function payloadFromForm(form, { includeNotes = true } = {}) {
  const recipient = form.recipient || '';
  const occasion = form.occasion === 'other' ? (form.occasion_label || '').trim() || 'other' : form.occasion || null;
  const payload = {
    kind: form.kind,
    title: form.title.trim(),
    description: form.description.trim() || null,
    url: form.url.trim() || null,
    image: form.image || null,
    for_user_id: recipient.startsWith('u:') ? Number(recipient.slice(2)) : null,
    for_contact_id: recipient.startsWith('c:') ? Number(recipient.slice(2)) : null,
    for_person_name: recipient === 'name' ? form.for_person_name.trim() || null : null,
    occasion,
    occasion_date: form.occasion_date || null,
    current_price_cents: priceToCents(form.price),
    currency: form.currency || 'EUR',
  };
  if (includeNotes) payload.notes = form.notes.trim() || null;
  return payload;
}
