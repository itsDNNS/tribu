"""Who is reminded before a calendar event starts.

By default every member of the family with reminders on gets the reminder.
An event can instead remind only the person who created it
(``CalendarEvent.remind_only_creator``), so a full family calendar does not
turn into a storm of reminders for everyone. And everyone can take
themselves off an event's reminders (``EventReminderMute``): for one
occurrence of a series, for the whole series, or for a single event.
"""

from __future__ import annotations

from collections.abc import Collection, Iterable, Mapping
from datetime import datetime, timedelta

from sqlalchemy.exc import IntegrityError

from app.core.clock import local_wall_now, to_local_wall_naive
from app.core.recurrence import expand_event, load_series_changes
from app.models import CalendarEvent, EventReminderMute, ReminderSnooze

MUTE_SERIES = "series"
MUTE_OCCURRENCE = "occurrence"


def series_rows(db, events: Iterable[CalendarEvent]) -> dict[int, CalendarEvent]:
    """``{event id: row whose reminder settings apply}`` for ``events``.

    A changed occurrence of a series (a row with ``recurrence_id``, written
    by CalDAV or an ICS feed) follows its series, so the setting covers
    every occurrence and the series' creator is the one reminded. Without
    a series row the occurrence stands on its own.
    """
    events = list(events)
    result = {ev.id: ev for ev in events}
    changed = [ev for ev in events if ev.recurrence_id is not None and ev.ical_uid]
    if changed:
        series = {
            (row.family_id, row.ical_uid): row
            for row in db.query(CalendarEvent).filter(
                CalendarEvent.family_id.in_({ev.family_id for ev in changed}),
                CalendarEvent.ical_uid.in_({ev.ical_uid for ev in changed}),
                CalendarEvent.recurrence_id.is_(None),
            )
        }
        for ev in changed:
            result[ev.id] = series.get((ev.family_id, ev.ical_uid), ev)
    return result


def reminder_settings_row(db, event: CalendarEvent) -> CalendarEvent:
    """The row whose reminder setting applies to ``event`` (see :func:`series_rows`)."""
    return series_rows(db, [event])[event.id]


def only_reminded_user(settings_row: CalendarEvent, member_ids: Collection[int]) -> int | None:
    """The only member to remind, or None when the whole family is reminded.

    ``settings_row`` is the row from :func:`reminder_settings_row`.

    When the event reminds only its creator but the creator is gone (the
    account was deleted or left the family, which clears
    ``created_by_user_id``) or is no longer a member, everyone is reminded
    again. Reminding nobody would let a family event go silent without
    anyone having chosen that, and nobody could switch it back, since only
    the creator may change the setting.
    """
    if not settings_row.remind_only_creator:
        return None
    creator_id = settings_row.created_by_user_id
    if creator_id is None or creator_id not in member_ids:
        return None
    return creator_id


def series_reminder_owners(db, events: Iterable[CalendarEvent]) -> dict[int, tuple[int | None, bool]]:
    """``{event id: (creator id, remind_only_creator)}`` of the series, for
    the changed occurrences among ``events`` whose series row exists.

    API responses show a changed occurrence with its series' creator and
    setting, since those decide who is reminded and who may change it.
    """
    return {
        event_id: (row.created_by_user_id, bool(row.remind_only_creator))
        for event_id, row in series_rows(db, events).items()
        if row.id != event_id
    }


def with_series_reminder_owner(item: dict, owners: dict[int, tuple[int | None, bool]]) -> dict:
    """``item`` (an event or occurrence dict) with its series' creator and setting."""
    owner = owners.get(item.get("id"))
    if owner is None:
        return item
    return {**item, "created_by_user_id": owner[0], "remind_only_creator": owner[1]}


# ── Taking oneself off an event's reminders ──────────────────────────────
#
# A mute names the series row (or a single event) and, for one occurrence,
# its original start in local wall time, the RFC 5545 RECURRENCE-ID. So a
# mute for one occurrence still holds after a phone moved that occurrence.


def _second(value: datetime) -> datetime:
    return value.replace(microsecond=0, tzinfo=None)


def is_part_of_series(event: CalendarEvent, settings_row: CalendarEvent) -> bool:
    """Whether ``event`` repeats or is a changed occurrence of a series."""
    return settings_row is not event or bool(event.recurrence)


def _is_changed_occurrence(event: CalendarEvent) -> bool:
    return event.recurrence_id is not None and not event.recurrence


def reminder_mute_key(
    event: CalendarEvent, settings_row: CalendarEvent, starts_at: datetime,
) -> tuple[int, datetime | None]:
    """``(event id, occurrence)`` a mute of the occurrence of ``event``
    starting at ``starts_at`` is stored under.

    A single event has no occurrence (None). An occurrence of a series is
    named by its original start: the start itself, the ``recurrence_id`` of
    a changed occurrence, or for a row that changed all following
    occurrences its start moved back by the same shift.
    """
    if not is_part_of_series(event, settings_row):
        return event.id, None
    if event.recurrence_id is not None:
        if event.recurrence:
            return settings_row.id, _second(starts_at + (event.recurrence_id - event.starts_at))
        return settings_row.id, _second(event.recurrence_id)
    return settings_row.id, _second(starts_at)


def mute_state(keys: Collection[datetime | None] | None, occurrence: datetime | None) -> str | None:
    """"series" when the whole series (or the single event) is muted,
    "occurrence" when only this occurrence is, else None."""
    if not keys:
        return None
    if None in keys:
        return MUTE_SERIES
    return MUTE_OCCURRENCE if occurrence in keys else None


def load_reminder_mutes(
    db, event_ids: Iterable[int], user_ids: Iterable[int] | None = None,
) -> dict[tuple[int, int], set[datetime | None]]:
    """``{(user id, event id): {occurrence, ...}}`` for ``event_ids``
    (series rows), with None standing for the whole series."""
    query = db.query(EventReminderMute.user_id, EventReminderMute.event_id, EventReminderMute.occurrence_start).filter(
        EventReminderMute.event_id.in_(set(event_ids))
    )
    if user_ids is not None:
        query = query.filter(EventReminderMute.user_id.in_(set(user_ids)))
    mutes: dict[tuple[int, int], set[datetime | None]] = {}
    for user_id, event_id, occurrence in query:
        mutes.setdefault((user_id, event_id), set()).add(occurrence)
    return mutes


def is_muted(db, user_id: int, key: tuple[int, datetime | None]) -> bool:
    event_id, occurrence = key
    return mute_state(load_reminder_mutes(db, [event_id], [user_id]).get((user_id, event_id)), occurrence) is not None


def reminder_mute_states(
    db, user_id: int, events: Iterable[CalendarEvent], items: Iterable[Mapping] | None = None,
) -> list[str | None]:
    """The user's mute state for each event or occurrence in ``items``
    (dicts with ``id`` and ``starts_at``) of the rows ``events``; without
    ``items``, for the rows themselves."""
    rows = {ev.id: ev for ev in events}
    if items is None:
        items = [{"id": ev.id, "starts_at": ev.starts_at} for ev in rows.values()]
    settings = series_rows(db, rows.values())
    mutes = load_reminder_mutes(db, {row.id for row in settings.values()}, [user_id])
    states = []
    for item in items:
        event_id, occurrence = reminder_mute_key(rows[item["id"]], settings[item["id"]], item["starts_at"])
        states.append(mute_state(mutes.get((user_id, event_id)), occurrence))
    return states


def snoozed_mute_key(snooze: ReminderSnooze, event: CalendarEvent, settings_row: CalendarEvent):
    """The mute key that silences ``snooze``: the occurrence the reminder
    named, kept with the snooze so it holds after the occurrence moved and
    needs no round trip through UTC (02:30 on the night clocks go forward).
    Older snoozes work it out from when the reminder ran out."""
    if snooze.occurrence_start is not None:
        return settings_row.id, snooze.occurrence_start
    if snooze.expires_at is not None:
        return reminder_mute_key(event, settings_row, local_wall_now(snooze.expires_at))
    if not event.recurrence:
        return reminder_mute_key(event, settings_row, event.starts_at)
    return settings_row.id, None


class ReminderMuteError(Exception):
    """The occurrence to mute is not one of the event's."""

    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


def _requested_key(db, event: CalendarEvent, settings_row: CalendarEvent, occurrence_start, *, check: bool = False):
    """The mute key a request about ``occurrence_start`` of ``event`` means;
    occurrence None for the whole event or series. ``check`` refuses a start
    that is not one of the event's occurrences."""
    if not is_part_of_series(event, settings_row) or _is_changed_occurrence(event):
        return reminder_mute_key(event, settings_row, event.starts_at)
    if occurrence_start is None:
        return settings_row.id, None
    start = _second(to_local_wall_naive(occurrence_start))
    if check and not any(
        _second(occurrence["starts_at"]) == start
        for occurrence in expand_event(event, start, start + timedelta(seconds=1), load_series_changes(db, [event]))
    ):
        raise ReminderMuteError("EVENT_OCCURRENCE_NOT_FOUND")
    return reminder_mute_key(event, settings_row, start)


def _mute_rows(db, user_id: int, event_id: int):
    return db.query(EventReminderMute).filter(
        EventReminderMute.user_id == user_id, EventReminderMute.event_id == event_id,
    )


def set_reminder_mute(
    db, user_id: int, event: CalendarEvent, scope: str, occurrence_start: datetime | None,
) -> str:
    """Takes the user off the reminder of ``event`` and returns the state of
    the occurrence: "series" or "occurrence". Nothing is committed.

    A single event is always muted as a whole. "occurrence" mutes only the
    occurrence starting at ``occurrence_start`` (not needed for a changed
    occurrence) and lifts a mute of the whole series, so the state of this
    occurrence is exactly the one asked for.
    """
    settings_row = reminder_settings_row(db, event)
    if scope == MUTE_SERIES or not is_part_of_series(event, settings_row):
        event_id, occurrence = settings_row.id, None
    else:
        event_id, occurrence = _requested_key(db, event, settings_row, occurrence_start, check=True)
        if occurrence is None:
            raise ReminderMuteError("EVENT_OCCURRENCE_NOT_FOUND")
        _mute_rows(db, user_id, event_id).filter(EventReminderMute.occurrence_start.is_(None)).delete(
            synchronize_session=False
        )
    try:
        with db.begin_nested():
            db.add(EventReminderMute(user_id=user_id, event_id=event_id, occurrence_start=occurrence))
    except IntegrityError:
        pass  # Muted already.
    return MUTE_OCCURRENCE if occurrence else MUTE_SERIES


def clear_reminder_mute(db, user_id: int, event: CalendarEvent, occurrence_start: datetime | None) -> None:
    """Reminds the user of ``event`` again. Nothing is committed.

    With ``occurrence_start`` (or for a changed occurrence) the occurrence
    reminds again, which also lifts a mute of the whole series; without it,
    every mute of the series goes.
    """
    event_id, occurrence = _requested_key(db, event, reminder_settings_row(db, event), occurrence_start)
    rows = _mute_rows(db, user_id, event_id)
    if occurrence is not None:
        rows = rows.filter(
            EventReminderMute.occurrence_start.is_(None) | (EventReminderMute.occurrence_start == occurrence)
        )
    rows.delete(synchronize_session=False)
