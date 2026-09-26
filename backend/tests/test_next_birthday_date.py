from datetime import date

from app.core.deps import next_birthday_date


def test_upcoming_birthday_stays_in_the_current_year():
    assert next_birthday_date(10, 3, date(2026, 9, 26)) == date(2026, 10, 3)


def test_birthday_today_counts_as_upcoming():
    assert next_birthday_date(9, 26, date(2026, 9, 26)) == date(2026, 9, 26)


def test_past_birthday_moves_to_next_year():
    assert next_birthday_date(1, 5, date(2026, 9, 26)) == date(2027, 1, 5)


def test_leap_day_birthday_falls_on_28_february_in_common_years():
    assert next_birthday_date(2, 29, date(2026, 1, 10)) == date(2026, 2, 28)
    assert next_birthday_date(2, 29, date(2026, 9, 26)) == date(2027, 2, 28)
    assert next_birthday_date(2, 29, date(2027, 3, 1)) == date(2028, 2, 29)
