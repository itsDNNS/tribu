"""Allowlisted icons for local calendar events."""

CALENDAR_EVENT_ICONS = {
    "handball",
    "gymnastics",
    "soccer",
    "dentist",
    "doctor",
    "school",
    "daycare",
    "swimming",
    "music",
    "birthday",
    "shopping",
    "meal",
    "playdate",
    "pickup",
    "vacation",
    "household",
    "homework",
    "pet",
    "family_visit",
    "appointment",
}


def normalize_calendar_event_icon(value: str | None) -> str | None:
    """Return a safe event icon key or ``None`` for empty values."""
    if value is None:
        return None
    icon = value.strip()
    if not icon:
        return None
    if icon not in CALENDAR_EVENT_ICONS:
        raise ValueError("Calendar event icon is not supported")
    return icon
