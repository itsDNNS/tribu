"""Apprise-backed human notification destination tests."""

from __future__ import annotations

import hashlib
import logging
import socket
import types
from datetime import date, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401 - ensure all models are registered before create_all
from app.database import Base, get_db
from app.main import app
from app.models import (
    CalendarEvent,
    Family,
    Membership,
    NotificationDestination,
    NotificationDestinationDelivery,
    HouseholdTemplate,
    MealPlan,
    NotificationPreference,
    PersonalAccessToken,
    QuickCaptureItem,
    Recipe,
    ShoppingItem,
    ShoppingList,
    ShoppingTemplate,
    ShoppingTemplateItem,
    User,
)
from app.security import PAT_PREFIX, hash_password

engine = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestSession = sessionmaker(bind=engine)


@event.listens_for(engine, "connect")
def _set_sqlite_pragma(dbapi_conn, _):
    cursor = dbapi_conn.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


@pytest.fixture(autouse=True)
def setup_db(monkeypatch):
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    monkeypatch.setenv("NOTIFICATION_DESTINATION_SECRET_KEY", "notification-destination-test-key")
    monkeypatch.delenv("NOTIFICATION_DESTINATION_ALLOWED_HOSTS", raising=False)
    monkeypatch.delenv("NOTIFICATION_DESTINATION_ALLOW_PRIVATE_HOSTS", raising=False)

    def _override():
        db = TestSession()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _override

    from app.core import notification_destinations as destinations_core
    from app.core import scheduler as scheduler_module

    monkeypatch.setattr(destinations_core, "SessionLocal", TestSession)
    monkeypatch.setattr(scheduler_module, "SessionLocal", TestSession)

    yield

    app.dependency_overrides.pop(get_db, None)
    Base.metadata.drop_all(bind=engine)


client = TestClient(app)


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _pat(user_id: int, scopes: str, suffix: str) -> str:
    plain = f"{PAT_PREFIX}notification-dest-{suffix}"
    lookup = hashlib.sha256(plain.encode()).hexdigest()
    return plain, PersonalAccessToken(
        user_id=user_id,
        name=f"dest-{suffix}",
        token_hash=lookup,
        token_lookup=lookup,
        scopes=scopes,
    )


def _seed_member(
    *,
    scopes: str = "admin:read,admin:write",
    role: str = "admin",
    is_adult: bool = True,
    family_id: int | None = None,
    suffix: str = "admin",
) -> tuple[str, int, int]:
    db = TestSession()
    try:
        family = db.get(Family, family_id) if family_id else Family(name=f"Family {suffix}")
        user = User(
            email=f"{suffix}@example.com",
            password_hash=hash_password("Password123"),
            display_name=f"User {suffix}",
        )
        db.add_all([family, user])
        db.flush()
        db.add(Membership(user_id=user.id, family_id=family.id, role=role, is_adult=is_adult))
        plain, token = _pat(user.id, scopes, suffix)
        db.add(token)
        db.commit()
        return plain, family.id, user.id
    finally:
        db.close()


def _destination(family_id: int, user_id: int, **overrides) -> NotificationDestination:
    data = {
        "family_id": family_id,
        "name": "Household ntfy",
        "provider": "apprise",
        "target_url_secret": "ntfy://ntfy.sh/placeholder-topic?token=placeholder-token",
        "events": ["calendar.reminder", "task.reminder", "birthday.reminder"],
        "active": True,
        "respect_quiet_hours": True,
        "created_by_user_id": user_id,
    }
    data.update(overrides)
    return NotificationDestination(**data)


def _capture_destination_calls(monkeypatch) -> list[dict]:
    from app.core import notification_destinations as destinations_core

    calls = []
    monkeypatch.setattr(destinations_core, "is_provider_available", lambda: True)
    monkeypatch.setattr(destinations_core, "_send_with_apprise", lambda _url, payload: calls.append(payload) or True)
    return calls


def _seed_shopping_destination(family_id: int, user_id: int) -> None:
    db = TestSession()
    try:
        db.add(
            _destination(
                family_id,
                user_id,
                target_url_secret="mailto://shopping-coverage@example.com",
                events=["shopping.list.changed", "shopping.item.changed"],
            )
        )
        db.commit()
    finally:
        db.close()


def _seed_shopping_list(family_id: int, user_id: int, name: str = "Coverage list") -> int:
    db = TestSession()
    try:
        shopping_list = ShoppingList(family_id=family_id, name=name, created_by_user_id=user_id)
        db.add(shopping_list)
        db.commit()
        return shopping_list.id
    finally:
        db.close()


def test_admin_crud_redacts_secret_and_audits_safe_metadata():
    token, family_id, _ = _seed_member()
    raw_url = "ntfy://ntfy.sh/placeholder-topic?token=placeholder-token"

    created = client.post(
        "/notification-destinations",
        headers=_auth(token),
        json={
            "family_id": family_id,
            "name": "Kitchen ntfy",
            "target_url_secret": raw_url,
            "events": ["calendar.reminder", "task.reminder"],
            "active": True,
            "respect_quiet_hours": True,
        },
    )

    assert created.status_code == 200, created.json()
    body = created.json()
    assert body["name"] == "Kitchen ntfy"
    assert body["provider"] == "apprise"
    assert body["has_secret"] is True
    assert body["url_redacted"].startswith("ntfy://")
    assert "placeholder-token" not in str(body)
    assert "placeholder-topic" not in str(body)
    assert "target_url_secret" not in body

    db = TestSession()
    try:
        stored = db.get(NotificationDestination, body["id"]).target_url_secret
    finally:
        db.close()

    from app.core.notification_destinations import reveal_target_url

    assert stored.startswith("enc:v1:")
    assert raw_url not in stored
    assert "placeholder-token" not in stored
    assert reveal_target_url(stored) == raw_url

    listed = client.get(f"/notification-destinations?family_id={family_id}", headers=_auth(token))
    assert listed.status_code == 200, listed.json()
    assert listed.json()[0]["id"] == body["id"]
    assert "placeholder-token" not in str(listed.json())

    patched = client.patch(
        f"/notification-destinations/{body['id']}",
        headers=_auth(token),
        json={"name": "Kitchen reminders", "target_url_secret": ""},
    )
    assert patched.status_code == 200, patched.json()
    assert patched.json()["name"] == "Kitchen reminders"
    assert patched.json()["has_secret"] is True

    deleted = client.delete(f"/notification-destinations/{body['id']}", headers=_auth(token))
    assert deleted.status_code == 200


def test_admin_authorization_cross_family_and_pat_scope_split():
    admin_token, family_id, _ = _seed_member(suffix="owner")
    adult_member_token, _, _ = _seed_member(
        role="member",
        is_adult=True,
        family_id=family_id,
        suffix="adult-member",
    )
    outsider_token, _, _ = _seed_member(suffix="outsider")
    read_token, _, _ = _seed_member(scopes="admin:read", family_id=family_id, suffix="read")
    write_token, _, _ = _seed_member(scopes="admin:write", family_id=family_id, suffix="write")

    created = client.post(
        "/notification-destinations",
        headers=_auth(admin_token),
        json={
            "family_id": family_id,
            "name": "Gotify",
            "target_url_secret": "mailto://user@example.com",
            "events": ["calendar.reminder"],
        },
    )
    assert created.status_code == 200, created.json()
    dest_id = created.json()["id"]

    assert client.get(f"/notification-destinations?family_id={family_id}", headers=_auth(read_token)).status_code == 200
    assert client.get(f"/notification-destinations?family_id={family_id}", headers=_auth(write_token)).status_code == 403

    denied_adult = client.patch(
        f"/notification-destinations/{dest_id}",
        headers=_auth(adult_member_token),
        json={"active": False},
    )
    assert denied_adult.status_code == 403

    denied_outsider = client.delete(f"/notification-destinations/{dest_id}", headers=_auth(outsider_token))
    assert denied_outsider.status_code == 404
    assert "token" not in str(denied_outsider.json()).lower()


@pytest.mark.parametrize("url", [
    "gotify://127.0.0.1/secret-token",
    "ntfy://localhost/private-topic?token=secret-token",
    "smtp://169.254.169.254:25?user=secret-token",
    "gotify://100.64.0.1/secret-token",
    "mailto://user@127.0.0.1",
])
def test_rejects_private_destination_hosts_without_echoing_secret(url):
    token, family_id, _ = _seed_member()

    resp = client.post(
        "/notification-destinations",
        headers=_auth(token),
        json={
            "family_id": family_id,
            "name": "Unsafe internal",
            "target_url_secret": url,
            "events": ["calendar.reminder"],
        },
    )

    assert resp.status_code == 422
    body = str(resp.json())
    assert "secret-token" not in body
    assert "private-topic" not in body


def test_telegram_destination_token_is_not_treated_as_destination_host(monkeypatch):
    token, family_id, _ = _seed_member()

    def fail_if_resolved(*_args, **_kwargs):
        raise AssertionError("Telegram token should not be resolved as a hostname at save time")

    from app.core import notification_destinations as destinations_core

    monkeypatch.setattr(destinations_core.socket, "getaddrinfo", fail_if_resolved)

    resp = client.post(
        "/notification-destinations",
        headers=_auth(token),
        json={
            "family_id": family_id,
            "name": "Telegram reminders",
            "target_url_secret": "tgram://123456:placeholder-token/987654321",
            "events": ["calendar.reminder"],
        },
    )

    assert resp.status_code == 200, resp.json()
    assert resp.json()["url_redacted"] == "tgram://[redacted]"


def test_rejects_network_destination_when_hostname_cannot_be_resolved(monkeypatch):
    token, family_id, _ = _seed_member()

    def unresolved(*_args, **_kwargs):
        raise socket.gaierror("name not known")

    from app.core import notification_destinations as destinations_core

    monkeypatch.setattr(destinations_core.socket, "getaddrinfo", unresolved)

    resp = client.post(
        "/notification-destinations",
        headers=_auth(token),
        json={
            "family_id": family_id,
            "name": "Unresolved Gotify",
            "target_url_secret": "gotify://unresolved.example.test/secret-token",
            "events": ["calendar.reminder"],
        },
    )

    assert resp.status_code == 422
    assert "secret-token" not in str(resp.json())


def test_apprise_send_revalidates_dns_resolution_at_notify_time(monkeypatch):
    from app.core import notification_destinations as destinations_core

    class FakeServer:
        pass

    class FakeApprise:
        def __init__(self):
            self.servers = [FakeServer()]

        def add(self, _url):
            return True

        def notify(self, *, title, body):
            assert title
            assert body
            destinations_core.socket.getaddrinfo("rebind.example", 443, proto=socket.IPPROTO_TCP)
            return True

    def fake_import_module(name):
        assert name == "apprise"
        return types.SimpleNamespace(Apprise=FakeApprise)

    def rebound_to_private(*_args, **_kwargs):
        return [(socket.AF_INET, socket.SOCK_STREAM, socket.IPPROTO_TCP, "", ("127.0.0.1", 443))]

    monkeypatch.setattr(destinations_core.importlib, "import_module", fake_import_module)
    monkeypatch.setattr(destinations_core.socket, "getaddrinfo", rebound_to_private)

    with pytest.raises(ValueError):
        destinations_core._send_with_apprise(
            "gotify://rebind.example/secret-token",
            {"title": "Test", "body": "Body", "link": None},
        )


def test_private_destination_host_can_be_enabled_with_explicit_allowlist(monkeypatch):
    token, family_id, _ = _seed_member()
    monkeypatch.setenv("NOTIFICATION_DESTINATION_ALLOWED_HOSTS", "127.0.0.1")

    resp = client.post(
        "/notification-destinations",
        headers=_auth(token),
        json={
            "family_id": family_id,
            "name": "Allowed local Gotify",
            "target_url_secret": "gotify://127.0.0.1/secret-token",
            "events": ["calendar.reminder"],
        },
    )

    assert resp.status_code == 200, resp.json()
    assert resp.json()["url_redacted"] == "gotify://[redacted]"


def test_existing_private_destination_url_is_blocked_at_delivery_time(monkeypatch):
    token, family_id, user_id = _seed_member()
    db = TestSession()
    try:
        dest = _destination(family_id, user_id, target_url_secret="gotify://127.0.0.1/secret-token")
        db.add(dest)
        db.commit()
        dest_id = dest.id
    finally:
        db.close()

    from app.core import notification_destinations as destinations_core

    calls = []
    monkeypatch.setattr(destinations_core, "is_provider_available", lambda: True)

    def fail_if_called(url, payload):
        calls.append((url, payload))
        return True

    monkeypatch.setattr(destinations_core, "_send_with_apprise", fail_if_called)

    resp = client.post(f"/notification-destinations/{dest_id}/test", headers=_auth(token))
    assert resp.status_code == 200, resp.json()
    assert resp.json()["status"] == "failed"
    assert resp.json()["error"] == "invalid_url"
    assert calls == []


@pytest.mark.parametrize("url", [
    "https://example.com/hook?token=***",
    "file:///tmp/secret-token",
    "json://localhost",
])
def test_rejects_unsupported_schemes_without_echoing_secret(url):
    token, family_id, _ = _seed_member()

    resp = client.post(
        "/notification-destinations",
        headers=_auth(token),
        json={
            "family_id": family_id,
            "name": "Unsafe",
            "target_url_secret": url,
            "events": ["calendar.reminder"],
        },
    )

    assert resp.status_code == 422
    body = str(resp.json())
    assert "secret-token" not in body
    assert url not in body


def test_provider_status_and_test_send_with_mocked_sender(monkeypatch):
    token, family_id, user_id = _seed_member()
    db = TestSession()
    try:
        dest = _destination(family_id, user_id, target_url_secret="mailto://user@example.com")
        db.add(dest)
        db.commit()
        dest_id = dest.id
    finally:
        db.close()

    from app.core import notification_destinations as destinations_core

    monkeypatch.setattr(destinations_core, "is_provider_available", lambda: True)
    calls = []

    def fake_send(url, payload):
        calls.append((url, payload))
        return True

    monkeypatch.setattr(destinations_core, "_send_with_apprise", fake_send)

    status = client.get("/notification-destinations/provider/status", headers=_auth(token))
    assert status.status_code == 200
    assert status.json()["available"] is True

    resp = client.post(f"/notification-destinations/{dest_id}/test", headers=_auth(token))
    assert resp.status_code == 200, resp.json()
    assert resp.json()["status"] == "delivered"
    assert calls[0][0] == "mailto://user@example.com"
    assert calls[0][1]["event_type"] == "notification.test"
    assert "password" not in str(resp.json())


def test_provider_unavailable_is_safe_and_does_not_leak_secret(monkeypatch):
    token, family_id, user_id = _seed_member()
    db = TestSession()
    try:
        dest = _destination(family_id, user_id)
        db.add(dest)
        db.commit()
        dest_id = dest.id
    finally:
        db.close()

    from app.core import notification_destinations as destinations_core

    monkeypatch.setattr(destinations_core, "is_provider_available", lambda: False)

    resp = client.post(f"/notification-destinations/{dest_id}/test", headers=_auth(token))
    assert resp.status_code == 200, resp.json()
    assert resp.json()["status"] == "failed"
    assert resp.json()["error"] == "provider_unavailable"
    assert "placeholder-token" not in str(resp.json())


def test_send_failure_log_does_not_echo_destination_secret(monkeypatch, caplog):
    token, family_id, user_id = _seed_member()
    secret_url = "ntfy://ntfy.sh/private-topic?token=secret-token-123"
    db = TestSession()
    try:
        dest = _destination(family_id, user_id, target_url_secret=secret_url)
        db.add(dest)
        db.commit()
        dest_id = dest.id
    finally:
        db.close()

    from app.core import notification_destinations as destinations_core

    monkeypatch.setattr(destinations_core, "is_provider_available", lambda: True)

    def failing_send(url, _payload):
        raise RuntimeError(f"send failed for {url}")

    monkeypatch.setattr(destinations_core, "_send_with_apprise", failing_send)

    with caplog.at_level(logging.WARNING, logger="app.core.notification_destinations"):
        resp = client.post(f"/notification-destinations/{dest_id}/test", headers=_auth(token))

    assert resp.status_code == 200, resp.json()
    assert resp.json()["status"] == "failed"
    assert resp.json()["error"] == "send_failed"
    assert "Notification destination delivery failed" in caplog.text
    assert secret_url not in caplog.text
    assert "secret-token-123" not in caplog.text
    assert "private-topic" not in caplog.text


def test_scheduler_dispatches_once_across_users_and_retries(monkeypatch):
    token, family_id, user_id = _seed_member()
    other_token, _, other_user_id = _seed_member(family_id=family_id, suffix="other")
    assert token and other_token
    now = datetime(2026, 5, 10, 12, 0, 0)
    db = TestSession()
    try:
        db.add_all([
            NotificationPreference(user_id=user_id, reminders_enabled=True, reminder_minutes=30),
            NotificationPreference(user_id=other_user_id, reminders_enabled=True, reminder_minutes=30),
            _destination(family_id, user_id, events=["calendar.reminder"]),
        ])
        ev = CalendarEvent(
            family_id=family_id,
            title="Dentist",
            starts_at=now + timedelta(minutes=10),
            all_day=False,
        )
        db.add(ev)
        db.commit()
    finally:
        db.close()

    from app.core import notification_destinations as destinations_core
    from app.core import scheduler as scheduler_module

    calls = []
    monkeypatch.setattr(destinations_core, "is_provider_available", lambda: True)
    monkeypatch.setattr(destinations_core, "_send_with_apprise", lambda url, payload: calls.append(payload) or True)
    monkeypatch.setattr(scheduler_module, "send_push_for_user", lambda *_, **__: None)
    monkeypatch.setattr(scheduler_module, "utcnow", lambda: now)
    monkeypatch.setattr(scheduler_module, "local_wall_now", lambda _audit_now=None: now)
    monkeypatch.setattr(scheduler_module, "local_wall_to_utc_naive", lambda value: value)

    scheduler_module._check_notifications()
    scheduler_module._check_notifications()

    assert len(calls) == 1
    assert calls[0]["event_type"] == "calendar.reminder"
    assert calls[0]["source_type"] == "event"

    db = TestSession()
    try:
        deliveries = db.query(NotificationDestinationDelivery).all()
        assert len(deliveries) == 1
        assert deliveries[0].status == "delivered"
        assert deliveries[0].attempts == 1
    finally:
        db.close()


def test_provider_status_and_crud_accept_shopping_event_destinations():
    token, family_id, _ = _seed_member()

    status = client.get("/notification-destinations/provider/status", headers=_auth(token))
    assert status.status_code == 200
    assert "shopping.list.changed" in status.json()["events"]
    assert "shopping.item.changed" in status.json()["events"]

    created = client.post(
        "/notification-destinations",
        headers=_auth(token),
        json={
            "family_id": family_id,
            "name": "Shopping channel",
            "target_url_secret": "mailto://shopping@example.com",
            "events": ["shopping.list.changed", "shopping.item.changed"],
        },
    )
    assert created.status_code == 200, created.json()
    assert created.json()["events"] == ["shopping.item.changed", "shopping.list.changed"]

    invalid = client.post(
        "/notification-destinations",
        headers=_auth(token),
        json={
            "family_id": family_id,
            "name": "Audit channel",
            "target_url_secret": "mailto://audit@example.com",
            "events": ["audit.log.created"],
        },
    )
    assert invalid.status_code == 422


def test_shopping_list_destination_delivery_runs_after_saved_change(monkeypatch):
    token, family_id, user_id = _seed_member(scopes="admin:read,admin:write,shopping:read,shopping:write")
    db = TestSession()
    try:
        db.add(_destination(family_id, user_id, target_url_secret="mailto://shopping@example.com", events=["shopping.list.changed"]))
        db.commit()
    finally:
        db.close()

    from app.core import notification_destinations as destinations_core

    calls = []
    monkeypatch.setattr(destinations_core, "is_provider_available", lambda: True)

    def fake_send(_url, payload):
        check_db = TestSession()
        try:
            saved = check_db.get(ShoppingList, payload["source_id"])
            assert saved is not None
            assert saved.name == "Groceries"
        finally:
            check_db.close()
        calls.append(payload)
        return True

    monkeypatch.setattr(destinations_core, "_send_with_apprise", fake_send)

    resp = client.post(
        "/shopping/lists",
        headers=_auth(token),
        json={"family_id": family_id, "name": "Groceries"},
    )

    assert resp.status_code == 200, resp.json()
    assert len(calls) == 1
    assert calls[0]["event_type"] == "shopping.list.changed"
    assert calls[0]["source_type"] == "shopping_list"
    assert calls[0]["title"] == "Shopping list created"
    assert calls[0]["link"] == f"/shopping?list={resp.json()['id']}"

    db = TestSession()
    try:
        deliveries = db.query(NotificationDestinationDelivery).all()
        assert len(deliveries) == 1
        assert deliveries[0].status == "delivered"
    finally:
        db.close()


def test_shopping_item_destination_failure_is_isolated_and_filters_destinations(monkeypatch):
    token, family_id, user_id = _seed_member(scopes="admin:read,admin:write,shopping:read,shopping:write")
    created_list = client.post(
        "/shopping/lists",
        headers=_auth(token),
        json={"family_id": family_id, "name": "Errands"},
    )
    assert created_list.status_code == 200, created_list.json()
    list_id = created_list.json()["id"]

    db = TestSession()
    try:
        db.add_all([
            _destination(family_id, user_id, name="Matching", target_url_secret="mailto://shopping@example.com", events=["shopping.item.changed"]),
            _destination(family_id, user_id, name="Inactive", active=False, target_url_secret="mailto://inactive@example.com", events=["shopping.item.changed"]),
            _destination(family_id, user_id, name="Reminder only", target_url_secret="mailto://reminder@example.com", events=["calendar.reminder"]),
        ])
        db.commit()
    finally:
        db.close()

    from app.core import notification_destinations as destinations_core

    calls = []
    monkeypatch.setattr(destinations_core, "is_provider_available", lambda: True)

    def failing_send(_url, payload):
        calls.append(payload)
        raise RuntimeError("destination down")

    monkeypatch.setattr(destinations_core, "_send_with_apprise", failing_send)

    resp = client.post(
        f"/shopping/lists/{list_id}/items",
        headers=_auth(token),
        json={"name": "Milk"},
    )

    assert resp.status_code == 200, resp.json()
    assert len(calls) == 1
    assert calls[0]["event_type"] == "shopping.item.changed"
    assert calls[0]["source_type"] == "shopping_item"
    assert calls[0]["title"] == "Shopping item added"

    db = TestSession()
    try:
        saved_item = db.get(ShoppingItem, resp.json()["id"])
        assert saved_item is not None
        assert saved_item.name == "Milk"
        deliveries = db.query(NotificationDestinationDelivery).all()
        assert len(deliveries) == 1
        assert deliveries[0].status == "failed"
        assert deliveries[0].last_error == "send_failed"
    finally:
        db.close()


def test_shopping_item_destination_update_actions_include_unchecked(monkeypatch):
    token, family_id, user_id = _seed_member(scopes="admin:read,admin:write,shopping:read,shopping:write")
    created_list = client.post(
        "/shopping/lists",
        headers=_auth(token),
        json={"family_id": family_id, "name": "Market"},
    )
    assert created_list.status_code == 200, created_list.json()
    list_id = created_list.json()["id"]

    db = TestSession()
    try:
        db.add(_destination(family_id, user_id, target_url_secret="mailto://items@example.com", events=["shopping.item.changed"]))
        db.commit()
    finally:
        db.close()

    from app.core import notification_destinations as destinations_core

    calls = []
    monkeypatch.setattr(destinations_core, "is_provider_available", lambda: True)
    monkeypatch.setattr(destinations_core, "_send_with_apprise", lambda _url, payload: calls.append(payload) or True)

    created_item = client.post(
        f"/shopping/lists/{list_id}/items",
        headers=_auth(token),
        json={"name": "Apples"},
    )
    assert created_item.status_code == 200, created_item.json()
    item_id = created_item.json()["id"]

    checked = client.patch(f"/shopping/items/{item_id}", headers=_auth(token), json={"checked": True})
    assert checked.status_code == 200, checked.json()

    unchecked = client.patch(f"/shopping/items/{item_id}", headers=_auth(token), json={"checked": False})
    assert unchecked.status_code == 200, unchecked.json()

    assert [call["trigger_key"].split(":")[2] for call in calls] == ["created", "checked", "unchecked"]
    assert calls[-1]["body"] == 'User admin unchecked "Apples" on "Market".'


def test_shopping_template_apply_sends_item_destination_after_items_are_saved(monkeypatch):
    token, family_id, user_id = _seed_member(scopes="admin:read,admin:write,shopping:read,shopping:write")
    created_list = client.post(
        "/shopping/lists",
        headers=_auth(token),
        json={"family_id": family_id, "name": "Weekly shop"},
    )
    assert created_list.status_code == 200, created_list.json()
    list_id = created_list.json()["id"]

    db = TestSession()
    try:
        template = ShoppingTemplate(family_id=family_id, name="Breakfast", created_by_user_id=user_id)
        db.add(template)
        db.flush()
        db.add_all([
            ShoppingTemplateItem(template_id=template.id, name="Milk", position=0),
            ShoppingTemplateItem(template_id=template.id, name="Oats", position=1),
        ])
        db.add(_destination(family_id, user_id, target_url_secret="mailto://template@example.com", events=["shopping.item.changed"]))
        db.commit()
        template_id = template.id
    finally:
        db.close()

    from app.core import notification_destinations as destinations_core

    calls = []
    monkeypatch.setattr(destinations_core, "is_provider_available", lambda: True)

    def fake_send(_url, payload):
        check_db = TestSession()
        try:
            saved_items = check_db.query(ShoppingItem).filter(ShoppingItem.list_id == list_id).all()
            assert {item.name for item in saved_items} == {"Milk", "Oats"}
        finally:
            check_db.close()
        calls.append(payload)
        return True

    monkeypatch.setattr(destinations_core, "_send_with_apprise", fake_send)

    applied = client.post(
        f"/shopping/templates/{template_id}/apply",
        headers=_auth(token),
        json={"list_id": list_id},
    )

    assert applied.status_code == 200, applied.json()
    assert applied.json()["added_count"] == 2
    assert len(calls) == 1
    assert calls[0]["event_type"] == "shopping.item.changed"
    assert calls[0]["source_type"] == "shopping_list"
    assert calls[0]["source_id"] == list_id
    assert calls[0]["title"] == "Shopping items added"
    assert "2 items" in calls[0]["body"]


def test_recipe_add_to_shopping_sends_item_destination(monkeypatch):
    token, family_id, user_id = _seed_member(scopes="admin:read,admin:write,recipes:write")
    list_id = _seed_shopping_list(family_id, user_id, "Recipe list")
    _seed_shopping_destination(family_id, user_id)
    db = TestSession()
    try:
        recipe = Recipe(
            family_id=family_id,
            title="Pancakes",
            ingredients=[{"name": "Flour", "amount": 250, "unit": "g"}, {"name": "Milk", "amount": 1, "unit": "l"}],
            created_by_user_id=user_id,
        )
        db.add(recipe)
        db.commit()
        recipe_id = recipe.id
    finally:
        db.close()

    calls = _capture_destination_calls(monkeypatch)
    resp = client.post(
        f"/recipes/{recipe_id}/add-to-shopping",
        headers=_auth(token),
        json={"shopping_list_id": list_id, "ingredient_names": ["Flour", "Milk"]},
    )

    assert resp.status_code == 200, resp.json()
    assert resp.json()["added_count"] == 2
    assert [call["event_type"] for call in calls] == ["shopping.item.changed"]
    assert calls[0]["source_type"] == "shopping_list"
    assert calls[0]["source_id"] == list_id
    assert calls[0]["trigger_key"].split(":")[2] == "recipe_added"
    assert "2 ingredients" in calls[0]["body"]


def test_meal_plan_add_to_shopping_sends_single_and_week_item_destinations(monkeypatch):
    token, family_id, user_id = _seed_member(scopes="admin:read,admin:write,meal_plans:write")
    list_id = _seed_shopping_list(family_id, user_id, "Meal plan list")
    _seed_shopping_destination(family_id, user_id)
    db = TestSession()
    try:
        single = MealPlan(
            family_id=family_id,
            plan_date=date(2026, 5, 11),
            slot="noon",
            meal_name="Soup",
            ingredients=[{"name": "Carrot", "amount": 2, "unit": "pcs"}],
            created_by_user_id=user_id,
        )
        weekly = MealPlan(
            family_id=family_id,
            plan_date=date(2026, 5, 12),
            slot="evening",
            meal_name="Pasta",
            ingredients=[{"name": "Pasta", "amount": 500, "unit": "g"}],
            created_by_user_id=user_id,
        )
        db.add_all([single, weekly])
        db.commit()
        single_id = single.id
    finally:
        db.close()

    calls = _capture_destination_calls(monkeypatch)
    single_resp = client.post(
        f"/meal-plans/{single_id}/add-to-shopping",
        headers=_auth(token),
        json={"shopping_list_id": list_id},
    )
    week_resp = client.post(
        "/meal-plans/week/add-to-shopping",
        headers=_auth(token),
        json={"family_id": family_id, "week_start": "2026-05-11", "shopping_list_id": list_id},
    )

    assert single_resp.status_code == 200, single_resp.json()
    assert week_resp.status_code == 200, week_resp.json()
    assert [call["event_type"] for call in calls] == ["shopping.item.changed", "shopping.item.changed"]
    assert [call["trigger_key"].split(":")[2] for call in calls] == ["meal_plan_added", "meal_plan_week_added"]
    assert calls[0]["source_id"] == list_id
    assert calls[1]["source_id"] == list_id


def test_household_template_apply_sends_list_and_item_destinations(monkeypatch):
    token, family_id, user_id = _seed_member(scopes="admin:read,admin:write,household_templates:write")
    _seed_shopping_destination(family_id, user_id)
    db = TestSession()
    try:
        template = HouseholdTemplate(
            family_id=family_id,
            name="Party prep",
            task_items=[],
            shopping_items=[{"name": "Juice boxes", "spec": "12", "category": "Drinks"}],
            created_by_user_id=user_id,
        )
        db.add(template)
        db.commit()
        template_id = template.id
    finally:
        db.close()

    calls = _capture_destination_calls(monkeypatch)
    resp = client.post(
        f"/household-templates/{template_id}/apply",
        headers=_auth(token),
        json={"target_date": "2026-05-11", "shopping_list_name": "Party shop"},
    )

    assert resp.status_code == 200, resp.json()
    assert resp.json()["created_shopping_count"] == 1
    assert [call["event_type"] for call in calls] == ["shopping.list.changed", "shopping.item.changed"]
    assert [call["trigger_key"].split(":")[2] for call in calls] == ["household_template_list_created", "household_template_added"]
    assert calls[0]["source_id"] == resp.json()["shopping_list_id"]
    assert calls[1]["source_id"] == resp.json()["shopping_list_id"]


def test_quick_capture_shopping_routes_send_destinations(monkeypatch):
    token, family_id, user_id = _seed_member(scopes="admin:read,admin:write,quick_capture:write")
    _seed_shopping_destination(family_id, user_id)
    db = TestSession()
    try:
        inbox = QuickCaptureItem(family_id=family_id, text="Dish soap", created_by_user_id=user_id)
        db.add(inbox)
        db.commit()
        inbox_id = inbox.id
    finally:
        db.close()

    calls = _capture_destination_calls(monkeypatch)
    direct = client.post(
        "/quick-capture",
        headers=_auth(token),
        json={"family_id": family_id, "text": "Bananas", "destination": "shopping"},
    )
    converted = client.post(
        f"/quick-capture/inbox/{inbox_id}/convert",
        headers=_auth(token),
        json={"destination": "shopping"},
    )

    assert direct.status_code == 200, direct.json()
    assert converted.status_code == 200, converted.json()
    assert [call["event_type"] for call in calls] == [
        "shopping.list.changed",
        "shopping.item.changed",
        "shopping.item.changed",
    ]
    assert [call["trigger_key"].split(":")[2] for call in calls] == [
        "quick_capture_list_created",
        "quick_capture_added",
        "quick_capture_added",
    ]


def test_clear_checked_shopping_items_sends_item_destination(monkeypatch):
    token, family_id, user_id = _seed_member(scopes="admin:read,admin:write,shopping:write")
    list_id = _seed_shopping_list(family_id, user_id, "Checked list")
    _seed_shopping_destination(family_id, user_id)
    db = TestSession()
    try:
        db.add_all([
            ShoppingItem(list_id=list_id, name="Done one", checked=True, added_by_user_id=user_id),
            ShoppingItem(list_id=list_id, name="Done two", checked=True, added_by_user_id=user_id),
            ShoppingItem(list_id=list_id, name="Keep", checked=False, added_by_user_id=user_id),
        ])
        db.commit()
    finally:
        db.close()

    calls = _capture_destination_calls(monkeypatch)
    resp = client.delete(f"/shopping/lists/{list_id}/checked", headers=_auth(token))

    assert resp.status_code == 200, resp.json()
    assert resp.json()["deleted_count"] == 2
    assert [call["event_type"] for call in calls] == ["shopping.item.changed"]
    assert calls[0]["source_type"] == "shopping_list"
    assert calls[0]["source_id"] == list_id
    assert calls[0]["trigger_key"].split(":")[2] == "clear_checked"
    assert "cleared 2 checked items" in calls[0]["body"]


def test_shopping_destination_respects_household_quiet_hours(monkeypatch):
    token, family_id, user_id = _seed_member(scopes="admin:read,admin:write,shopping:read,shopping:write")
    _, _, other_user_id = _seed_member(family_id=family_id, suffix="quiet-member")
    now = datetime(2026, 5, 10, 1, 30, 0)

    db = TestSession()
    try:
        db.add_all([
            NotificationPreference(user_id=user_id, reminders_enabled=True, reminder_minutes=30, quiet_start="22:00", quiet_end="06:00"),
            NotificationPreference(user_id=other_user_id, reminders_enabled=True, reminder_minutes=30, quiet_start="22:00", quiet_end="06:00"),
            _destination(
                family_id,
                user_id,
                name="Quiet shopping channel",
                target_url_secret="mailto://quiet@example.com",
                events=["shopping.list.changed"],
                respect_quiet_hours=True,
            ),
        ])
        db.commit()
    finally:
        db.close()

    from app.core import notification_destinations as destinations_core

    calls = []
    monkeypatch.setattr(destinations_core, "utcnow", lambda: now)
    monkeypatch.setattr(destinations_core, "is_provider_available", lambda: True)
    monkeypatch.setattr(destinations_core, "_send_with_apprise", lambda _url, payload: calls.append(payload) or True)

    resp = client.post(
        "/shopping/lists",
        headers=_auth(token),
        json={"family_id": family_id, "name": "Quiet groceries"},
    )

    assert resp.status_code == 200, resp.json()
    assert calls == []

    db = TestSession()
    try:
        saved = db.get(ShoppingList, resp.json()["id"])
        assert saved is not None
        destination = db.query(NotificationDestination).filter(NotificationDestination.name == "Quiet shopping channel").one()
        assert destination.last_status == "quiet_hours"
        assert destination.last_error == "quiet_hours"
        assert db.query(NotificationDestinationDelivery).count() == 0
    finally:
        db.close()


def test_shopping_destination_sends_when_any_household_member_is_awake(monkeypatch):
    token, family_id, user_id = _seed_member(scopes="admin:read,admin:write,shopping:read,shopping:write")
    _, _, other_user_id = _seed_member(family_id=family_id, suffix="awake-member")
    now = datetime(2026, 5, 10, 22, 30, 0)

    db = TestSession()
    try:
        db.add_all([
            NotificationPreference(user_id=user_id, reminders_enabled=True, reminder_minutes=30, quiet_start="22:00", quiet_end="23:00"),
            NotificationPreference(user_id=other_user_id, reminders_enabled=True, reminder_minutes=30, quiet_start="23:00", quiet_end="06:00"),
            _destination(
                family_id,
                user_id,
                name="Awake shopping channel",
                target_url_secret="mailto://awake@example.com",
                events=["shopping.list.changed"],
                respect_quiet_hours=True,
            ),
        ])
        db.commit()
    finally:
        db.close()

    from app.core import notification_destinations as destinations_core

    calls = []
    monkeypatch.setattr(destinations_core, "utcnow", lambda: now)
    monkeypatch.setattr(destinations_core, "is_provider_available", lambda: True)
    monkeypatch.setattr(destinations_core, "_send_with_apprise", lambda _url, payload: calls.append(payload) or True)

    resp = client.post(
        "/shopping/lists",
        headers=_auth(token),
        json={"family_id": family_id, "name": "Awake groceries"},
    )

    assert resp.status_code == 200, resp.json()
    assert len(calls) == 1
    assert calls[0]["event_type"] == "shopping.list.changed"

    db = TestSession()
    try:
        destination = db.query(NotificationDestination).filter(NotificationDestination.name == "Awake shopping channel").one()
        assert destination.last_status == "delivered"
        assert db.query(NotificationDestinationDelivery).count() == 1
    finally:
        db.close()


def test_disabled_category_and_quiet_hours_aggregation(monkeypatch):
    token, family_id, user_id = _seed_member()
    other_token, _, other_user_id = _seed_member(family_id=family_id, suffix="awake")
    assert token and other_token
    now = datetime(2026, 5, 10, 22, 30, 0)
    db = TestSession()
    try:
        db.add_all([
            NotificationPreference(user_id=user_id, reminders_enabled=True, reminder_minutes=30, quiet_start="22:00", quiet_end="23:00"),
            NotificationPreference(user_id=other_user_id, reminders_enabled=True, reminder_minutes=30, quiet_start="23:00", quiet_end="06:00"),
            _destination(family_id, user_id, name="Inactive", active=False, events=["calendar.reminder"]),
            _destination(family_id, user_id, name="Wrong event", events=["task.reminder"]),
            _destination(family_id, user_id, name="Respect quiet", events=["calendar.reminder"], respect_quiet_hours=True),
            _destination(family_id, user_id, name="Bypass quiet", events=["calendar.reminder"], respect_quiet_hours=False),
        ])
        ev = CalendarEvent(
            family_id=family_id,
            title="Late pickup",
            starts_at=now + timedelta(minutes=10),
            all_day=False,
        )
        db.add(ev)
        db.commit()
    finally:
        db.close()

    from app.core import notification_destinations as destinations_core
    from app.core import scheduler as scheduler_module

    calls = []
    monkeypatch.setattr(destinations_core, "is_provider_available", lambda: True)
    monkeypatch.setattr(destinations_core, "_send_with_apprise", lambda url, payload: calls.append(payload) or True)
    monkeypatch.setattr(scheduler_module, "send_push_for_user", lambda *_, **__: None)
    monkeypatch.setattr(scheduler_module, "utcnow", lambda: now)
    monkeypatch.setattr(scheduler_module, "local_wall_now", lambda _audit_now=None: now)
    monkeypatch.setattr(scheduler_module, "local_wall_to_utc_naive", lambda value: value)

    scheduler_module._check_notifications()

    assert len(calls) == 2
    db = TestSession()
    try:
        assert db.query(NotificationDestinationDelivery).count() == 2
    finally:
        db.close()
