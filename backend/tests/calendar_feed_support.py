"""Shared seeds for the calendar tests: a calendar admin, ICS payloads,
stored events and a stubbed subscription fetch."""

from __future__ import annotations

from datetime import datetime

from app.models import CalendarEvent
from tests.support import TestSession, seed_member


def seed_calendar_admin(**options) -> tuple[str, int]:
    """A family admin with a calendar read/write PAT; returns ``(token, family_id)``."""
    member = seed_member(scopes="calendar:read,calendar:write", role="admin", **options)
    return member.token, member.family_id


def ics_event(*uids: str, summary: str = "Holiday") -> str:
    """A calendar with one VEVENT per UID, each on 2026-03-10 09:00."""
    vevents = "".join(
        "BEGIN:VEVENT\r\n"
        f"SUMMARY:{summary}\r\n"
        "DTSTART:20260310T090000\r\n"
        "DTEND:20260310T093000\r\n"
        "DTSTAMP:20260101T000000\r\n"
        f"UID:{uid}\r\n"
        "END:VEVENT\r\n"
        for uid in uids
    )
    return f"BEGIN:VCALENDAR\r\nVERSION:2.0\r\n{vevents}END:VCALENDAR\r\n"


def seed_calendar_event(family_id: int, title: str, ical_uid: str, **fields) -> None:
    """Commits an event on 2026-03-10 09:00 with the given UID and source fields."""
    with TestSession() as db:
        db.add(CalendarEvent(
            family_id=family_id,
            title=title,
            starts_at=datetime(2026, 3, 10, 9, 0),
            ical_uid=ical_uid,
            **fields,
        ))
        db.commit()


def patch_ics_fetch(monkeypatch, fetch) -> None:
    """Replaces the network fetch the calendar router uses for ICS feeds."""
    from app.modules import calendar_router as router_mod

    monkeypatch.setattr(router_mod, "fetch_ics_text", fetch)


def events_with_uid(family_id: int, ical_uid: str) -> list[CalendarEvent]:
    """The family's stored events with ``ical_uid`` (detached, attributes loaded)."""
    with TestSession() as db:
        return db.query(CalendarEvent).filter(
            CalendarEvent.family_id == family_id,
            CalendarEvent.ical_uid == ical_uid,
        ).all()


def refuse_fetch(monkeypatch) -> dict:
    """Stubs the ICS fetch with one that must not run; ``["hit"]`` tells whether it did."""
    called = {"hit": False}

    def _should_not_be_called(url, **kwargs):
        called["hit"] = True
        return ""

    patch_ics_fetch(monkeypatch, _should_not_be_called)
    return called
