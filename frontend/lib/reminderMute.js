// Taking oneself off an event's reminder (only reminders: who takes part
// stays as it is).
import { handOff } from './viewHandoff';

// An event the calendar should open, with the reminder choice when asked
// (the "Don't remind me" push button of a series).
export const EVENT_LINK_HANDOFF = 'tribu_calendar_event';
export const EVENT_LINK_EVENT = 'tribu:open-event';

// Told when a reminder was muted outside the calendar (the notification
// panel), so an open calendar shows the new state.
export const REMINDER_MUTE_CHANGED = 'tribu:reminder-mute-changed';

export function announceReminderMute(detail) {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(REMINDER_MUTE_CHANGED, { detail }));
}

// Opens the calendar at ``target``. Someone in several families may have
// another one open: Tribu switches to the event's family first (the views
// wait while it loads), then hands the event to the calendar. A family
// they are no longer in just opens the calendar; when that family cannot be
// loaded, ``onError`` says so and the calendar opens without the event.
export async function openEventLink(target, { setActiveView, switchFamily, familyId, families = [], onError }) {
  const linked = target.familyId != null ? String(target.familyId) : null;
  if (linked && linked !== String(familyId)) {
    if (!families.some((family) => String(family.family_id) === linked)) {
      setActiveView('calendar');
      return;
    }
    try {
      await switchFamily(linked);
    } catch {
      onError?.();
      setActiveView('calendar');
      return;
    }
  }
  handOff(EVENT_LINK_HANDOFF, JSON.stringify(target));
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENT_LINK_EVENT));
  setActiveView('calendar');
}

export function parseEventLink(value) {
  try {
    const target = JSON.parse(value || 'null');
    return target && Number.isInteger(target.eventId) && target.at ? target : null;
  } catch {
    return null;
  }
}

// What an event reminder's link names: the event, its family, the
// occurrence (local wall time, as the calendar lists starts_at) and whether
// it repeats. The server writes it as
// /calendar?event=12&family=3&at=2026-12-01T09:00:00[&repeats=1]; older
// reminders without the occurrence give null, without the family
// familyId null.
export function eventReminderTarget(link) {
  const raw = String(link || '').trim();
  if (!raw) return null;
  let params;
  try {
    params = new URL(raw, 'https://tribu.local').searchParams;
  } catch {
    return null;
  }
  const eventId = Number(params.get('event'));
  const at = params.get('at');
  if (!Number.isInteger(eventId) || eventId <= 0 || !at) return null;
  const family = Number(params.get('family'));
  return {
    eventId,
    familyId: Number.isInteger(family) && family > 0 ? family : null,
    at,
    repeats: params.get('repeats') === '1',
    choose: params.get('mute') === 'choose',
  };
}

// An event someone gets reminded of here: not a birthday, not all-day (those
// have no reminder), and not one that reminds only its creator when that is
// someone else. The state comes from the calendar API.
export function showsReminderControl(event, me) {
  if (!event || event._isBirthday || event.all_day) return false;
  if (!Object.prototype.hasOwnProperty.call(event, 'reminder_muted')) return false;
  if (
    event.remind_only_creator &&
    event.created_by_user_id != null &&
    me?.user_id != null &&
    String(event.created_by_user_id) !== String(me.user_id)
  ) {
    return false;
  }
  return true;
}

// A series, or a changed occurrence of one.
export function isSeriesEvent(event) {
  return Boolean(event?.is_recurring || event?.recurrence || event?.recurrence_id);
}

// The occurrence to name for an event or occurrence from the calendar list.
export function occurrenceStartOf(event) {
  return event?.starts_at ? String(event.starts_at).slice(0, 19) : null;
}

// Sets the state of one occurrence: null (remind me), 'occurrence' or
// 'series'. Resolves to the server's state, or throws.
export async function setReminderMute(api, eventId, state, occurrenceStart) {
  const result = state
    ? await api.apiMuteEventReminder(eventId, state, occurrenceStart)
    : await api.apiUnmuteEventReminder(eventId, occurrenceStart);
  if (!result?.ok) throw new Error('reminder_mute_failed');
  return result.data?.reminder_muted ?? null;
}
