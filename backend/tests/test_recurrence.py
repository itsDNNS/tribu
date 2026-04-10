"""Tests for calendar event recurrence expansion."""

from datetime import datetime, timedelta
from types import SimpleNamespace


from app.core.recurrence import _next_occurrence, expand_event


def make_event(**kwargs):
    """Create a mock event object with sensible defaults."""
    defaults = {
        "id": 1,
        "family_id": 1,
        "title": "Test Event",
        "description": None,
        "starts_at": datetime(2026, 3, 2, 16, 0),  # Monday
        "ends_at": datetime(2026, 3, 2, 17, 0),
        "all_day": False,
        "recurrence": None,
        "recurrence_end": None,
        "excluded_dates": None,
        "created_by_user_id": 1,
        "created_at": datetime(2026, 1, 1),
    }
    defaults.update(kwargs)
    return SimpleNamespace(**defaults)


# --- _next_occurrence ---

class TestNextOccurrence:
    def test_daily(self):
        dt = datetime(2026, 3, 1, 10, 0)
        result = _next_occurrence(dt, "daily")
        assert result == datetime(2026, 3, 2, 10, 0)

    def test_weekly(self):
        dt = datetime(2026, 3, 1, 10, 0)
        result = _next_occurrence(dt, "weekly")
        assert result == datetime(2026, 3, 8, 10, 0)

    def test_biweekly(self):
        dt = datetime(2026, 3, 1, 10, 0)
        result = _next_occurrence(dt, "biweekly")
        assert result == datetime(2026, 3, 15, 10, 0)

    def test_monthly(self):
        dt = datetime(2026, 1, 31, 10, 0)
        result = _next_occurrence(dt, "monthly")
        # dateutil handles Jan 31 + 1 month -> Feb 28
        assert result == datetime(2026, 2, 28, 10, 0)

    def test_yearly(self):
        dt = datetime(2026, 3, 1, 10, 0)
        result = _next_occurrence(dt, "yearly")
        assert result == datetime(2027, 3, 1, 10, 0)


# --- expand_event: non-recurring ---

class TestExpandNonRecurring:
    def test_single_event_in_range(self):
        ev = make_event()
        result = expand_event(ev, datetime(2026, 3, 1), datetime(2026, 3, 31))
        assert len(result) == 1
        assert result[0]["is_recurring"] is False
        assert result[0]["title"] == "Test Event"

    def test_single_event_outside_range(self):
        ev = make_event(starts_at=datetime(2026, 4, 1, 10, 0))
        result = expand_event(ev, datetime(2026, 3, 1), datetime(2026, 3, 31))
        assert len(result) == 0

    def test_single_event_before_range(self):
        ev = make_event(starts_at=datetime(2026, 2, 1, 10, 0), ends_at=datetime(2026, 2, 1, 11, 0))
        result = expand_event(ev, datetime(2026, 3, 1), datetime(2026, 3, 31))
        assert len(result) == 0

    def test_no_range_returns_event(self):
        ev = make_event()
        result = expand_event(ev)
        assert len(result) == 1


# --- expand_event: daily ---

class TestExpandDaily:
    def test_daily_one_week(self):
        ev = make_event(
            recurrence="daily",
            starts_at=datetime(2026, 3, 1, 9, 0),
            ends_at=datetime(2026, 3, 1, 10, 0),
        )
        result = expand_event(ev, datetime(2026, 3, 1), datetime(2026, 3, 8))
        assert len(result) == 7
        dates = [o["occurrence_date"] for o in result]
        assert dates[0] == "2026-03-01"
        assert dates[-1] == "2026-03-07"

    def test_daily_preserves_duration(self):
        ev = make_event(
            recurrence="daily",
            starts_at=datetime(2026, 3, 1, 9, 0),
            ends_at=datetime(2026, 3, 1, 10, 30),
        )
        result = expand_event(ev, datetime(2026, 3, 1), datetime(2026, 3, 3))
        for occ in result:
            duration = occ["ends_at"] - occ["starts_at"]
            assert duration == timedelta(hours=1, minutes=30)


# --- expand_event: weekly ---

class TestExpandWeekly:
    def test_weekly_one_month(self):
        ev = make_event(
            recurrence="weekly",
            starts_at=datetime(2026, 3, 2, 16, 0),  # Monday
            ends_at=datetime(2026, 3, 2, 17, 0),
        )
        result = expand_event(ev, datetime(2026, 3, 1), datetime(2026, 4, 1))
        # March 2026: Mondays are 2, 9, 16, 23, 30
        assert len(result) == 5
        assert all(o["is_recurring"] for o in result)


# --- expand_event: biweekly ---

class TestExpandBiweekly:
    def test_biweekly_two_months(self):
        ev = make_event(
            recurrence="biweekly",
            starts_at=datetime(2026, 3, 4, 7, 0),  # Wednesday
            ends_at=datetime(2026, 3, 4, 7, 30),
        )
        result = expand_event(ev, datetime(2026, 3, 1), datetime(2026, 5, 1))
        # Mar 4, 18, Apr 1, 15, 29 = 5 occurrences
        assert len(result) == 5


# --- expand_event: monthly ---

class TestExpandMonthly:
    def test_monthly_half_year(self):
        ev = make_event(
            recurrence="monthly",
            starts_at=datetime(2026, 1, 15, 10, 0),
            ends_at=datetime(2026, 1, 15, 11, 0),
        )
        result = expand_event(ev, datetime(2026, 1, 1), datetime(2026, 7, 1))
        assert len(result) == 6
        months = [o["starts_at"].month for o in result]
        assert months == [1, 2, 3, 4, 5, 6]

    def test_monthly_end_of_month_edge_case(self):
        """Event on Jan 31 clamps through Feb 28, then stays at 28th due to iterative relativedelta."""
        ev = make_event(
            recurrence="monthly",
            starts_at=datetime(2026, 1, 31, 10, 0),
            ends_at=None,
        )
        result = expand_event(ev, datetime(2026, 1, 1), datetime(2026, 6, 1))
        dates = [o["starts_at"] for o in result]
        assert dates[0] == datetime(2026, 1, 31, 10, 0)
        assert dates[1] == datetime(2026, 2, 28, 10, 0)
        # After clamping to Feb 28, +1 month = Mar 28 (iterative behavior)
        assert dates[2] == datetime(2026, 3, 28, 10, 0)
        assert dates[3] == datetime(2026, 4, 28, 10, 0)
        assert dates[4] == datetime(2026, 5, 28, 10, 0)


# --- expand_event: yearly ---

class TestExpandYearly:
    def test_yearly(self):
        ev = make_event(
            recurrence="yearly",
            starts_at=datetime(2026, 6, 15, 10, 0),
            ends_at=datetime(2026, 6, 15, 11, 0),
        )
        result = expand_event(ev, datetime(2026, 1, 1), datetime(2030, 1, 1))
        assert len(result) == 4
        years = [o["starts_at"].year for o in result]
        assert years == [2026, 2027, 2028, 2029]


# --- excluded_dates ---

class TestExcludedDates:
    def test_excluded_dates_are_skipped(self):
        ev = make_event(
            recurrence="daily",
            starts_at=datetime(2026, 3, 1, 9, 0),
            ends_at=datetime(2026, 3, 1, 10, 0),
            excluded_dates=["2026-03-03", "2026-03-05"],
        )
        result = expand_event(ev, datetime(2026, 3, 1), datetime(2026, 3, 8))
        dates = [o["occurrence_date"] for o in result]
        assert "2026-03-03" not in dates
        assert "2026-03-05" not in dates
        assert len(result) == 5  # 7 days minus 2 excluded


# --- recurrence_end ---

class TestRecurrenceEnd:
    def test_recurrence_end_limits_expansion(self):
        ev = make_event(
            recurrence="daily",
            starts_at=datetime(2026, 3, 1, 9, 0),
            ends_at=datetime(2026, 3, 1, 10, 0),
            recurrence_end=datetime(2026, 3, 4, 23, 59),
        )
        result = expand_event(ev, datetime(2026, 3, 1), datetime(2026, 3, 31))
        assert len(result) == 4  # Mar 1, 2, 3, 4

    def test_recurrence_end_before_range(self):
        ev = make_event(
            recurrence="weekly",
            starts_at=datetime(2026, 1, 5, 10, 0),
            ends_at=datetime(2026, 1, 5, 11, 0),
            recurrence_end=datetime(2026, 2, 1),
        )
        result = expand_event(ev, datetime(2026, 3, 1), datetime(2026, 4, 1))
        assert len(result) == 0


# --- Smart start optimization ---

class TestSmartStart:
    def test_smart_start_doesnt_miss_events(self):
        """Event started years ago, smart start should still find current occurrences."""
        ev = make_event(
            recurrence="daily",
            starts_at=datetime(2020, 1, 1, 9, 0),
            ends_at=datetime(2020, 1, 1, 10, 0),
        )
        result = expand_event(ev, datetime(2026, 3, 1), datetime(2026, 3, 4))
        assert len(result) == 3
        assert result[0]["occurrence_date"] == "2026-03-01"

    def test_smart_start_weekly(self):
        """Weekly event from years ago expands correctly in current range."""
        ev = make_event(
            recurrence="weekly",
            starts_at=datetime(2020, 1, 6, 16, 0),  # Monday
            ends_at=datetime(2020, 1, 6, 17, 0),
        )
        result = expand_event(ev, datetime(2026, 3, 1), datetime(2026, 4, 1))
        assert len(result) >= 4
        # All should be Mondays
        for occ in result:
            assert occ["starts_at"].weekday() == 0


# --- Occurrence metadata ---

class TestOccurrenceMetadata:
    def test_occurrence_has_correct_fields(self):
        ev = make_event(
            recurrence="weekly",
            starts_at=datetime(2026, 3, 2, 16, 0),
            ends_at=datetime(2026, 3, 2, 17, 0),
        )
        result = expand_event(ev, datetime(2026, 3, 1), datetime(2026, 3, 10))
        assert len(result) >= 1
        occ = result[0]
        assert occ["is_recurring"] is True
        assert occ["occurrence_date"] is not None
        assert occ["id"] == 1
        assert occ["title"] == "Test Event"
        assert occ["family_id"] == 1
