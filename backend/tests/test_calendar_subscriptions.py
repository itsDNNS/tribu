"""Tests for the manual ICS subscription URL endpoint.

The endpoint fetches an external ``.ics`` URL and stores its events as
``source_type="subscription"``. Repeated calls with the same URL refresh
the same rows (matched by VEVENT UID); rows owned by another source
are never overwritten.
"""

import socket

import pytest
from fastapi.testclient import TestClient

from app.core.calendar_subscriptions import IcsSubscriptionError, fetch_ics_text
from app.main import app
from app.models import CalendarEvent, CalendarSubscription, CalendarSubscriptionSync
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


# --- URL safety -------------------------------------------------------------


class TestUrlSafety:
    def test_rejects_non_http_scheme(self, monkeypatch):
        token, family_id = seed_calendar_admin()

        called = refuse_fetch(monkeypatch)
        resp = client.post(
            "/calendar/events/subscribe-ics",
            json={"family_id": family_id, "source_url": "file:///etc/passwd"},
            headers=auth(token),
        )
        assert resp.status_code == 400, resp.text
        assert called["hit"] is False
        body = resp.json()
        text = repr(body)
        # Should not leak parser/network internals.
        assert "Traceback" not in text
        assert "/etc/passwd" not in text

    def test_rejects_blank_url(self, monkeypatch):
        token, family_id = seed_calendar_admin()
        patch_ics_fetch(monkeypatch, lambda url, **kw: "")
        resp = client.post(
            "/calendar/events/subscribe-ics",
            json={"family_id": family_id, "source_url": "   "},
            headers=auth(token),
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


    def test_fetch_allows_private_hosts_with_explicit_opt_in(self, monkeypatch):
        calls = {"connected": False}

        def _private_addrinfo(host, port, type=0):
            return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("192.168.1.20", port or 80))]

        class _Socket:
            def __init__(self, *args, **kwargs):
                pass
            def settimeout(self, timeout):
                pass
            def connect(self, sockaddr):
                calls["connected"] = True
                raise OSError("stop before network I/O")
            def close(self):
                pass

        monkeypatch.setattr(socket, "getaddrinfo", _private_addrinfo)
        monkeypatch.setattr(socket, "socket", _Socket)

        with pytest.raises(IcsSubscriptionError, match="unreachable"):
            fetch_ics_text("http://calendar.lan/family.ics", allow_private_networks=True)
        assert calls["connected"] is True

    def test_fetch_private_host_env_opt_in(self, monkeypatch):
        from app.core import calendar_subscriptions as sub_mod

        def _private_addrinfo(host, port, type=0):
            return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("10.0.0.5", port or 80))]

        monkeypatch.setenv("SUBSCRIPTIONS_ALLOW_PRIVATE_NETWORKS", "true")
        monkeypatch.setattr(socket, "getaddrinfo", _private_addrinfo)
        monkeypatch.setattr(socket, "socket", lambda *a, **kw: (_ for _ in ()).throw(OSError("stop")))

        with pytest.raises(IcsSubscriptionError, match="unreachable"):
            sub_mod.fetch_ics_text("http://calendar.lan/family.ics")

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
        token, family_id = seed_calendar_admin()
        resp = client.post(
            "/calendar/events/subscribe-ics",
            json={"family_id": family_id, "source_url": "https://[::1/holidays.ics"},
            headers=auth(token),
        )
        assert resp.status_code == 400, resp.text
        assert "Traceback" not in resp.text


# --- Successful subscription ------------------------------------------------


class TestSubscribeCreates:
    def test_first_fetch_creates_subscription_rows(self, monkeypatch):
        token, family_id = seed_calendar_admin()
        patch_ics_fetch(monkeypatch, lambda url, **kw: ics_event("evt-1@feed.example.com", summary="Holiday"))

        resp = client.post(
            "/calendar/events/subscribe-ics",
            json={
                "family_id": family_id,
                "source_url": "https://feed.example.com/holidays.ics",
                "source_name": "Public Holidays",
            },
            headers=auth(token),
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["status"] == "ok"
        assert body["created"] == 1
        assert body["updated"] == 0
        assert body["skipped"] == 0
        assert body["errors"] == []

        [row] = events_with_uid(family_id, "evt-1@feed.example.com")
        assert row.source_type == "subscription"
        assert row.source_url == "https://feed.example.com/holidays.ics"
        assert row.source_name == "Public Holidays"
        assert row.last_synced_at is not None
        assert row.sync_status == "ok"

    def test_default_source_name_uses_hostname_when_omitted(self, monkeypatch):
        token, family_id = seed_calendar_admin()
        patch_ics_fetch(monkeypatch, lambda url, **kw: ics_event("evt-2@feed.example.com"))

        resp = client.post(
            "/calendar/events/subscribe-ics",
            json={
                "family_id": family_id,
                "source_url": "https://feed.example.com/holidays.ics",
            },
            headers=auth(token),
        )
        assert resp.status_code == 200, resp.text

        [row] = events_with_uid(family_id, "evt-2@feed.example.com")
        # When no source_name was provided we fall back to a label
        # derived from the URL so the UI can still show provenance.
        assert row.source_name == "feed.example.com"


# --- Refresh / re-subscription ---------------------------------------------


class TestSubscribeRefresh:
    def test_refresh_updates_existing_subscription_row(self, monkeypatch):
        token, family_id = seed_calendar_admin()

        ics_v1 = ics_event("evt-1@feed.example.com", summary="Holiday")
        ics_v2 = ics_event("evt-1@feed.example.com", summary="Holiday (renamed)")

        url = "https://feed.example.com/holidays.ics"

        patch_ics_fetch(monkeypatch, lambda u, **kw: ics_v1)
        first = client.post(
            "/calendar/events/subscribe-ics",
            json={"family_id": family_id, "source_url": url, "source_name": "Holidays"},
            headers=auth(token),
        )
        assert first.status_code == 200, first.text
        assert first.json()["created"] == 1

        patch_ics_fetch(monkeypatch, lambda u, **kw: ics_v2)
        second = client.post(
            "/calendar/events/subscribe-ics",
            json={"family_id": family_id, "source_url": url, "source_name": "Holidays"},
            headers=auth(token),
        )
        assert second.status_code == 200, second.text
        body = second.json()
        assert body["created"] == 0
        assert body["updated"] == 1

        rows = events_with_uid(family_id, "evt-1@feed.example.com")
        assert len(rows) == 1
        assert rows[0].title == "Holiday (renamed)"
        assert rows[0].source_type == "subscription"
        assert rows[0].source_url == url

    def test_refresh_does_not_overwrite_local_event(self, monkeypatch):
        token, family_id = seed_calendar_admin()

        seed_calendar_event(family_id, "Local copy", "shared@example.com", source_type="local")

        patch_ics_fetch(monkeypatch, lambda u, **kw: ics_event("shared@example.com", summary="External"))
        resp = client.post(
            "/calendar/events/subscribe-ics",
            json={
                "family_id": family_id,
                "source_url": "https://feed.example.com/holidays.ics",
                "source_name": "Holidays",
            },
            headers=auth(token),
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["created"] == 0
        assert body["updated"] == 0
        assert body["skipped"] == 1
        assert body["errors"]
        assert "non-subscription" in body["errors"][0]["error"] or "not owned" in body["errors"][0]["error"]

        [row] = events_with_uid(family_id, "shared@example.com")
        assert row.title == "Local copy"
        assert row.source_type == "local"

    def test_refresh_does_not_overwrite_subscription_from_different_url(self, monkeypatch):
        token, family_id = seed_calendar_admin()

        url_a = "https://feed-a.example.com/cal.ics"
        url_b = "https://feed-b.example.com/cal.ics"

        patch_ics_fetch(monkeypatch, lambda u, **kw: ics_event("dup@example.com", summary="From A"))
        first = client.post(
            "/calendar/events/subscribe-ics",
            json={"family_id": family_id, "source_url": url_a, "source_name": "Feed A"},
            headers=auth(token),
        )
        assert first.status_code == 200
        assert first.json()["created"] == 1

        patch_ics_fetch(monkeypatch, lambda u, **kw: ics_event("dup@example.com", summary="From B"))
        second = client.post(
            "/calendar/events/subscribe-ics",
            json={"family_id": family_id, "source_url": url_b, "source_name": "Feed B"},
            headers=auth(token),
        )
        assert second.status_code == 200, second.text
        body = second.json()
        assert body["created"] == 0
        assert body["updated"] == 0
        assert body["skipped"] == 1

        [row] = events_with_uid(family_id, "dup@example.com")
        assert row.title == "From A"
        assert row.source_url == url_a


# --- Network / parser failure ----------------------------------------------


class TestFetchFailureSafe:
    def test_fetch_failure_returns_user_safe_400_no_traceback(self, monkeypatch):
        token, family_id = seed_calendar_admin()

        def _boom(url, **kw):
            raise IcsSubscriptionError("could not fetch")

        patch_ics_fetch(monkeypatch, _boom)

        resp = client.post(
            "/calendar/events/subscribe-ics",
            json={
                "family_id": family_id,
                "source_url": "https://feed.example.com/holidays.ics",
                "source_name": "Holidays",
            },
            headers=auth(token),
        )
        assert resp.status_code == 400, resp.text
        text = resp.text
        assert "Traceback" not in text

    def test_unexpected_exception_does_not_leak_to_user(self, monkeypatch):
        token, family_id = seed_calendar_admin()

        def _boom(url, **kw):
            raise RuntimeError("internal proxy host unreachable: 10.0.0.5:8080")

        patch_ics_fetch(monkeypatch, _boom)

        resp = client.post(
            "/calendar/events/subscribe-ics",
            json={
                "family_id": family_id,
                "source_url": "https://feed.example.com/holidays.ics",
            },
            headers=auth(token),
        )
        assert resp.status_code == 400, resp.text
        text = resp.text
        assert "10.0.0.5" not in text
        assert "Traceback" not in text



class TestManagedSubscriptions:
    def test_create_persists_feed_status_and_sync_history(self, monkeypatch):
        token, family_id = seed_calendar_admin()
        patch_ics_fetch(monkeypatch, lambda url, **kw: ics_event("managed-1@feed.example.com", summary="Practice"))

        resp = client.post(
            "/calendar/subscriptions",
            json={
                "family_id": family_id,
                "source_url": "https://feed.example.com/team.ics",
                "source_name": "Team",
            },
            headers=auth(token),
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
        token, family_id = seed_calendar_admin()
        url = "https://feed.example.com/team.ics"

        patch_ics_fetch(monkeypatch, lambda u, **kw: ics_event("managed-refresh@feed.example.com", summary="Practice"))
        first = client.post(
            "/calendar/subscriptions",
            json={"family_id": family_id, "source_url": url, "source_name": "Team"},
            headers=auth(token),
        )
        assert first.status_code == 200, first.text
        subscription_id = first.json()["id"]

        listed = client.get(f"/calendar/subscriptions?family_id={family_id}", headers=auth(token))
        assert listed.status_code == 200, listed.text
        assert listed.json()[0]["id"] == subscription_id

        patch_ics_fetch(monkeypatch, lambda u, **kw: ics_event("managed-refresh@feed.example.com", summary="Practice updated"))
        refreshed = client.post(f"/calendar/subscriptions/{subscription_id}/refresh", headers=auth(token))
        assert refreshed.status_code == 200, refreshed.text
        assert refreshed.json()["last_updated"] == 1

        deleted = client.delete(f"/calendar/subscriptions/{subscription_id}", headers=auth(token))
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
        token, family_id = seed_calendar_admin()

        def _boom(url, **kw):
            raise RuntimeError("internal host 10.1.2.3 failed")

        patch_ics_fetch(monkeypatch, _boom)
        resp = client.post(
            "/calendar/subscriptions",
            json={"family_id": family_id, "source_url": "https://feed.example.com/bad.ics"},
            headers=auth(token),
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["last_sync_status"] == "failed"
        assert body["last_sync_error"] == "Could not fetch subscription URL"
        assert "10.1.2.3" not in resp.text
        assert body["sync_history"][0]["status"] == "failed"
