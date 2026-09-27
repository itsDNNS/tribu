"""Recurrence expansion for calendar events.

Given a recurring CalendarEvent and a date range, expand_event() yields
virtual occurrence dicts with shifted starts_at / ends_at values.
"""

from calendar import monthrange
from datetime import date, datetime, timedelta
from typing import Iterable, Mapping, Optional

from dateutil.relativedelta import relativedelta
from sqlalchemy.orm import Session

from app.models import CalendarEvent

OverriddenDates = Mapping[tuple[int, str], set[str]]

# "monthly_weekday" repeats on the same weekday with the same position in
# the month as starts_at (the 2nd Thursday), skipping months without it
# (a 5th Thursday). "monthly_last_weekday" repeats on the month's last
# such weekday (the last Friday).
WEEKDAY_MONTHLY_RECURRENCES = {"monthly_weekday", "monthly_last_weekday"}
MONTHLY_RECURRENCES = {"monthly", *WEEKDAY_MONTHLY_RECURRENCES}
VALID_RECURRENCES = {"daily", "weekly", "biweekly", "yearly", *MONTHLY_RECURRENCES}
MAX_OCCURRENCES = 500


def weekday_position(dt: date) -> int:
    """1 for the month's first such weekday, 2 for the second, up to 5."""
    return (dt.day - 1) // 7 + 1


def is_last_weekday_of_month(dt: date) -> bool:
    return dt.day + 7 > monthrange(dt.year, dt.month)[1]


def _weekday_in_month(year: int, month: int, anchor: datetime, recurrence: str) -> Optional[datetime]:
    """The occurrence of a weekday-based monthly rule in that month, if any."""
    days_in_month = monthrange(year, month)[1]
    if recurrence == "monthly_last_weekday":
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


def _next_occurrence(
    dt: datetime,
    recurrence: str,
    *,
    anchor_day: int | None = None,
    anchor: datetime | None = None,
) -> datetime:
    """The occurrence after ``dt``.

    ``anchor`` is the series start; monthly rules take their day or
    weekday from it (``anchor_day`` still works for plain monthly).
    """
    if recurrence == "daily":
        return dt + timedelta(days=1)
    if recurrence == "weekly":
        return dt + timedelta(weeks=1)
    if recurrence == "biweekly":
        return dt + timedelta(weeks=2)
    if recurrence == "monthly":
        return dt + relativedelta(months=1, day=anchor_day or (anchor.day if anchor else dt.day))
    if recurrence in WEEKDAY_MONTHLY_RECURRENCES:
        anchor = anchor or dt
        # A fifth weekday exists at least every three months.
        for months in range(1, 13):
            occurrence = _weekday_in_month(*_months_later(dt, months), anchor, recurrence)
            if occurrence is not None:
                return occurrence
    if recurrence == "yearly":
        return dt + relativedelta(years=1)
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


def _smart_start(starts_at: datetime, range_start: datetime, recurrence: str) -> datetime:
    """Jump close to range_start instead of iterating from the beginning.

    The result is an occurrence at or before range_start.
    """
    if starts_at >= range_start:
        return starts_at

    if recurrence in MONTHLY_RECURRENCES:
        # Count calendar months: fixed-length steps drift past
        # range_start for series older than about a year.
        months = (range_start.year - starts_at.year) * 12 + range_start.month - starts_at.month - 1
        for back in range(months, 0, -1):
            if recurrence == "monthly":
                return starts_at + relativedelta(months=back)
            occurrence = _weekday_in_month(*_months_later(starts_at, back), starts_at, recurrence)
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
    if recurrence == "weekly":
        return starts_at + timedelta(weeks=n_steps)
    if recurrence == "biweekly":
        return starts_at + timedelta(weeks=2 * n_steps)
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


def load_overridden_dates(db: Session, events: Iterable) -> dict[tuple[int, str], set[str]]:
    """Dates of series occurrences that a changed-occurrence row replaces.

    Keyed by (family_id, ical_uid) of the recurring events given. The
    rows are looked up independently of any date range, because a
    changed occurrence can move far away from the date it replaces.
    """
    series = [ev for ev in events if ev.recurrence and getattr(ev, "ical_uid", None)]
    if not series:
        return {}
    rows = (
        db.query(CalendarEvent.family_id, CalendarEvent.ical_uid, CalendarEvent.recurrence_id)
        .filter(
            CalendarEvent.family_id.in_({ev.family_id for ev in series}),
            CalendarEvent.ical_uid.in_({ev.ical_uid for ev in series}),
            CalendarEvent.recurrence_id.isnot(None),
        )
        .all()
    )
    overridden: dict[tuple[int, str], set[str]] = {}
    for family_id, ical_uid, recurrence_id in rows:
        overridden.setdefault((family_id, ical_uid), set()).add(recurrence_id.strftime("%Y-%m-%d"))
    return overridden


def expand_event(
    event,
    range_start: Optional[datetime] = None,
    range_end: Optional[datetime] = None,
    overridden_dates: Optional[OverriddenDates] = None,
) -> list[dict]:
    """Expand a single event into occurrences within the given range.

    For non-recurring events, returns a single-element list if the event
    falls within the range (or always, if no range is given).

    For recurring events, generates virtual occurrences with shifted
    starts_at/ends_at, filtered by excluded_dates and recurrence_end.
    Occurrences listed in ``overridden_dates`` (see
    ``load_overridden_dates``) are skipped, since a changed-occurrence
    row stands in for them.
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
    if overridden_dates and getattr(event, "ical_uid", None):
        excluded |= overridden_dates.get((event.family_id, event.ical_uid), set())
    recurrence_end = event.recurrence_end

    if range_start:
        current = _smart_start(event.starts_at, range_start - duration, recurrence)
    else:
        current = event.starts_at

    occurrences = []
    count = 0

    while count < MAX_OCCURRENCES:
        if recurrence_end and current > recurrence_end:
            break

        if range_end and current >= range_end:
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

        current = _next_occurrence(current, recurrence, anchor=event.starts_at)
        count += 1

    return occurrences
