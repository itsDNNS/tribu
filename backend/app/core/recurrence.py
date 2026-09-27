"""Recurrence expansion for calendar events.

Given a recurring CalendarEvent and a date range, expand_event() yields
virtual occurrence dicts with shifted starts_at / ends_at values.
"""

from calendar import monthrange
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Iterable, Mapping, Optional, Sequence

from dateutil.relativedelta import relativedelta
from sqlalchemy.orm import Session

from app.models import CalendarEvent

# The weekday-based rules take their weekday and position from starts_at.
# "monthly_weekday" repeats on the same weekday with the same position in
# the month (the 2nd Thursday), skipping months without it (a 5th
# Thursday); "monthly_last_weekday" on the month's last such weekday (the
# last Friday). The yearly variants do the same in starts_at's month only
# (the 4th Thursday of November, the last Monday of May).
WEEKDAY_MONTHLY_RECURRENCES = {"monthly_weekday", "monthly_last_weekday"}
WEEKDAY_YEARLY_RECURRENCES = {"yearly_weekday", "yearly_last_weekday"}
LAST_WEEKDAY_RECURRENCES = {"monthly_last_weekday", "yearly_last_weekday"}
MONTHLY_RECURRENCES = {"monthly", *WEEKDAY_MONTHLY_RECURRENCES}
YEARLY_RECURRENCES = {"yearly", *WEEKDAY_YEARLY_RECURRENCES}
# Only these rules can repeat on several weekdays (recurrence_weekdays).
WEEKLY_RECURRENCES = {"weekly", "biweekly"}
VALID_RECURRENCES = {"daily", *WEEKLY_RECURRENCES, *MONTHLY_RECURRENCES, *YEARLY_RECURRENCES}
MAX_OCCURRENCES = 500


@dataclass(frozen=True)
class SeriesChanges:
    """The changed-occurrence rows of one series (family_id, ical_uid)."""

    # Dates of single occurrences a row replaces.
    replaced_dates: frozenset[str] = frozenset()
    # Original starts from which a row changes all following occurrences
    # (RANGE=THISANDFUTURE), sorted.
    splits: tuple[datetime, ...] = ()


SeriesChangesMap = Mapping[tuple[int, str], SeriesChanges]


def weekday_position(dt: date) -> int:
    """1 for the month's first such weekday, 2 for the second, up to 5."""
    return (dt.day - 1) // 7 + 1


def is_last_weekday_of_month(dt: date) -> bool:
    return dt.day + 7 > monthrange(dt.year, dt.month)[1]


def normalize_weekdays(weekdays: Optional[Sequence[int]], starts_at: date) -> Optional[list[int]]:
    """Sorted weekdays of a weekly rule, or None when it is only starts_at's weekday."""
    days = sorted({int(day) for day in weekdays or []})
    if not days or days == [starts_at.weekday()]:
        return None
    return days


def _weekday_in_month(year: int, month: int, anchor: datetime, last: bool) -> Optional[datetime]:
    """The day in that month with anchor's weekday and position, if it exists."""
    days_in_month = monthrange(year, month)[1]
    if last:
        day = days_in_month - (date(year, month, days_in_month).weekday() - anchor.weekday()) % 7
    else:
        first_match = 1 + (anchor.weekday() - date(year, month, 1).weekday()) % 7
        day = first_match + 7 * (weekday_position(anchor) - 1)
        if day > days_in_month:
            return None
    return anchor.replace(year=year, month=month, day=day)


def _months_later(dt: datetime, months: int) -> tuple[int, int]:
    index = dt.year * 12 + dt.month - 1 + months
    return index // 12, index % 12 + 1


def _weekday_occurrence(recurrence: str, anchor: datetime, steps: int) -> Optional[datetime]:
    """The occurrence ``steps`` months or years after anchor's, if that one exists."""
    last = recurrence in LAST_WEEKDAY_RECURRENCES
    if recurrence in WEEKDAY_YEARLY_RECURRENCES:
        return _weekday_in_month(anchor.year + steps, anchor.month, anchor, last)
    return _weekday_in_month(*_months_later(anchor, steps), anchor, last)


def _steps_between(recurrence: str, start: datetime, later: datetime) -> int:
    if recurrence in WEEKDAY_YEARLY_RECURRENCES:
        return later.year - start.year
    return (later.year - start.year) * 12 + later.month - start.month


def _next_weekly(dt: datetime, weekdays: Sequence[int], interval_weeks: int) -> datetime:
    """The next listed weekday; after the week's last one, the first one
    ``interval_weeks`` weeks on. ``dt`` must lie in a repeating week."""
    later = [day for day in weekdays if day > dt.weekday()]
    if later:
        return dt + timedelta(days=later[0] - dt.weekday())
    week_start = dt - timedelta(days=dt.weekday())
    return week_start + timedelta(weeks=interval_weeks, days=weekdays[0])


def _next_occurrence(
    dt: datetime,
    recurrence: str,
    *,
    anchor_day: int | None = None,
    anchor: datetime | None = None,
    weekdays: Optional[Sequence[int]] = None,
) -> datetime:
    """The occurrence after ``dt``.

    ``anchor`` is the series start; monthly and yearly rules take their
    day or weekday from it (``anchor_day`` still works for plain
    monthly). ``weekdays`` lists the days of a weekly rule.
    """
    if recurrence == "daily":
        return dt + timedelta(days=1)
    if recurrence in WEEKLY_RECURRENCES:
        interval_weeks = 2 if recurrence == "biweekly" else 1
        if weekdays:
            return _next_weekly(dt, weekdays, interval_weeks)
        return dt + timedelta(weeks=interval_weeks)
    if recurrence == "monthly":
        return dt + relativedelta(months=1, day=anchor_day or (anchor.day if anchor else dt.day))
    if recurrence == "yearly":
        return dt + relativedelta(years=1)
    if recurrence in WEEKDAY_MONTHLY_RECURRENCES | WEEKDAY_YEARLY_RECURRENCES:
        anchor = anchor or dt
        # A fifth weekday comes within months; a fifth weekday of one
        # given month within a few years.
        steps = _steps_between(recurrence, anchor, dt)
        for later in range(steps + 1, steps + 29):
            occurrence = _weekday_occurrence(recurrence, anchor, later)
            if occurrence is not None:
                return occurrence
    return dt


def _step_size(recurrence: str) -> timedelta:
    """Approximate minimum step size for smart-start calculation."""
    if recurrence == "daily":
        return timedelta(days=1)
    if recurrence == "weekly":
        return timedelta(weeks=1)
    if recurrence == "biweekly":
        return timedelta(weeks=2)
    if recurrence == "yearly":
        return timedelta(days=365)
    return timedelta(days=1)


def _smart_start(
    starts_at: datetime,
    range_start: datetime,
    recurrence: str,
    weekdays: Optional[Sequence[int]] = None,
) -> datetime:
    """Jump close to range_start instead of iterating from the beginning.

    The result is an occurrence at or before range_start.
    """
    if starts_at >= range_start:
        return starts_at

    if recurrence == "monthly":
        # Count calendar months: fixed-length steps drift past
        # range_start for series older than about a year.
        months = _steps_between(recurrence, starts_at, range_start) - 1
        return starts_at + relativedelta(months=months) if months > 0 else starts_at
    if recurrence in WEEKDAY_MONTHLY_RECURRENCES | WEEKDAY_YEARLY_RECURRENCES:
        for back in range(_steps_between(recurrence, starts_at, range_start) - 1, 0, -1):
            occurrence = _weekday_occurrence(recurrence, starts_at, back)
            if occurrence is not None:
                return occurrence
        return starts_at

    diff = range_start - starts_at
    step = _step_size(recurrence)
    if step.total_seconds() <= 0:
        return starts_at

    # Jump to N-1 steps before range_start to avoid overshooting with yearly
    n_steps = max(0, int(diff / step) - 1)
    if n_steps <= 0:
        return starts_at

    if recurrence == "daily":
        return starts_at + timedelta(days=n_steps)
    if recurrence in WEEKLY_RECURRENCES:
        jumped = starts_at + step * n_steps
        if weekdays:
            # The week of ``jumped`` repeats; its first listed day is an occurrence.
            return jumped + timedelta(days=weekdays[0] - jumped.weekday())
        return jumped
    if recurrence == "yearly":
        return starts_at + relativedelta(years=n_steps)
    return starts_at


def _event_to_dict(event) -> dict:
    """Convert a CalendarEvent ORM object to a plain dict."""
    return {
        "id": event.id,
        "family_id": event.family_id,
        "title": event.title,
        "description": event.description,
        "location": event.location,
        "starts_at": event.starts_at,
        "ends_at": event.ends_at,
        "all_day": event.all_day,
        "recurrence": event.recurrence,
        "recurrence_end": event.recurrence_end,
        "recurrence_weekdays": getattr(event, "recurrence_weekdays", None),
        "assigned_to": event.assigned_to,
        "color": event.color,
        "category": event.category,
        "icon": event.icon,
        "created_by_user_id": event.created_by_user_id,
        "created_at": event.created_at,
        "recurrence_id": getattr(event, "recurrence_id", None),
        "source_type": event.source_type,
        "source_name": event.source_name,
        "source_url": event.source_url,
        "imported_at": event.imported_at,
        "last_synced_at": event.last_synced_at,
        "sync_status": event.sync_status,
    }


def load_series_changes(db: Session, events: Iterable) -> dict[tuple[int, str], SeriesChanges]:
    """The changed-occurrence rows of the recurring events given.

    Keyed by (family_id, ical_uid). The rows are looked up independently
    of any date range, because a changed occurrence can move far away
    from the date it replaces.
    """
    series = [ev for ev in events if ev.recurrence and getattr(ev, "ical_uid", None)]
    if not series:
        return {}
    rows = (
        db.query(CalendarEvent.family_id, CalendarEvent.ical_uid, CalendarEvent.recurrence_id, CalendarEvent.recurrence)
        .filter(
            CalendarEvent.family_id.in_({ev.family_id for ev in series}),
            CalendarEvent.ical_uid.in_({ev.ical_uid for ev in series}),
            CalendarEvent.recurrence_id.isnot(None),
        )
        .all()
    )
    replaced: dict[tuple[int, str], set[str]] = {}
    splits: dict[tuple[int, str], list[datetime]] = {}
    for family_id, ical_uid, recurrence_id, recurrence in rows:
        if recurrence:
            splits.setdefault((family_id, ical_uid), []).append(recurrence_id)
        else:
            replaced.setdefault((family_id, ical_uid), set()).add(recurrence_id.strftime("%Y-%m-%d"))
    return {
        key: SeriesChanges(frozenset(replaced.get(key, ())), tuple(sorted(splits.get(key, ()))))
        for key in replaced.keys() | splits.keys()
    }


def expand_event(
    event,
    range_start: Optional[datetime] = None,
    range_end: Optional[datetime] = None,
    series_changes: Optional[SeriesChangesMap] = None,
) -> list[dict]:
    """Expand a single event into occurrences within the given range.

    For non-recurring events, returns a single-element list if the event
    falls within the range (or always, if no range is given).

    For recurring events, generates virtual occurrences with shifted
    starts_at/ends_at, filtered by excluded_dates and recurrence_end.
    With ``series_changes`` (see ``load_series_changes``), occurrences
    that a changed-occurrence row replaces are skipped, and the series
    ends where a row changes all following occurrences.
    """
    base = _event_to_dict(event)
    recurrence = event.recurrence

    if not recurrence:
        if range_start and event.starts_at < range_start:
            if not event.ends_at or event.ends_at < range_start:
                return []
        if range_end and event.starts_at >= range_end:
            return []
        base["is_recurring"] = False
        base["occurrence_date"] = None
        return [base]

    duration = timedelta(0)
    if event.ends_at and event.starts_at:
        duration = event.ends_at - event.starts_at

    excluded = set(event.excluded_dates or [])
    split_date = None
    ical_uid = getattr(event, "ical_uid", None)
    changes = series_changes.get((event.family_id, ical_uid)) if series_changes and ical_uid else None
    if changes:
        excluded |= changes.replaced_dates
        own_split = getattr(event, "recurrence_id", None)
        split = next((s for s in changes.splits if own_split is None or s > own_split), None)
        split_date = split.date() if split else None
    recurrence_end = event.recurrence_end
    weekdays = normalize_weekdays(getattr(event, "recurrence_weekdays", None), event.starts_at) if recurrence in WEEKLY_RECURRENCES else None

    if range_start:
        current = _smart_start(event.starts_at, range_start - duration, recurrence, weekdays)
    else:
        current = event.starts_at

    occurrences = []
    count = 0

    while count < MAX_OCCURRENCES:
        if recurrence_end and current > recurrence_end:
            break

        if range_end and current >= range_end:
            break

        if split_date and current.date() >= split_date:
            break

        occurrence_date = current.strftime("%Y-%m-%d")

        in_range = True
        if range_start and current < range_start and current + duration <= range_start:
            in_range = False
        if range_end and current >= range_end:
            in_range = False

        if in_range and occurrence_date not in excluded:
            occ = base.copy()
            occ["starts_at"] = current
            occ["ends_at"] = current + duration if duration else None
            occ["is_recurring"] = True
            occ["occurrence_date"] = occurrence_date
            occurrences.append(occ)

        current = _next_occurrence(current, recurrence, anchor=event.starts_at, weekdays=weekdays)
        count += 1

    return occurrences
