from datetime import UTC, datetime, timezone, timedelta

from app.core.clock import local_today, local_wall_now, local_wall_to_utc_naive, to_local_wall_naive


def test_local_wall_now_uses_configured_tribu_timezone():
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


def test_local_wall_to_utc_naive_interprets_stored_wall_times_with_dst():
    spring_forward = datetime(2026, 3, 29, 3, 15, 0)
    fall_back = datetime(2026, 10, 25, 3, 0, 0)

    assert local_wall_to_utc_naive(spring_forward).isoformat() == "2026-03-29T01:15:00"
    assert local_wall_to_utc_naive(fall_back).isoformat() == "2026-10-25T02:00:00"
