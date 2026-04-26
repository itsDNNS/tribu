"""Tests for the manual ICS subscription URL endpoint.

The endpoint fetches an external ``.ics`` URL and stores its events as
``source_type="subscription"``. Repeated calls with the same URL refresh
the same rows (matched by VEVENT UID); rows owned by another source
are never overwritten.
"""

import hashlib
import socket

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from app.database import Base, get_db
from app.main import app
from app.models import CalendarEvent, CalendarSubscription, CalendarSubscriptionSync, Family, Membership, PersonalAccessToken, User
from app.security import hash_password, PAT_PREFIX
from app.core.calendar_subscriptions import IcsSubscriptionError, fetch_ics_text


engine = create_engine(
    "sqlite:///./test-calendar-subscriptions.db",
    connect_args={"check_same_thread": False},
)
TestSession = sessionmaker(bind=engine, autoflush=False)


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


def _seed_adult(scopes: str = "calendar:read,calendar:write") -> tuple[str, int]:
    db = TestSession()
    try:
        user = User(email="sub@example.com", password_hash=hash_password("p"), display_name="Sub")
        db.add(user)
        db.flush()
        family = Family(name="Sub Family")
        db.add(family)
        db.flush()
        db.add(Membership(user_id=user.id, family_id=family.id, role="admin", is_adult=True))
        plain = f"{PAT_PREFIX}sub-rw"
        digest = hashlib.sha256(plain.encode("utf-8")).hexdigest()
        db.add(PersonalAccessToken(
            user_id=user.id,
            name="sub-pat",
            token_hash=digest,
            token_lookup=digest,
            scopes=scopes,
        ))
        db.commit()
        return plain, family.id
    finally:
        db.close()


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _ics(uid: str, summary: str = "Holiday", dtstart: str = "20260310T090000") -> str:
    return (
        "BEGIN:VCALENDAR\r\n"
        "VERSION:2.0\r\n"
        "BEGIN:VEVENT\r\n"
        f"SUMMARY:{summary}\r\n"
        f"DTSTART:{dtstart}\r\n"
        "DTEND:20260310T093000\r\n"
        "DTSTAMP:20260101T000000\r\n"
        f"UID:{uid}\r\n"
        "END:VEVENT\r\n"
        "END:VCALENDAR\r\n"
    )


def _patch_fetch(monkeypatch, fn):
    """Replace the network fetch helper at the call site used by the router."""
    from app.modules import calendar_router as router_mod

    monkeypatch.setattr(router_mod, "fetch_ics_text", fn)


# --- URL safety -------------------------------------------------------------


class TestUrlSafety:
    def test_rejects_non_http_scheme(self, monkeypatch):
        token, family_id = _seed_adult()

        called = {"hit": False}

        def _should_not_be_called(url, **kwargs):
            called["hit"] = True
            return ""

        _patch_fetch(monkeypatch, _should_not_be_called)
        client = TestClient(app)
        resp = client.post(
            "/calendar/events/subscribe-ics",
            json={"family_id": family_id, "source_url": "file:///etc/passwd"},
            headers=_auth(token),
        )
        assert resp.status_code == 400, resp.text
        assert called["hit"] is False
        body = resp.json()
        text = repr(body)
        # Should not leak parser/network internals.
        assert "Traceback" not in text
        assert "/etc/passwd" not in text

    def test_rejects_blank_url(self, monkeypatch):
        token, family_id = _seed_adult()
        _patch_fetch(monkeypatch, lambda url, **kw: "")
        client = TestClient(app)
        resp = client.post(
            "/calendar/events/subscribe-ics",
            json={"family_id": family_id, "source_url": "   "},
            headers=_auth(token),
        )
        assert resp.status_code == 400, resp.text


    def test_fetch_rejects_hosts_resolving_to_private_addresses(self, monkeypatch):
        def _private_addrinfo(host, port, type=0):
            return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("127.0.0.1", port or 443))]

        monkeypatch.setattr(socket, "getaddrinfo", _private_addrinfo)

        with pytest.raises(IcsSubscriptionError, match="not allowed"):
            fetch_ics_text("https://feed.example.com/holidays.ics")

    @pytest.mark.parametrize("resolved_ip", ["10.0.0.8", "100.100.100.200", "fec0::1"])
    def test_fetch_rejects_non_public_hosts_before_socket_connect(self, monkeypatch, resolved_ip):
        calls = {"connected": False}

        def _private_addrinfo(host, port, type=0):
            if ":" in resolved_ip:
                return [(socket.AF_INET6, socket.SOCK_STREAM, 6, "", (resolved_ip, port or 443, 0, 0))]
            return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (resolved_ip, port or 443))]

        class _Socket:
            def __init__(self, *args, **kwargs):
                pass
            def settimeout(self, timeout):
                pass
            def connect(self, sockaddr):
                calls["connected"] = True
            def close(self):
                pass

        monkeypatch.setattr(socket, "getaddrinfo", _private_addrinfo)
        monkeypatch.setattr(socket, "socket", _Socket)

        with pytest.raises(IcsSubscriptionError, match="not allowed"):
            fetch_ics_text("https://feed.example.com/holidays.ics")
        assert calls["connected"] is False

    def test_fetch_rejects_all_resolved_addresses_when_none_are_public(self, monkeypatch):
        def _addrinfo(host, port, type=0):
            return [
                (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("100.100.100.200", port or 443)),
                (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("127.0.0.1", port or 443)),
            ]

        monkeypatch.setattr(socket, "getaddrinfo", _addrinfo)

        with pytest.raises(IcsSubscriptionError, match="not allowed"):
            fetch_ics_text("https://feed.example.com/holidays.ics")

    def test_malformed_url_returns_safe_400(self):
        token, family_id = _seed_adult()
        client = TestClient(app)
        resp = client.post(
            "/calendar/events/subscribe-ics",
            json={"family_id": family_id, "source_url": "https://[::1/holidays.ics"},
            headers=_auth(token),
        )
        assert resp.status_code == 400, resp.text
        assert "Traceback" not in resp.text


# --- Successful subscription ------------------------------------------------


class TestSubscribeCreates:
    def test_first_fetch_creates_subscription_rows(self, monkeypatch):
        token, family_id = _seed_adult()
        _patch_fetch(monkeypatch, lambda url, **kw: _ics("evt-1@feed.example.com", summary="Holiday"))

        client = TestClient(app)
        resp = client.post(
            "/calendar/events/subscribe-ics",
            json={
                "family_id": family_id,
                "source_url": "https://feed.example.com/holidays.ics",
                "source_name": "Public Holidays",
            },
            headers=_auth(token),
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["status"] == "ok"
        assert body["created"] == 1
        assert body["updated"] == 0
        assert body["skipped"] == 0
        assert body["errors"] == []

        db = TestSession()
        try:
            row = db.query(CalendarEvent).filter(
                CalendarEvent.family_id == family_id,
                CalendarEvent.ical_uid == "evt-1@feed.example.com",
            ).one()
            assert row.source_type == "subscription"
            assert row.source_url == "https://feed.example.com/holidays.ics"
            assert row.source_name == "Public Holidays"
            assert row.last_synced_at is not None
            assert row.sync_status == "ok"
        finally:
            db.close()

    def test_default_source_name_uses_hostname_when_omitted(self, monkeypatch):
        token, family_id = _seed_adult()
        _patch_fetch(monkeypatch, lambda url, **kw: _ics("evt-2@feed.example.com"))

        client = TestClient(app)
        resp = client.post(
            "/calendar/events/subscribe-ics",
            json={
                "family_id": family_id,
                "source_url": "https://feed.example.com/holidays.ics",
            },
            headers=_auth(token),
        )
        assert resp.status_code == 200, resp.text

        db = TestSession()
        try:
            row = db.query(CalendarEvent).filter(
                CalendarEvent.family_id == family_id,
                CalendarEvent.ical_uid == "evt-2@feed.example.com",
            ).one()
            # When no source_name was provided we fall back to a label
            # derived from the URL so the UI can still show provenance.
            assert row.source_name == "feed.example.com"
        finally:
            db.close()


# --- Refresh / re-subscription ---------------------------------------------


class TestSubscribeRefresh:
    def test_refresh_updates_existing_subscription_row(self, monkeypatch):
        token, family_id = _seed_adult()

        ics_v1 = _ics("evt-1@feed.example.com", summary="Holiday")
        ics_v2 = _ics("evt-1@feed.example.com", summary="Holiday (renamed)")

        url = "https://feed.example.com/holidays.ics"

        _patch_fetch(monkeypatch, lambda u, **kw: ics_v1)
        client = TestClient(app)
        first = client.post(
            "/calendar/events/subscribe-ics",
            json={"family_id": family_id, "source_url": url, "source_name": "Holidays"},
            headers=_auth(token),
        )
        assert first.status_code == 200, first.text
        assert first.json()["created"] == 1

        _patch_fetch(monkeypatch, lambda u, **kw: ics_v2)
        second = client.post(
            "/calendar/events/subscribe-ics",
            json={"family_id": family_id, "source_url": url, "source_name": "Holidays"},
            headers=_auth(token),
        )
        assert second.status_code == 200, second.text
        body = second.json()
        assert body["created"] == 0
        assert body["updated"] == 1

        db = TestSession()
        try:
            rows = db.query(CalendarEvent).filter(
                CalendarEvent.family_id == family_id,
                CalendarEvent.ical_uid == "evt-1@feed.example.com",
            ).all()
            assert len(rows) == 1
            assert rows[0].title == "Holiday (renamed)"
            assert rows[0].source_type == "subscription"
            assert rows[0].source_url == url
        finally:
            db.close()

    def test_refresh_does_not_overwrite_local_event(self, monkeypatch):
        token, family_id = _seed_adult()

        from datetime import datetime
        db = TestSession()
        try:
            db.add(CalendarEvent(
                family_id=family_id,
                title="Local copy",
                starts_at=datetime(2026, 3, 10, 9, 0),
                ical_uid="shared@example.com",
                source_type="local",
            ))
            db.commit()
        finally:
            db.close()

        _patch_fetch(monkeypatch, lambda u, **kw: _ics("shared@example.com", summary="External"))
        client = TestClient(app)
        resp = client.post(
            "/calendar/events/subscribe-ics",
            json={
                "family_id": family_id,
                "source_url": "https://feed.example.com/holidays.ics",
                "source_name": "Holidays",
            },
            headers=_auth(token),
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["created"] == 0
        assert body["updated"] == 0
        assert body["skipped"] == 1
        assert body["errors"]
        assert "non-subscription" in body["errors"][0]["error"] or "not owned" in body["errors"][0]["error"]

        db = TestSession()
        try:
            row = db.query(CalendarEvent).filter(
                CalendarEvent.family_id == family_id,
                CalendarEvent.ical_uid == "shared@example.com",
            ).one()
            assert row.title == "Local copy"
            assert row.source_type == "local"
        finally:
            db.close()

    def test_refresh_does_not_overwrite_subscription_from_different_url(self, monkeypatch):
        token, family_id = _seed_adult()

        url_a = "https://feed-a.example.com/cal.ics"
        url_b = "https://feed-b.example.com/cal.ics"

        _patch_fetch(monkeypatch, lambda u, **kw: _ics("dup@example.com", summary="From A"))
        client = TestClient(app)
        first = client.post(
            "/calendar/events/subscribe-ics",
            json={"family_id": family_id, "source_url": url_a, "source_name": "Feed A"},
            headers=_auth(token),
        )
        assert first.status_code == 200
        assert first.json()["created"] == 1

        _patch_fetch(monkeypatch, lambda u, **kw: _ics("dup@example.com", summary="From B"))
        second = client.post(
            "/calendar/events/subscribe-ics",
            json={"family_id": family_id, "source_url": url_b, "source_name": "Feed B"},
            headers=_auth(token),
        )
        assert second.status_code == 200, second.text
        body = second.json()
        assert body["created"] == 0
        assert body["updated"] == 0
        assert body["skipped"] == 1

        db = TestSession()
        try:
            row = db.query(CalendarEvent).filter(
                CalendarEvent.family_id == family_id,
                CalendarEvent.ical_uid == "dup@example.com",
            ).one()
            assert row.title == "From A"
            assert row.source_url == url_a
        finally:
            db.close()


# --- Network / parser failure ----------------------------------------------


class TestFetchFailureSafe:
    def test_fetch_failure_returns_user_safe_400_no_traceback(self, monkeypatch):
        token, family_id = _seed_adult()

        from app.core.calendar_subscriptions import IcsSubscriptionError

        def _boom(url, **kw):
            raise IcsSubscriptionError("could not fetch")

        _patch_fetch(monkeypatch, _boom)

        client = TestClient(app)
        resp = client.post(
            "/calendar/events/subscribe-ics",
            json={
                "family_id": family_id,
                "source_url": "https://feed.example.com/holidays.ics",
                "source_name": "Holidays",
            },
            headers=_auth(token),
        )
        assert resp.status_code == 400, resp.text
        text = resp.text
        assert "Traceback" not in text

    def test_unexpected_exception_does_not_leak_to_user(self, monkeypatch):
        token, family_id = _seed_adult()

        def _boom(url, **kw):
            raise RuntimeError("internal proxy host unreachable: 10.0.0.5:8080")

        _patch_fetch(monkeypatch, _boom)

        client = TestClient(app)
        resp = client.post(
            "/calendar/events/subscribe-ics",
            json={
                "family_id": family_id,
                "source_url": "https://feed.example.com/holidays.ics",
            },
            headers=_auth(token),
        )
        assert resp.status_code == 400, resp.text
        text = resp.text
        assert "10.0.0.5" not in text
        assert "Traceback" not in text



class TestManagedSubscriptions:
    def test_create_persists_feed_status_and_sync_history(self, monkeypatch):
        token, family_id = _seed_adult()
        _patch_fetch(monkeypatch, lambda url, **kw: _ics("managed-1@feed.example.com", summary="Practice"))

        client = TestClient(app)
        resp = client.post(
            "/calendar/subscriptions",
            json={
                "family_id": family_id,
                "source_url": "https://feed.example.com/team.ics",
                "source_name": "Team",
            },
            headers=_auth(token),
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["name"] == "Team"
        assert body["source_url"] == "https://feed.example.com/team.ics"
        assert body["last_sync_status"] == "success"
        assert body["last_created"] == 1
        assert body["last_updated"] == 0
        assert body["last_skipped"] == 0
        assert body["sync_history"][0]["status"] == "success"

        db = TestSession()
        try:
            subscription = db.query(CalendarSubscription).one()
            assert subscription.name == "Team"
            event = db.query(CalendarEvent).filter(CalendarEvent.ical_uid == "managed-1@feed.example.com").one()
            assert event.subscription_id == subscription.id
            assert event.source_type == "subscription"
            assert db.query(CalendarSubscriptionSync).count() == 1
        finally:
            db.close()

    def test_list_refresh_and_delete_managed_subscription(self, monkeypatch):
        token, family_id = _seed_adult()
        url = "https://feed.example.com/team.ics"
        client = TestClient(app)

        _patch_fetch(monkeypatch, lambda u, **kw: _ics("managed-refresh@feed.example.com", summary="Practice"))
        first = client.post(
            "/calendar/subscriptions",
            json={"family_id": family_id, "source_url": url, "source_name": "Team"},
            headers=_auth(token),
        )
        assert first.status_code == 200, first.text
        subscription_id = first.json()["id"]

        listed = client.get(f"/calendar/subscriptions?family_id={family_id}", headers=_auth(token))
        assert listed.status_code == 200, listed.text
        assert listed.json()[0]["id"] == subscription_id

        _patch_fetch(monkeypatch, lambda u, **kw: _ics("managed-refresh@feed.example.com", summary="Practice updated"))
        refreshed = client.post(f"/calendar/subscriptions/{subscription_id}/refresh", headers=_auth(token))
        assert refreshed.status_code == 200, refreshed.text
        assert refreshed.json()["last_updated"] == 1

        deleted = client.delete(f"/calendar/subscriptions/{subscription_id}", headers=_auth(token))
        assert deleted.status_code == 200, deleted.text

        db = TestSession()
        try:
            assert db.query(CalendarSubscription).count() == 0
            event = db.query(CalendarEvent).filter(CalendarEvent.ical_uid == "managed-refresh@feed.example.com").one()
            assert event.title == "Practice updated"
            assert event.subscription_id is None
            assert event.source_type == "subscription"
        finally:
            db.close()

    def test_managed_refresh_failure_records_safe_status(self, monkeypatch):
        token, family_id = _seed_adult()

        def _boom(url, **kw):
            raise RuntimeError("internal host 10.1.2.3 failed")

        _patch_fetch(monkeypatch, _boom)
        client = TestClient(app)
        resp = client.post(
            "/calendar/subscriptions",
            json={"family_id": family_id, "source_url": "https://feed.example.com/bad.ics"},
            headers=_auth(token),
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["last_sync_status"] == "failed"
        assert body["last_sync_error"] == "Could not fetch subscription URL"
        assert "10.1.2.3" not in resp.text
        assert body["sync_history"][0]["status"] == "failed"
