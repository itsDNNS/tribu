// Taking oneself off an event's reminder (only reminders: who takes part
// stays as it is).
import * as api from './api';
import { handOff } from './viewHandoff';

// An event the calendar should open, with the reminder choice when asked
// (the "Don't remind me" push button of a series).
export const EVENT_LINK_HANDOFF = 'tribu_calendar_event';
export const EVENT_LINK_EVENT = 'tribu:open-event';

// Told whenever a reminder was muted or unmuted ({ eventId, at, state,
// repeats }), so the calendar shows the new state wherever it changed.
export const REMINDER_MUTE_CHANGED = 'tribu:reminder-mute-changed';

// Opens the calendar at ``target``. Someone in several families may have
// another one open: Tribu switches to the event's family first (the views
// wait while it loads), then hands the event to the calendar. A family
// they are no longer in just opens the calendar; when that family cannot be
// loaded, ``onError`` says so and the calendar opens without the event.
export async function openEventLink(target, { setActiveView, switchFamily, familyId, families = [], onError }) {
  const linked = target.familyId != null ? String(target.familyId) : null;
  try {
    if (linked && linked !== String(familyId)) {
      if (!families.some((family) => String(family.family_id) === linked)) return;
      await switchFamily(linked);
    }
    handOff(EVENT_LINK_HANDOFF, JSON.stringify(target));
    window.dispatchEvent(new Event(EVENT_LINK_EVENT));
  } catch {
    onError?.();
  } finally {
    setActiveView('calendar');
  }
}

export function parseEventLink(value) {
  return value ? JSON.parse(value) : null;
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
  if (!event || event._isBirthday || event.all_day || event.reminder_muted === undefined) return false;
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
// 'series', and tells the calendar. Resolves to the server's state, or throws.
export async function setReminderMute({ eventId, at, repeats }, state) {
  const result = state
    ? await api.apiMuteEventReminder(eventId, state, at)
    : await api.apiUnmuteEventReminder(eventId, at);
  if (!result?.ok) throw new Error('reminder_mute_failed');
  const saved = result.data?.reminder_muted ?? null;
  window.dispatchEvent(new CustomEvent(REMINDER_MUTE_CHANGED, { detail: { eventId, at, repeats, state: saved } }));
  return saved;
}

// The toast after a change of the state.
export function reminderMuteToastKey(state, repeats) {
  if (!state) return 'toast.reminder_unmuted';
  return state === 'series' && repeats ? 'toast.reminder_muted_series' : 'toast.reminder_muted';
}
