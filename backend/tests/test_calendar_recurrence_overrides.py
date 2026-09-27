"""Changed occurrences of recurring events (RFC 5545 RECURRENCE-ID).

Calendar feeds such as Google's describe a changed occurrence as a second
VEVENT with the series UID and a RECURRENCE-ID naming the occurrence it
replaces. Tribu stores it as its own row next to the series, shows it in
place of the regular occurrence, and keeps it in sync with the feed
(issue #510).
"""

import hashlib
from datetime import datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import sessionmaker

from app.core.ics_utils import events_to_ics, ics_to_event_dicts
from app.database import Base, get_db
from app.main import app
from app.models import CalendarEvent, CalendarSubscription, Family, Membership, PersonalAccessToken, User
from app.security import hash_password, PAT_PREFIX


engine = create_engine(
    "sqlite:///./test-calendar-recurrence-overrides.db",
    connect_args={"check_same_thread": False},
)
TestSession = sessionmaker(bind=engine, autoflush=False)

FEED_URL = "https://feed.example.com/pack.ics"
SERIES_UID = "pack@google.com"


@event.listens_for(engine, "connect")
def _set_sqlite_pragma(dbapi_conn, _):
    cursor = dbapi_conn.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)

    def _override():
        db = TestSession()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _override
    yield
    app.dependency_overrides.pop(get_db, None)
    Base.metadata.drop_all(bind=engine)


def _seed_adult() -> tuple[str, int]:
    db = TestSession()
    try:
        user = User(email="rid@example.com", password_hash=hash_password("p"), display_name="Rid")
        db.add(user)
        db.flush()
        family = Family(name="Rid Family")
        db.add(family)
        db.flush()
        db.add(Membership(user_id=user.id, family_id=family.id, role="admin", is_adult=True))
        plain = f"{PAT_PREFIX}rid-rw"
        digest = hashlib.sha256(plain.encode("utf-8")).hexdigest()
        db.add(PersonalAccessToken(
            user_id=user.id,
            name="rid-pat",
            token_hash=digest,
            token_lookup=digest,
            scopes="calendar:read,calendar:write",
        ))
        db.commit()
        return plain, family.id
    finally:
        db.close()


@pytest.fixture
def app_tz(monkeypatch):
    """Switch Tribu's time zone; app_timezone() caches the TZ lookup."""
    from app.core.clock import app_timezone

    def _set(name: str) -> None:
        monkeypatch.setenv("TZ", name)
        app_timezone.cache_clear()

    yield _set
    app_timezone.cache_clear()


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _calendar(*vevents: str) -> str:
    return "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Test//EN\r\n" + "".join(vevents) + "END:VCALENDAR\r\n"


def _vevent(*lines: str) -> str:
    return "BEGIN:VEVENT\r\n" + "".join(f"{line}\r\n" for line in lines) + "END:VEVENT\r\n"


SERIES = _vevent(
    f"UID:{SERIES_UID}",
    "SEQUENCE:1",
    "SUMMARY:Pack Meeting",
    "DTSTART:20261008T184500",
    "DTEND:20261008T200000",
    "RRULE:FREQ=WEEKLY;UNTIL=20261231T000000",
)
BOWLING = _vevent(
    f"UID:{SERIES_UID}",
    "RECURRENCE-ID:20261015T184500",
    "SEQUENCE:2",
    "SUMMARY:Bowling Outing",
    "DTSTART:20261016T180000",
    "DTEND:20261016T200000",
)
DINNER = _vevent(
    f"UID:{SERIES_UID}",
    "RECURRENCE-ID:20261022T184500",
    "SEQUENCE:3",
    "SUMMARY:Dinner",
    "DTSTART:20261022T183000",
    "DTEND:20261022T200000",
)


def _patch_fetch(monkeypatch, ics_text: str):
    from app.modules import calendar_router as router_mod

    monkeypatch.setattr(router_mod, "fetch_ics_text", lambda url, **kw: ics_text)


def _subscribe(client: TestClient, token: str, family_id: int) -> dict:
    resp = client.post(
        "/calendar/subscriptions",
        json={"family_id": family_id, "source_url": FEED_URL, "source_name": "Pack"},
        headers=_auth(token),
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


def _titles_between(client: TestClient, token: str, family_id: int, start: str, end: str) -> list[tuple[str, str]]:
    resp = client.get(
        "/calendar/events",
        params={"family_id": family_id, "range_start": start, "range_end": end, "limit": 200},
        headers=_auth(token),
    )
    assert resp.status_code == 200, resp.text
    return [(item["starts_at"][:10], item["title"]) for item in resp.json()["items"]]


def _rows() -> list[CalendarEvent]:
    db = TestSession()
    try:
        return db.query(CalendarEvent).order_by(CalendarEvent.id).all()
    finally:
        db.close()


class TestParser:
    def test_changed_occurrence_carries_recurrence_id(self):
        valid, errors = ics_to_event_dicts(_calendar(SERIES, BOWLING), 1, 1)

        assert errors == []
        series, bowling = valid
        assert series["recurrence_id"] is None
        assert series["recurrence"] == "weekly"
        assert bowling["ical_uid"] == SERIES_UID
        assert bowling["recurrence_id"] == datetime(2026, 10, 15, 18, 45)
        assert bowling["recurrence"] is None

    def test_changed_occurrence_ignores_its_own_rrule(self):
        occurrence = BOWLING.replace("SEQUENCE:2\r\n", "SEQUENCE:2\r\nRRULE:FREQ=DAILY\r\n")
        valid, _ = ics_to_event_dicts(_calendar(SERIES, occurrence), 1, 1)

        assert valid[1]["recurrence"] is None

    def test_cancelled_occurrence_is_excluded_from_its_series(self):
        cancelled = _vevent(
            f"UID:{SERIES_UID}",
            "RECURRENCE-ID:20261029T184500",
            "STATUS:CANCELLED",
            "DTSTART:20261029T184500",
        )
        valid, errors = ics_to_event_dicts(_calendar(cancelled, SERIES), 1, 1)

        assert errors == []
        assert len(valid) == 1
        assert valid[0]["excluded_dates"] == ["2026-10-29"]

    def test_repeated_vevent_keeps_highest_sequence(self):
        newer = BOWLING.replace("SEQUENCE:2", "SEQUENCE:5").replace("Bowling Outing", "Bowling (moved)")
        valid, _ = ics_to_event_dicts(_calendar(SERIES, newer, BOWLING), 1, 1)

        assert [d["title"] for d in valid] == ["Pack Meeting", "Bowling (moved)"]

    def test_export_writes_recurrence_id(self):
        valid, _ = ics_to_event_dicts(_calendar(SERIES, BOWLING), 1, 1)
        rows = [CalendarEvent(id=index + 1, **d) for index, d in enumerate(valid)]

        ics = events_to_ics(rows)

        assert ics.count(f"UID:{SERIES_UID}") == 2
        assert "RECURRENCE-ID:20261015T184500" in ics


class TestSubscriptionImport:
    def test_feed_with_changed_occurrences_imports_all_of_them(self, monkeypatch):
        token, family_id = _seed_adult()
        _patch_fetch(monkeypatch, _calendar(SERIES, BOWLING, DINNER))
        client = TestClient(app)

        subscription = _subscribe(client, token, family_id)

        assert subscription["last_sync_status"] == "success"
        assert subscription["last_created"] == 3
        rows = _rows()
        assert [(r.title, r.recurrence_id) for r in rows] == [
            ("Pack Meeting", None),
            ("Bowling Outing", datetime(2026, 10, 15, 18, 45)),
            ("Dinner", datetime(2026, 10, 22, 18, 45)),
        ]
        assert all(r.subscription_id == subscription["id"] for r in rows)

    def test_changed_occurrence_replaces_the_regular_one(self, monkeypatch):
        token, family_id = _seed_adult()
        _patch_fetch(monkeypatch, _calendar(SERIES, BOWLING, DINNER))
        client = TestClient(app)
        _subscribe(client, token, family_id)

        titles = _titles_between(client, token, family_id, "2026-10-05T00:00:00", "2026-10-31T00:00:00")

        assert titles == [
            ("2026-10-08", "Pack Meeting"),
            ("2026-10-16", "Bowling Outing"),
            ("2026-10-22", "Dinner"),
            ("2026-10-29", "Pack Meeting"),
        ]

    def test_moved_occurrence_is_hidden_even_outside_the_range_it_moved_to(self, monkeypatch):
        token, family_id = _seed_adult()
        far_away = BOWLING.replace("DTSTART:20261016T180000", "DTSTART:20261120T180000").replace(
            "DTEND:20261016T200000", "DTEND:20261120T200000"
        )
        _patch_fetch(monkeypatch, _calendar(SERIES, far_away))
        client = TestClient(app)
        _subscribe(client, token, family_id)

        titles = _titles_between(client, token, family_id, "2026-10-12T00:00:00", "2026-10-19T00:00:00")

        assert titles == []

    def test_refresh_removes_occurrences_the_feed_no_longer_changes(self, monkeypatch):
        token, family_id = _seed_adult()
        _patch_fetch(monkeypatch, _calendar(SERIES, BOWLING, DINNER))
        client = TestClient(app)
        subscription = _subscribe(client, token, family_id)

        _patch_fetch(monkeypatch, _calendar(SERIES, DINNER.replace("Dinner", "Dinner out")))
        resp = client.post(f"/calendar/subscriptions/{subscription['id']}/refresh", headers=_auth(token))

        assert resp.status_code == 200, resp.text
        assert resp.json()["last_sync_status"] == "success"
        assert [r.title for r in _rows()] == ["Pack Meeting", "Dinner out"]
        titles = _titles_between(client, token, family_id, "2026-10-12T00:00:00", "2026-10-19T00:00:00")
        assert titles == [("2026-10-15", "Pack Meeting")]

    def test_changed_occurrence_does_not_attach_to_another_sources_series(self, monkeypatch):
        token, family_id = _seed_adult()
        db = TestSession()
        db.add(CalendarEvent(
            family_id=family_id,
            title="Local series",
            starts_at=datetime(2026, 10, 8, 18, 45),
            recurrence="weekly",
            ical_uid=SERIES_UID,
            source_type="local",
        ))
        db.commit()
        db.close()
        _patch_fetch(monkeypatch, _calendar(BOWLING))
        client = TestClient(app)

        subscription = _subscribe(client, token, family_id)

        assert subscription["last_skipped"] == 1
        assert [r.title for r in _rows()] == ["Local series"]
        titles = _titles_between(client, token, family_id, "2026-10-12T00:00:00", "2026-10-19T00:00:00")
        assert titles == [("2026-10-15", "Local series")]

    def test_manual_import_stores_changed_occurrences(self):
        token, family_id = _seed_adult()
        client = TestClient(app)

        resp = client.post(
            "/calendar/events/import-ics",
            json={"family_id": family_id, "ics_text": _calendar(SERIES, BOWLING)},
            headers=_auth(token),
        )
        again = client.post(
            "/calendar/events/import-ics",
            json={"family_id": family_id, "ics_text": _calendar(SERIES, BOWLING)},
            headers=_auth(token),
        )

        assert resp.json()["created"] == 2
        assert again.json()["updated"] == 2
        assert len(_rows()) == 2

    def test_preview_counts_changed_occurrences_as_updates_after_import(self, monkeypatch):
        token, family_id = _seed_adult()
        _patch_fetch(monkeypatch, _calendar(SERIES, BOWLING))
        client = TestClient(app)
        _subscribe(client, token, family_id)

        resp = client.post(
            "/calendar/events/subscribe-ics/preview",
            json={"family_id": family_id, "source_url": FEED_URL},
            headers=_auth(token),
        )

        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert (body["would_create"], body["would_update"], body["would_skip"]) == (0, 2, 0)

    def test_storage_failure_is_recorded_instead_of_a_500(self, monkeypatch):
        token, family_id = _seed_adult()
        _patch_fetch(monkeypatch, _calendar(SERIES))
        from app.modules import calendar_router as router_mod

        def _fail(*args, **kwargs):
            raise IntegrityError("INSERT", {}, Exception("duplicate key"))

        monkeypatch.setattr(router_mod, "_apply_ics_events", _fail)
        client = TestClient(app)

        subscription = _subscribe(client, token, family_id)

        assert subscription["last_sync_status"] == "failed"
        assert subscription["last_sync_error"] == "Could not store the feed's events"
        assert subscription["sync_history"][0]["status"] == "failed"
        assert _rows() == []
        db = TestSession()
        assert db.query(CalendarSubscription).count() == 1
        db.close()


class TestDeleting:
    def _import(self, client: TestClient, token: str, family_id: int):
        resp = client.post(
            "/calendar/events/import-ics",
            json={"family_id": family_id, "ics_text": _calendar(SERIES, BOWLING)},
            headers=_auth(token),
        )
        assert resp.status_code == 200, resp.text

    def test_deleting_a_changed_occurrence_cancels_it(self):
        token, family_id = _seed_adult()
        client = TestClient(app)
        self._import(client, token, family_id)
        bowling = next(r for r in _rows() if r.recurrence_id is not None)

        resp = client.delete(f"/calendar/events/{bowling.id}", headers=_auth(token))

        assert resp.status_code == 200, resp.text
        rows = _rows()
        assert [r.title for r in rows] == ["Pack Meeting"]
        assert rows[0].excluded_dates == ["2026-10-15"]
        assert _titles_between(client, token, family_id, "2026-10-12T00:00:00", "2026-10-19T00:00:00") == []

    def test_deleting_the_series_deletes_its_changed_occurrences(self):
        token, family_id = _seed_adult()
        client = TestClient(app)
        self._import(client, token, family_id)
        series = next(r for r in _rows() if r.recurrence_id is None)

        resp = client.delete(f"/calendar/events/{series.id}", headers=_auth(token))

        assert resp.status_code == 200, resp.text
        assert _rows() == []


class TestUniqueness:
    def test_series_uid_stays_unique_per_family(self):
        _, family_id = _seed_adult()
        db = TestSession()
        try:
            for title in ("One", "Two"):
                db.add(CalendarEvent(family_id=family_id, title=title, starts_at=datetime(2026, 1, 1), ical_uid="same@example.com"))
            with pytest.raises(IntegrityError):
                db.commit()
        finally:
            db.close()

    def test_changed_occurrence_is_unique_per_recurrence_id(self):
        _, family_id = _seed_adult()
        db = TestSession()
        try:
            for title in ("One", "Two"):
                db.add(CalendarEvent(
                    family_id=family_id,
                    title=title,
                    starts_at=datetime(2026, 1, 1),
                    ical_uid="same@example.com",
                    recurrence_id=datetime(2026, 1, 1),
                ))
            with pytest.raises(IntegrityError):
                db.commit()
        finally:
            db.close()


def _monthly(rule: str, dtstart: str = "DTSTART:20261008T184500") -> tuple[list[dict], list[dict]]:
    return ics_to_event_dicts(
        _calendar(_vevent("UID:m@example.com", "SUMMARY:Monthly", dtstart, f"RRULE:{rule}")), 1, 1
    )


class TestMonthlyByWeekdayImport:
    @pytest.mark.parametrize(
        ("rule", "dtstart", "expected"),
        [
            ("FREQ=MONTHLY;BYDAY=2TH", "DTSTART:20261008T184500", "monthly_weekday"),
            ("FREQ=MONTHLY;BYDAY=+2TH", "DTSTART:20261008T184500", "monthly_weekday"),
            ("FREQ=MONTHLY;BYDAY=TH;BYSETPOS=2", "DTSTART:20261008T184500", "monthly_weekday"),
            ("FREQ=MONTHLY;BYDAY=5TH", "DTSTART:20261029T184500", "monthly_weekday"),
            ("FREQ=MONTHLY;BYDAY=-1TH", "DTSTART:20261029T184500", "monthly_last_weekday"),
            ("FREQ=MONTHLY;BYDAY=-1FR", "DTSTART;VALUE=DATE:20261030", "monthly_last_weekday"),
            ("FREQ=MONTHLY;BYMONTHDAY=8", "DTSTART:20261008T184500", "monthly"),
            ("FREQ=MONTHLY", "DTSTART:20261008T184500", "monthly"),
        ],
    )
    def test_supported_rules(self, rule, dtstart, expected):
        valid, errors = _monthly(rule, dtstart)

        assert errors == []
        assert valid[0]["recurrence"] == expected

    @pytest.mark.parametrize(
        ("rule", "dtstart"),
        [
            ("FREQ=MONTHLY;BYDAY=2TH", "DTSTART:20261015T184500"),  # DTSTART is the 3rd Thursday
            ("FREQ=MONTHLY;BYDAY=2FR", "DTSTART:20261008T184500"),  # DTSTART is a Thursday
            ("FREQ=MONTHLY;BYDAY=-1TH", "DTSTART:20261022T184500"),  # not the last Thursday
            ("FREQ=MONTHLY;BYDAY=TH", "DTSTART:20261008T184500"),  # every Thursday
            ("FREQ=MONTHLY;BYDAY=2TH,4TH", "DTSTART:20261008T184500"),
            ("FREQ=MONTHLY;BYMONTHDAY=9", "DTSTART:20261008T184500"),
            ("FREQ=MONTHLY;BYMONTH=10;BYDAY=2TH", "DTSTART:20261008T184500"),
        ],
    )
    def test_unsupported_rules_import_a_single_event_with_an_error(self, rule, dtstart):
        valid, errors = _monthly(rule, dtstart)

        assert valid[0]["recurrence"] is None
        assert len(errors) == 1
        assert errors[0]["error"].startswith("Unsupported RRULE FREQ=MONTHLY")
        assert errors[0]["error"].endswith("imported without recurrence")

    def test_weekday_rule_that_would_move_to_another_day_is_not_imported_as_series(self, app_tz):
        app_tz("Europe/Berlin")

        valid, errors = _monthly("FREQ=MONTHLY;BYDAY=2TH", "DTSTART;TZID=America/Chicago:20261008T184500")

        # 18:45 in Chicago is 01:45 on Friday in Berlin; the 2nd Thursday rule cannot follow.
        assert valid[0]["starts_at"] == datetime(2026, 10, 9, 1, 45)
        assert valid[0]["recurrence"] is None
        assert len(errors) == 1

    @pytest.mark.parametrize(
        ("recurrence", "starts_at", "rrule"),
        [
            ("monthly_weekday", datetime(2026, 10, 8, 18, 45), "RRULE:FREQ=MONTHLY;BYDAY=2TH"),
            ("monthly_last_weekday", datetime(2026, 10, 30, 9, 0), "RRULE:FREQ=MONTHLY;BYDAY=-1FR"),
        ],
    )
    def test_export_round_trips(self, recurrence, starts_at, rrule):
        event = CalendarEvent(id=1, family_id=1, title="Monthly", starts_at=starts_at, all_day=False, recurrence=recurrence)

        ics = events_to_ics([event])
        valid, errors = ics_to_event_dicts(ics, 1, 1)

        assert rrule in ics
        assert errors == []
        assert valid[0]["recurrence"] == recurrence

    def test_issue_510_feed_shows_every_second_thursday_with_its_changes(self, monkeypatch, app_tz):
        app_tz("America/Chicago")
        token, family_id = _seed_adult()
        _patch_fetch(monkeypatch, _calendar(
            _vevent(
                "DTSTART;TZID=America/Chicago:20261008T184500",
                "DTEND;TZID=America/Chicago:20261008T200000",
                "RRULE:FREQ=MONTHLY;UNTIL=20270613T045959Z;BYDAY=2TH",
                f"UID:{SERIES_UID}",
                "SEQUENCE:1",
                "STATUS:CONFIRMED",
                "SUMMARY:Pack Meeting",
            ),
            _vevent(
                "DTSTART;TZID=America/Chicago:20261208T180000",
                "DTEND;TZID=America/Chicago:20261208T200000",
                f"UID:{SERIES_UID}",
                "RECURRENCE-ID;TZID=America/Chicago:20261210T184500",
                "SEQUENCE:2",
                "STATUS:CONFIRMED",
                "SUMMARY:Bowling Outing",
            ),
            _vevent(
                "DTSTART;TZID=America/Chicago:20270225T183000",
                "DTEND;TZID=America/Chicago:20270225T200000",
                f"UID:{SERIES_UID}",
                "RECURRENCE-ID;TZID=America/Chicago:20270211T184500",
                "SEQUENCE:3",
                "STATUS:CONFIRMED",
                "SUMMARY:Dinner",
            ),
        ))
        client = TestClient(app)

        subscription = _subscribe(client, token, family_id)

        assert subscription["last_sync_status"] == "success", subscription["last_sync_error"]
        assert _titles_between(client, token, family_id, "2026-10-01T00:00:00", "2027-08-01T00:00:00") == [
            ("2026-10-08", "Pack Meeting"),
            ("2026-11-12", "Pack Meeting"),
            ("2026-12-08", "Bowling Outing"),
            ("2027-01-14", "Pack Meeting"),
            ("2027-02-25", "Dinner"),
            ("2027-03-11", "Pack Meeting"),
            ("2027-04-08", "Pack Meeting"),
            ("2027-05-13", "Pack Meeting"),
            ("2027-06-10", "Pack Meeting"),
        ]

    @pytest.mark.parametrize("recurrence", ["monthly_weekday", "monthly_last_weekday"])
    def test_events_can_be_created_with_weekday_rules(self, recurrence):
        token, family_id = _seed_adult()
        client = TestClient(app)

        resp = client.post(
            "/calendar/events",
            json={"family_id": family_id, "title": "Club", "starts_at": "2026-10-29T18:00:00", "recurrence": recurrence},
            headers=_auth(token),
        )

        assert resp.status_code == 200, resp.text
        assert resp.json()["recurrence"] == recurrence
