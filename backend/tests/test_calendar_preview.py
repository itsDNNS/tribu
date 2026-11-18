"""Tests for the calendar import/subscription preview endpoints.

The preview endpoints classify what an apply call *would* do without
mutating the database. They mirror the auth + URL safety rules of the
apply endpoints and return ``would_create`` / ``would_update`` /
``would_skip`` / ``errors`` plus a small ``sample_events`` list.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models import CalendarEvent
from tests.calendar_feed_support import (
    events_with_uid,
    ics_event,
    patch_ics_fetch,
    refuse_fetch,
    seed_calendar_admin,
    seed_calendar_event,
)
from tests.support import TestSession, auth


pytestmark = pytest.mark.usefixtures("app_db")

client = TestClient(app)


# --- import preview --------------------------------------------------------


class TestImportPreviewClassifies:
    def test_new_uid_counts_as_would_create_without_inserting(self):
        token, family_id = seed_calendar_admin()

        resp = client.post(
            "/calendar/events/import-ics/preview",
            json={
                "family_id": family_id,
                "ics_text": ics_event("evt-new@example.com", summary="New"),
                "source_name": "Team feed",
            },
            headers=auth(token),
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["would_create"] == 1
        assert body["would_update"] == 0
        assert body["would_skip"] == 0
        assert body["errors"] == []

        db = TestSession()
        try:
            assert db.query(CalendarEvent).count() == 0
        finally:
            db.close()

    def test_existing_imported_uid_counts_as_would_update(self):
        token, family_id = seed_calendar_admin()

        seed_calendar_event(family_id, "Old title", "evt-1@example.com", source_type="import", source_name="Team feed")

        resp = client.post(
            "/calendar/events/import-ics/preview",
            json={
                "family_id": family_id,
                "ics_text": ics_event("evt-1@example.com", summary="Renamed"),
                "source_name": "Team feed",
            },
            headers=auth(token),
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["would_create"] == 0
        assert body["would_update"] == 1
        assert body["would_skip"] == 0

        [row] = events_with_uid(family_id, "evt-1@example.com")
        # Preview must not mutate the existing row.
        assert row.title == "Old title"

    def test_uid_collision_with_local_event_counts_as_would_skip(self):
        token, family_id = seed_calendar_admin()

        seed_calendar_event(family_id, "Local copy", "shared@example.com", source_type="local")

        resp = client.post(
            "/calendar/events/import-ics/preview",
            json={
                "family_id": family_id,
                "ics_text": ics_event("shared@example.com", summary="External"),
            },
            headers=auth(token),
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["would_create"] == 0
        assert body["would_update"] == 0
        assert body["would_skip"] == 1
        assert body["errors"]
        assert "non-imported" in body["errors"][0]["error"]

    def test_non_adult_member_is_forbidden(self):
        token, family_id = seed_calendar_admin(is_adult=False)
        resp = client.post(
            "/calendar/events/import-ics/preview",
            json={"family_id": family_id, "ics_text": ics_event("evt@example.com")},
            headers=auth(token),
        )
        assert resp.status_code == 403, resp.text

    def test_sample_events_capped_and_safe(self):
        token, family_id = seed_calendar_admin()

        # Build an ICS with a handful of distinct VEVENTs.
        vevents = "".join(
            (
                "BEGIN:VEVENT\r\n"
                f"SUMMARY:Event {i}\r\n"
                f"DTSTART:202603{10 + i:02d}T090000\r\n"
                "DTEND:20260310T093000\r\n"
                "DTSTAMP:20260101T000000\r\n"
                f"UID:bulk-{i}@example.com\r\n"
                "END:VEVENT\r\n"
            )
            for i in range(15)
        )
        ics_text = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\n" + vevents + "END:VCALENDAR\r\n"

        resp = client.post(
            "/calendar/events/import-ics/preview",
            json={"family_id": family_id, "ics_text": ics_text},
            headers=auth(token),
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["would_create"] == 15

        sample = body.get("sample_events", [])
        assert isinstance(sample, list)
        assert 0 < len(sample) <= 10
        # Only safe summary fields, never raw ICS payload.
        for item in sample:
            assert "title" in item
            assert "outcome" in item
            assert "ics_text" not in item


# --- subscription preview --------------------------------------------------


class TestSubscribePreviewClassifies:
    def test_rejects_non_http_scheme_without_fetching(self, monkeypatch):
        token, family_id = seed_calendar_admin()
        called = refuse_fetch(monkeypatch)
        resp = client.post(
            "/calendar/events/subscribe-ics/preview",
            json={"family_id": family_id, "source_url": "file:///etc/passwd"},
            headers=auth(token),
        )
        assert resp.status_code == 400, resp.text
        assert called["hit"] is False
        assert "/etc/passwd" not in resp.text
        assert "Traceback" not in resp.text

    def test_new_feed_counts_as_would_create_without_inserting(self, monkeypatch):
        token, family_id = seed_calendar_admin()
        patch_ics_fetch(monkeypatch, lambda u, **kw: ics_event("feed-1@example.com"))

        resp = client.post(
            "/calendar/events/subscribe-ics/preview",
            json={
                "family_id": family_id,
                "source_url": "https://feed.example.com/cal.ics",
                "source_name": "Holidays",
            },
            headers=auth(token),
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["would_create"] == 1
        assert body["would_update"] == 0
        assert body["would_skip"] == 0

        db = TestSession()
        try:
            assert db.query(CalendarEvent).count() == 0
        finally:
            db.close()

    def test_same_feed_url_uid_counts_as_would_update(self, monkeypatch):
        token, family_id = seed_calendar_admin()
        url = "https://feed.example.com/cal.ics"

        seed_calendar_event(
            family_id, "Stored", "feed-1@example.com", source_type="subscription", source_url=url, source_name="Holidays",
        )

        patch_ics_fetch(monkeypatch, lambda u, **kw: ics_event("feed-1@example.com", summary="Renamed"))
        resp = client.post(
            "/calendar/events/subscribe-ics/preview",
            json={
                "family_id": family_id,
                "source_url": url,
                "source_name": "Holidays",
            },
            headers=auth(token),
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["would_create"] == 0
        assert body["would_update"] == 1
        assert body["would_skip"] == 0

        [row] = events_with_uid(family_id, "feed-1@example.com")
        assert row.title == "Stored"

    def test_different_feed_url_uid_counts_as_would_skip(self, monkeypatch):
        token, family_id = seed_calendar_admin()

        seed_calendar_event(
            family_id, "Owned by feed A", "dup@example.com",
            source_type="subscription", source_url="https://feed-a.example.com/cal.ics", source_name="Feed A",
        )

        patch_ics_fetch(monkeypatch, lambda u, **kw: ics_event("dup@example.com", summary="From B"))
        resp = client.post(
            "/calendar/events/subscribe-ics/preview",
            json={
                "family_id": family_id,
                "source_url": "https://feed-b.example.com/cal.ics",
                "source_name": "Feed B",
            },
            headers=auth(token),
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["would_create"] == 0
        assert body["would_update"] == 0
        assert body["would_skip"] == 1
        assert body["errors"]
        msg = body["errors"][0]["error"]
        assert "non-subscription" in msg or "different-feed" in msg

    def test_fetch_failure_returns_user_safe_400(self, monkeypatch):
        token, family_id = seed_calendar_admin()

        def _boom(url, **kw):
            raise RuntimeError("internal proxy host unreachable: 10.0.0.5:8080")

        patch_ics_fetch(monkeypatch, _boom)
        resp = client.post(
            "/calendar/events/subscribe-ics/preview",
            json={
                "family_id": family_id,
                "source_url": "https://feed.example.com/cal.ics",
            },
            headers=auth(token),
        )
        assert resp.status_code == 400, resp.text
        assert "10.0.0.5" not in resp.text
        assert "Traceback" not in resp.text
