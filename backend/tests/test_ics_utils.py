"""Tests for ICS import/export utilities."""

from datetime import datetime, date
from types import SimpleNamespace

import pytest

from app.core.ics_utils import events_to_ics, ics_to_event_dicts


def make_event(**kwargs):
    """Create a mock CalendarEvent object."""
    defaults = {
        "id": 1,
        "family_id": 1,
        "title": "Team Meeting",
        "description": None,
        "starts_at": datetime(2026, 3, 10, 14, 0),
        "ends_at": datetime(2026, 3, 10, 15, 0),
        "all_day": False,
        "recurrence": None,
        "recurrence_end": None,
        "excluded_dates": None,
        "created_by_user_id": 1,
        "created_at": datetime(2026, 1, 1, 12, 0),
    }
    defaults.update(kwargs)
    return SimpleNamespace(**defaults)


# --- events_to_ics ---

class TestEventsToIcs:
    def test_single_timed_event(self):
        ev = make_event()
        ics = events_to_ics([ev])
        assert "BEGIN:VCALENDAR" in ics
        assert "BEGIN:VEVENT" in ics
        assert "SUMMARY:Team Meeting" in ics
        assert "tribu-event-1@tribu.local" in ics
        assert "END:VCALENDAR" in ics

    def test_all_day_event(self):
        ev = make_event(
            all_day=True,
            starts_at=datetime(2026, 6, 15, 0, 0),
            ends_at=None,
        )
        ics = events_to_ics([ev])
        assert "DTSTART;VALUE=DATE:20260615" in ics
        # All-day DTEND should be start + 1 day (exclusive end)
        assert "DTEND;VALUE=DATE:20260616" in ics

    def test_recurrence_daily(self):
        ev = make_event(recurrence="daily")
        ics = events_to_ics([ev])
        assert "RRULE:FREQ=DAILY" in ics

    def test_recurrence_weekly(self):
        ev = make_event(recurrence="weekly")
        ics = events_to_ics([ev])
        assert "RRULE:FREQ=WEEKLY" in ics

    def test_recurrence_biweekly(self):
        ev = make_event(recurrence="biweekly")
        ics = events_to_ics([ev])
        assert "FREQ=WEEKLY" in ics
        assert "INTERVAL=2" in ics

    def test_recurrence_monthly(self):
        ev = make_event(recurrence="monthly")
        ics = events_to_ics([ev])
        assert "RRULE:FREQ=MONTHLY" in ics

    def test_recurrence_yearly(self):
        ev = make_event(recurrence="yearly")
        ics = events_to_ics([ev])
        assert "RRULE:FREQ=YEARLY" in ics

    def test_recurrence_end_until(self):
        ev = make_event(
            recurrence="weekly",
            recurrence_end=datetime(2026, 6, 30, 23, 59),
        )
        ics = events_to_ics([ev])
        assert "UNTIL=" in ics
        assert "20260630" in ics

    def test_excluded_dates_exdate(self):
        ev = make_event(
            recurrence="daily",
            excluded_dates=["2026-03-12", "2026-03-15"],
        )
        ics = events_to_ics([ev])
        assert "EXDATE" in ics

    def test_description_included(self):
        ev = make_event(description="Important meeting about Q2 goals")
        ics = events_to_ics([ev])
        assert "DESCRIPTION:Important meeting about Q2 goals" in ics

    def test_no_description_when_none(self):
        ev = make_event(description=None)
        ics = events_to_ics([ev])
        assert "DESCRIPTION" not in ics

    def test_prodid_and_version(self):
        ics = events_to_ics([make_event()])
        assert "-//Tribu//Family Calendar//EN" in ics
        assert "VERSION:2.0" in ics

    def test_multiple_events(self):
        events = [
            make_event(id=1, title="Event A"),
            make_event(id=2, title="Event B"),
            make_event(id=3, title="Event C"),
        ]
        ics = events_to_ics(events)
        assert ics.count("BEGIN:VEVENT") == 3
        assert "Event A" in ics
        assert "Event B" in ics
        assert "Event C" in ics


# --- ics_to_event_dicts ---

class TestIcsToEventDicts:
    def test_valid_timed_event(self):
        ics = (
            "BEGIN:VCALENDAR\r\n"
            "VERSION:2.0\r\n"
            "BEGIN:VEVENT\r\n"
            "SUMMARY:Standup\r\n"
            "DTSTART:20260310T090000\r\n"
            "DTEND:20260310T093000\r\n"
            "DTSTAMP:20260101T000000\r\n"
            "UID:test-1@example.com\r\n"
            "END:VEVENT\r\n"
            "END:VCALENDAR\r\n"
        )
        valid, errors = ics_to_event_dicts(ics, family_id=5, user_id=10)
        assert len(valid) == 1
        assert valid[0]["title"] == "Standup"
        assert valid[0]["family_id"] == 5
        assert valid[0]["created_by_user_id"] == 10
        assert valid[0]["all_day"] is False
        assert valid[0]["starts_at"] == datetime(2026, 3, 10, 9, 0)
        assert valid[0]["ends_at"] == datetime(2026, 3, 10, 9, 30)

    def test_all_day_event(self):
        ics = (
            "BEGIN:VCALENDAR\r\n"
            "VERSION:2.0\r\n"
            "BEGIN:VEVENT\r\n"
            "SUMMARY:Holiday\r\n"
            "DTSTART;VALUE=DATE:20260615\r\n"
            "DTEND;VALUE=DATE:20260616\r\n"
            "DTSTAMP:20260101T000000\r\n"
            "UID:test-2@example.com\r\n"
            "END:VEVENT\r\n"
            "END:VCALENDAR\r\n"
        )
        valid, errors = ics_to_event_dicts(ics, family_id=1, user_id=1)
        assert len(valid) == 1
        assert valid[0]["all_day"] is True
        assert valid[0]["starts_at"] == datetime(2026, 6, 15)
        assert valid[0]["ends_at"] is None  # All-day: no ends_at stored

    def test_rrule_weekly(self):
        ics = (
            "BEGIN:VCALENDAR\r\n"
            "VERSION:2.0\r\n"
            "BEGIN:VEVENT\r\n"
            "SUMMARY:Weekly Sync\r\n"
            "DTSTART:20260302T160000\r\n"
            "DTSTAMP:20260101T000000\r\n"
            "RRULE:FREQ=WEEKLY\r\n"
            "UID:test-3@example.com\r\n"
            "END:VEVENT\r\n"
            "END:VCALENDAR\r\n"
        )
        valid, errors = ics_to_event_dicts(ics, family_id=1, user_id=1)
        assert len(valid) == 1
        assert valid[0]["recurrence"] == "weekly"

    def test_rrule_biweekly(self):
        ics = (
            "BEGIN:VCALENDAR\r\n"
            "VERSION:2.0\r\n"
            "BEGIN:VEVENT\r\n"
            "SUMMARY:Biweekly\r\n"
            "DTSTART:20260302T160000\r\n"
            "DTSTAMP:20260101T000000\r\n"
            "RRULE:FREQ=WEEKLY;INTERVAL=2\r\n"
            "UID:test-4@example.com\r\n"
            "END:VEVENT\r\n"
            "END:VCALENDAR\r\n"
        )
        valid, errors = ics_to_event_dicts(ics, family_id=1, user_id=1)
        assert len(valid) == 1
        assert valid[0]["recurrence"] == "biweekly"

    def test_rrule_until(self):
        ics = (
            "BEGIN:VCALENDAR\r\n"
            "VERSION:2.0\r\n"
            "BEGIN:VEVENT\r\n"
            "SUMMARY:Limited\r\n"
            "DTSTART:20260302T100000\r\n"
            "DTSTAMP:20260101T000000\r\n"
            "RRULE:FREQ=DAILY;UNTIL=20260310\r\n"
            "UID:test-5@example.com\r\n"
            "END:VEVENT\r\n"
            "END:VCALENDAR\r\n"
        )
        valid, errors = ics_to_event_dicts(ics, family_id=1, user_id=1)
        assert len(valid) == 1
        assert valid[0]["recurrence"] == "daily"
        assert valid[0]["recurrence_end"] == datetime(2026, 3, 10)

    def test_exdate_parsing(self):
        ics = (
            "BEGIN:VCALENDAR\r\n"
            "VERSION:2.0\r\n"
            "BEGIN:VEVENT\r\n"
            "SUMMARY:With Exclusions\r\n"
            "DTSTART:20260302T100000\r\n"
            "DTSTAMP:20260101T000000\r\n"
            "RRULE:FREQ=DAILY\r\n"
            "EXDATE;VALUE=DATE:20260305\r\n"
            "UID:test-6@example.com\r\n"
            "END:VEVENT\r\n"
            "END:VCALENDAR\r\n"
        )
        valid, errors = ics_to_event_dicts(ics, family_id=1, user_id=1)
        assert len(valid) == 1
        assert "2026-03-05" in valid[0]["excluded_dates"]

    def test_missing_summary_error(self):
        ics = (
            "BEGIN:VCALENDAR\r\n"
            "VERSION:2.0\r\n"
            "BEGIN:VEVENT\r\n"
            "DTSTART:20260302T100000\r\n"
            "DTSTAMP:20260101T000000\r\n"
            "UID:test-7@example.com\r\n"
            "END:VEVENT\r\n"
            "END:VCALENDAR\r\n"
        )
        valid, errors = ics_to_event_dicts(ics, family_id=1, user_id=1)
        assert len(valid) == 0
        assert len(errors) == 1
        assert "SUMMARY" in errors[0]["error"]

    def test_missing_dtstart_error(self):
        ics = (
            "BEGIN:VCALENDAR\r\n"
            "VERSION:2.0\r\n"
            "BEGIN:VEVENT\r\n"
            "SUMMARY:No Start\r\n"
            "DTSTAMP:20260101T000000\r\n"
            "UID:test-8@example.com\r\n"
            "END:VEVENT\r\n"
            "END:VCALENDAR\r\n"
        )
        valid, errors = ics_to_event_dicts(ics, family_id=1, user_id=1)
        assert len(valid) == 0
        assert len(errors) == 1
        assert "DTSTART" in errors[0]["error"]

    def test_unsupported_rrule_freq_warning(self):
        ics = (
            "BEGIN:VCALENDAR\r\n"
            "VERSION:2.0\r\n"
            "BEGIN:VEVENT\r\n"
            "SUMMARY:Secondly\r\n"
            "DTSTART:20260302T100000\r\n"
            "DTSTAMP:20260101T000000\r\n"
            "RRULE:FREQ=SECONDLY\r\n"
            "UID:test-9@example.com\r\n"
            "END:VEVENT\r\n"
            "END:VCALENDAR\r\n"
        )
        valid, errors = ics_to_event_dicts(ics, family_id=1, user_id=1)
        assert len(valid) == 1
        assert valid[0]["recurrence"] is None
        assert any("Unsupported" in e["error"] for e in errors)

    def test_invalid_ics_data(self):
        valid, errors = ics_to_event_dicts("not valid ics at all", family_id=1, user_id=1)
        assert len(valid) == 0
        assert len(errors) == 1
        assert "Invalid ICS" in errors[0]["error"]

    def test_roundtrip(self):
        """Export events to ICS, then re-import. Core fields should match."""
        events = [
            make_event(id=1, title="Daily Standup", recurrence="daily", description="Morning sync"),
            make_event(id=2, title="All Day", all_day=True, starts_at=datetime(2026, 5, 1, 0, 0), ends_at=None, recurrence=None),
            make_event(id=3, title="Biweekly", recurrence="biweekly", recurrence_end=datetime(2026, 12, 31)),
        ]
        ics_text = events_to_ics(events)
        valid, errors = ics_to_event_dicts(ics_text, family_id=99, user_id=42)

        assert len(valid) == 3
        titles = {e["title"] for e in valid}
        assert titles == {"Daily Standup", "All Day", "Biweekly"}

        daily = next(e for e in valid if e["title"] == "Daily Standup")
        assert daily["recurrence"] == "daily"
        assert daily["description"] == "Morning sync"

        allday = next(e for e in valid if e["title"] == "All Day")
        assert allday["all_day"] is True

        biweekly = next(e for e in valid if e["title"] == "Biweekly")
        assert biweekly["recurrence"] == "biweekly"
        assert biweekly["recurrence_end"] is not None
