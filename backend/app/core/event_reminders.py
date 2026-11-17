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
from datetime import datetime, timedelta, timezone

from sqlalchemy.exc import IntegrityError

from app.core.clock import to_local_wall_naive
from app.core.recurrence import expand_event, load_series_changes
from app.models import CalendarEvent, EventReminderMute

MUTE_SERIES = "series"
MUTE_OCCURRENCE = "occurrence"
MUTE_SCOPES = (MUTE_OCCURRENCE, MUTE_SERIES)


def reminder_settings_row(db, event: CalendarEvent) -> CalendarEvent:
    """The row whose reminder setting applies to ``event``.

    A changed occurrence of a series (a row with ``recurrence_id``, written
    by CalDAV or an ICS feed) follows its series, so the setting covers
    every occurrence and the series' creator is the one reminded. Without
    a series row the occurrence stands on its own.
    """
    if event.recurrence_id is None or not event.ical_uid:
        return event
    series = (
        db.query(CalendarEvent)
        .filter(
            CalendarEvent.family_id == event.family_id,
            CalendarEvent.ical_uid == event.ical_uid,
            CalendarEvent.recurrence_id.is_(None),
        )
        .first()
    )
    return series or event


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
    changed = [ev for ev in events if ev.recurrence_id is not None and ev.ical_uid]
    if not changed:
        return {}
    series = {
        (family_id, ical_uid): (creator_id, bool(flag))
        for family_id, ical_uid, creator_id, flag in db.query(
            CalendarEvent.family_id,
            CalendarEvent.ical_uid,
            CalendarEvent.created_by_user_id,
            CalendarEvent.remind_only_creator,
        ).filter(
            CalendarEvent.family_id.in_({ev.family_id for ev in changed}),
            CalendarEvent.ical_uid.in_({ev.ical_uid for ev in changed}),
            CalendarEvent.recurrence_id.is_(None),
        )
    }
    return {
        ev.id: series[(ev.family_id, ev.ical_uid)]
        for ev in changed
        if (ev.family_id, ev.ical_uid) in series
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
# mute for one occurrence still holds after a phone moved that occurrence
# (a changed-occurrence row keeps the original start in ``recurrence_id``).


def _second(value: datetime) -> datetime:
    return value.replace(microsecond=0, tzinfo=None)


def is_part_of_series(event: CalendarEvent, settings_row: CalendarEvent) -> bool:
    """Whether ``event`` repeats or is a changed occurrence of a series."""
    return settings_row is not event or bool(event.recurrence)


def reminder_mute_key(
    event: CalendarEvent, settings_row: CalendarEvent, starts_at: datetime,
) -> tuple[int, datetime | None]:
    """``(event id, occurrence)`` a mute for the occurrence of ``event``
    starting at ``starts_at`` is stored under.

    ``settings_row`` is the row from :func:`reminder_settings_row`. A single
    event has no occurrence (None). An occurrence of a series is named by
    its original start: the start itself for a regular occurrence, the
    ``recurrence_id`` of a changed occurrence, and for a row that changed
    all following occurrences its start moved back by the same shift.
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
    if occurrence is not None and occurrence in keys:
        return MUTE_OCCURRENCE
    return None


def load_reminder_mutes(
    db, event_ids: Iterable[int], user_ids: Iterable[int] | None = None,
) -> dict[tuple[int, int], set[datetime | None]]:
    """``{(user id, event id): {occurrence, ...}}`` for ``event_ids``
    (series rows), with None standing for the whole series."""
    ids = set(event_ids)
    if not ids:
        return {}
    query = db.query(EventReminderMute.user_id, EventReminderMute.event_id, EventReminderMute.occurrence_start).filter(
        EventReminderMute.event_id.in_(ids)
    )
    if user_ids is not None:
        query = query.filter(EventReminderMute.user_id.in_(set(user_ids)))
    mutes: dict[tuple[int, int], set[datetime | None]] = {}
    for user_id, event_id, occurrence in query:
        mutes.setdefault((user_id, event_id), set()).add(_second(occurrence) if occurrence else None)
    return mutes


def series_rows(db, events: Iterable[CalendarEvent]) -> dict[int, CalendarEvent]:
    """``{event id: row from reminder_settings_row}`` for ``events``, with
    one query for all changed occurrences."""
    events = list(events)
    result = {ev.id: ev for ev in events}
    changed = [ev for ev in events if ev.recurrence_id is not None and ev.ical_uid]
    if not changed:
        return result
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


def reminder_mute_states(
    db, user_id: int, events: Iterable[CalendarEvent], items: Iterable[Mapping],
) -> list[str | None]:
    """The user's mute state for each event or occurrence in ``items``
    (dicts with ``id`` and ``starts_at``) of the rows ``events``."""
    rows = {ev.id: ev for ev in events}
    settings = series_rows(db, rows.values())
    mutes = load_reminder_mutes(db, {row.id for row in settings.values()}, [user_id])
    states: list[str | None] = []
    for item in items:
        event = rows.get(item.get("id"))
        if event is None or item.get("starts_at") is None:
            states.append(None)
            continue
        event_id, occurrence = reminder_mute_key(event, settings[event.id], item["starts_at"])
        states.append(mute_state(mutes.get((user_id, event_id)), occurrence))
    return states


def utc_to_local_wall(value: datetime) -> datetime:
    """A naive UTC instant (like ``expires_at``) as local wall time."""
    return to_local_wall_naive(value.replace(tzinfo=timezone.utc))


class ReminderMuteError(Exception):
    """The occurrence to mute is not one of the event's."""

    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


def _has_occurrence_at(db, event: CalendarEvent, start: datetime) -> bool:
    occurrences = expand_event(
        event, start, start + timedelta(seconds=1), load_series_changes(db, [event]),
    )
    return any(_second(occurrence["starts_at"]) == start for occurrence in occurrences)


def _occurrence_start(db, event: CalendarEvent, occurrence_start: datetime | None, *, check: bool) -> datetime:
    """The actual start of the occurrence of ``event`` meant by the client."""
    if event.recurrence_id is not None and not event.recurrence:
        # A changed occurrence is one occurrence already.
        return event.starts_at
    if occurrence_start is None:
        raise ReminderMuteError("EVENT_OCCURRENCE_NOT_FOUND")
    start = _second(to_local_wall_naive(occurrence_start))
    if check and not _has_occurrence_at(db, event, start):
        raise ReminderMuteError("EVENT_OCCURRENCE_NOT_FOUND")
    return start


def _mute_rows(db, user_id: int, event_id: int):
    return db.query(EventReminderMute).filter(
        EventReminderMute.user_id == user_id, EventReminderMute.event_id == event_id,
    )


def _add_mute(db, user_id: int, event_id: int, occurrence: datetime | None) -> None:
    rows = _mute_rows(db, user_id, event_id)
    rows = rows.filter(
        EventReminderMute.occurrence_start.is_(None) if occurrence is None
        else EventReminderMute.occurrence_start == occurrence
    )
    if rows.first() is not None:
        return
    try:
        with db.begin_nested():
            db.add(EventReminderMute(user_id=user_id, event_id=event_id, occurrence_start=occurrence))
    except IntegrityError:
        # Muted at the same moment from another device.
        pass


def set_reminder_mute(
    db, user_id: int, event: CalendarEvent, scope: str, occurrence_start: datetime | None,
) -> str:
    """Takes the user off the reminder of ``event`` and returns the state of
    the occurrence: "series" or "occurrence".

    A single event is always muted as a whole. For a series, ``scope``
    "series" mutes every occurrence; "occurrence" mutes only the one
    starting at ``occurrence_start`` (not needed for a changed occurrence)
    and lifts a mute of the whole series, so the state of this occurrence
    is exactly the one asked for. Nothing is committed.
    """
    settings_row = reminder_settings_row(db, event)
    if not is_part_of_series(event, settings_row):
        _add_mute(db, user_id, event.id, None)
        return MUTE_SERIES
    if scope == MUTE_SERIES:
        _add_mute(db, user_id, settings_row.id, None)
        return MUTE_SERIES
    start = _occurrence_start(db, event, occurrence_start, check=True)
    event_id, occurrence = reminder_mute_key(event, settings_row, start)
    _mute_rows(db, user_id, event_id).filter(EventReminderMute.occurrence_start.is_(None)).delete(
        synchronize_session=False
    )
    _add_mute(db, user_id, event_id, occurrence)
    return MUTE_OCCURRENCE


def clear_reminder_mute(db, user_id: int, event: CalendarEvent, occurrence_start: datetime | None) -> None:
    """Reminds the user of ``event`` again. Nothing is committed.

    With ``occurrence_start`` (or for a changed occurrence) the occurrence
    reminds again, which also lifts a mute of the whole series; without it,
    every mute of the series goes.
    """
    settings_row = reminder_settings_row(db, event)
    if not is_part_of_series(event, settings_row):
        _mute_rows(db, user_id, event.id).delete(synchronize_session=False)
        return
    rows = _mute_rows(db, user_id, settings_row.id)
    if occurrence_start is None and not (event.recurrence_id is not None and not event.recurrence):
        rows.delete(synchronize_session=False)
        return
    start = _occurrence_start(db, event, occurrence_start, check=False)
    _, occurrence = reminder_mute_key(event, settings_row, start)
    rows.filter(
        (EventReminderMute.occurrence_start.is_(None)) | (EventReminderMute.occurrence_start == occurrence)
    ).delete(synchronize_session=False)


def reminder_mute_state(db, user_id: int, event: CalendarEvent, occurrence_start: datetime | None) -> str | None:
    """The user's state for one occurrence of ``event`` (or the event)."""
    settings_row = reminder_settings_row(db, event)
    if not is_part_of_series(event, settings_row):
        event_id, occurrence = event.id, None
    elif occurrence_start is None and not (event.recurrence_id is not None and not event.recurrence):
        event_id, occurrence = settings_row.id, None
    else:
        start = _occurrence_start(db, event, occurrence_start, check=False)
        event_id, occurrence = reminder_mute_key(event, settings_row, start)
    mutes = load_reminder_mutes(db, [event_id], [user_id])
    return mute_state(mutes.get((user_id, event_id)), occurrence)
