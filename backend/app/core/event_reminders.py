"""Who is reminded before a calendar event starts.

By default every member of the family with reminders on gets the reminder.
An event can instead remind only the person who created it
(``CalendarEvent.remind_only_creator``), so a full family calendar does not
turn into a storm of reminders for everyone.
"""

from __future__ import annotations

from collections.abc import Collection, Iterable

from app.models import CalendarEvent


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
