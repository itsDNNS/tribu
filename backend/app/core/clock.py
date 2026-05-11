import os
from datetime import UTC, date, datetime, time
from functools import lru_cache
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


def utcnow() -> datetime:
    """Return the current UTC instant as a naive datetime for DB audit fields."""
    return datetime.now(UTC).replace(tzinfo=None)


@lru_cache(maxsize=8)
def app_timezone(name: str | None = None) -> ZoneInfo:
    timezone_name = (name or os.getenv("TZ") or "UTC").strip() or "UTC"
    try:
        return ZoneInfo(timezone_name)
    except ZoneInfoNotFoundError:
        return ZoneInfo("UTC")


def _as_utc_aware(value: datetime) -> datetime:
    if value.tzinfo is None or value.utcoffset() is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def local_wall_now(now_utc: datetime | None = None) -> datetime:
    """Return the current Tribu wall-clock time as a naive datetime.

    Calendar and task times are stored as local wall-clock values in the DB so
    scheduler comparisons must use the same clock. Audit/log timestamps should
    continue to use utcnow().
    """
    instant = _as_utc_aware(now_utc or utcnow())
    return instant.astimezone(app_timezone()).replace(tzinfo=None)


def local_today(now_utc: datetime | None = None) -> date:
    return local_wall_now(now_utc).date()


def to_local_wall_naive(value: datetime | None) -> datetime | None:
    """Normalize API/import datetimes into Tribu's local wall-clock storage.

    Naive values are already local wall-clock times and are preserved. Aware
    values are converted to the configured Tribu timezone before tzinfo is
    stripped so a UTC instant such as 07:15Z is stored as 09:15 in Berlin.
    """
    if value is None:
        return None
    if value.tzinfo is None or value.utcoffset() is None:
        return value
    return value.astimezone(app_timezone()).replace(tzinfo=None)


def local_wall_to_utc_naive(value: datetime) -> datetime:
    """Interpret a stored local wall-clock value as a naive UTC instant."""
    if value.tzinfo is not None and value.utcoffset() is not None:
        return value.astimezone(UTC).replace(tzinfo=None)
    return value.replace(tzinfo=app_timezone()).astimezone(UTC).replace(tzinfo=None)


def local_day_bounds_as_utc_naive(day: date) -> tuple[datetime, datetime]:
    tz = app_timezone()
    start_local = datetime.combine(day, time.min, tzinfo=tz)
    end_local = datetime.combine(day, time.max, tzinfo=tz)
    return (
        start_local.astimezone(UTC).replace(tzinfo=None),
        end_local.astimezone(UTC).replace(tzinfo=None),
    )
