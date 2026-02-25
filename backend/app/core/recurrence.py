"""Recurrence expansion for calendar events.

Given a recurring CalendarEvent and a date range, expand_event() yields
virtual occurrence dicts with shifted starts_at / ends_at values.
"""

from datetime import datetime, timedelta
from typing import Optional

from dateutil.relativedelta import relativedelta

VALID_RECURRENCES = {"daily", "weekly", "biweekly", "monthly", "yearly"}
MAX_OCCURRENCES = 500


def _next_occurrence(dt: datetime, recurrence: str) -> datetime:
    if recurrence == "daily":
        return dt + timedelta(days=1)
    if recurrence == "weekly":
        return dt + timedelta(weeks=1)
    if recurrence == "biweekly":
        return dt + timedelta(weeks=2)
    if recurrence == "monthly":
        return dt + relativedelta(months=1)
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
    if recurrence == "monthly":
        return timedelta(days=28)
    if recurrence == "yearly":
        return timedelta(days=365)
    return timedelta(days=1)


def _smart_start(starts_at: datetime, range_start: datetime, recurrence: str) -> datetime:
    """Jump close to range_start instead of iterating from the beginning."""
    if starts_at >= range_start:
        return starts_at

    diff = range_start - starts_at
    step = _step_size(recurrence)
    if step.total_seconds() <= 0:
        return starts_at

    # Jump to N-1 steps before range_start to avoid overshooting with monthly/yearly
    n_steps = max(0, int(diff / step) - 1)
    if n_steps <= 0:
        return starts_at

    if recurrence == "daily":
        return starts_at + timedelta(days=n_steps)
    if recurrence == "weekly":
        return starts_at + timedelta(weeks=n_steps)
    if recurrence == "biweekly":
        return starts_at + timedelta(weeks=2 * n_steps)
    if recurrence == "monthly":
        return starts_at + relativedelta(months=n_steps)
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
        "starts_at": event.starts_at,
        "ends_at": event.ends_at,
        "all_day": event.all_day,
        "recurrence": event.recurrence,
        "recurrence_end": event.recurrence_end,
        "assigned_to": event.assigned_to,
        "created_by_user_id": event.created_by_user_id,
        "created_at": event.created_at,
    }


def expand_event(
    event,
    range_start: Optional[datetime] = None,
    range_end: Optional[datetime] = None,
) -> list[dict]:
    """Expand a single event into occurrences within the given range.

    For non-recurring events, returns a single-element list if the event
    falls within the range (or always, if no range is given).

    For recurring events, generates virtual occurrences with shifted
    starts_at/ends_at, filtered by excluded_dates and recurrence_end.
    """
    base = _event_to_dict(event)
    recurrence = event.recurrence

    if not recurrence:
        # Non-recurring: check if it falls in range
        if range_start and event.starts_at < range_start:
            if not event.ends_at or event.ends_at < range_start:
                return []
        if range_end and event.starts_at >= range_end:
            return []
        base["is_recurring"] = False
        base["occurrence_date"] = None
        return [base]

    # Recurring event expansion
    duration = timedelta(0)
    if event.ends_at and event.starts_at:
        duration = event.ends_at - event.starts_at

    excluded = set(event.excluded_dates or [])
    recurrence_end = event.recurrence_end

    # Smart start: jump close to range_start
    if range_start:
        current = _smart_start(event.starts_at, range_start, recurrence)
    else:
        current = event.starts_at

    occurrences = []
    count = 0

    while count < MAX_OCCURRENCES:
        # Respect recurrence_end
        if recurrence_end and current > recurrence_end:
            break
        # Past range_end — done
        if range_end and current >= range_end:
            break

        occurrence_date = current.strftime("%Y-%m-%d")

        # Check if in range and not excluded
        in_range = True
        if range_start and current < range_start:
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

        current = _next_occurrence(current, recurrence)
        count += 1

    return occurrences
