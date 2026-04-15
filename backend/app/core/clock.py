from datetime import UTC, datetime


def utcnow() -> datetime:
    """Return current UTC time as a naive datetime (for DB compatibility)."""
    return datetime.now(UTC).replace(tzinfo=None)
