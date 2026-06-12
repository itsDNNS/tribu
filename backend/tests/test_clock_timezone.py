from datetime import UTC, datetime, timezone, timedelta

import pytest

from app.core.clock import (
    app_timezone,
    local_today,
    local_wall_now,
    local_wall_to_utc_naive,
    to_local_wall_naive,
    to_utc_aware,
    to_utc_naive,
    utcnow_aware,
)


@pytest.fixture(autouse=True)
def configured_timezone(monkeypatch):
    monkeypatch.setenv("TZ", "Europe/Berlin")
    app_timezone.cache_clear()
    yield
    app_timezone.cache_clear()


def test_app_timezone_uses_standard_tz_environment_variable(monkeypatch):
    monkeypatch.setenv("TZ", "America/New_York")
    app_timezone.cache_clear()

    assert app_timezone().key == "America/New_York"


def test_app_timezone_falls_back_to_utc_without_tz(monkeypatch):
    monkeypatch.delenv("TZ", raising=False)
    app_timezone.cache_clear()

    assert app_timezone().key == "UTC"


def test_app_timezone_falls_back_to_utc_for_empty_tz(monkeypatch):
    monkeypatch.setenv("TZ", "")
    app_timezone.cache_clear()

    assert app_timezone().key == "UTC"


def test_app_timezone_falls_back_to_utc_for_invalid_tz(monkeypatch):
    monkeypatch.setenv("TZ", "not-a-zone")
    app_timezone.cache_clear()

    assert app_timezone().key == "UTC"


def test_local_wall_now_uses_configured_timezone():
    utc_instant = datetime(2026, 5, 9, 6, 15, 0)

    assert local_wall_now(utc_instant).isoformat() == "2026-05-09T08:15:00"
    assert local_today(utc_instant).isoformat() == "2026-05-09"


def test_to_local_wall_naive_converts_aware_values_before_stripping_timezone():
    aware = datetime(2026, 5, 9, 9, 15, 0, tzinfo=timezone(timedelta(hours=2)))

    converted = to_local_wall_naive(aware)

    assert converted.tzinfo is None
    assert converted.isoformat() == "2026-05-09T09:15:00"


def test_to_local_wall_naive_preserves_naive_values():
    naive = datetime(2026, 5, 9, 9, 15, 0)

    assert to_local_wall_naive(naive) is naive


def test_to_local_wall_naive_converts_utc_values_to_family_wall_time():
    aware_utc = datetime(2026, 5, 9, 7, 15, 0, tzinfo=UTC)

    assert to_local_wall_naive(aware_utc).isoformat() == "2026-05-09T09:15:00"


def test_utcnow_aware_returns_timezone_aware_utc_instant():
    now = utcnow_aware()

    assert now.tzinfo is UTC
    assert now.utcoffset() == timedelta(0)


def test_to_utc_naive_preserves_instant_for_aware_offsets():
    aware = datetime(2026, 5, 9, 9, 15, 0, tzinfo=timezone(timedelta(hours=2)))

    converted = to_utc_naive(aware)

    assert converted.tzinfo is None
    assert converted.isoformat() == "2026-05-09T07:15:00"


def test_to_utc_aware_interprets_naive_values_as_utc():
    naive = datetime(2026, 5, 9, 7, 15, 0)

    converted = to_utc_aware(naive)

    assert converted.tzinfo is UTC
    assert converted.isoformat() == "2026-05-09T07:15:00+00:00"


def test_local_wall_to_utc_naive_interprets_stored_wall_times_with_dst():
    spring_forward = datetime(2026, 3, 29, 3, 15, 0)
    fall_back = datetime(2026, 10, 25, 3, 0, 0)

    assert local_wall_to_utc_naive(spring_forward).isoformat() == "2026-03-29T01:15:00"
    assert local_wall_to_utc_naive(fall_back).isoformat() == "2026-10-25T02:00:00"
