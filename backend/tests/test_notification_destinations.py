"""Apprise-backed human notification destination tests."""

from __future__ import annotations

import hashlib
from datetime import datetime, timedelta

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
    NotificationPreference,
    PersonalAccessToken,
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


def test_admin_crud_redacts_secret_and_audits_safe_metadata():
    token, family_id, _ = _seed_member()

    created = client.post(
        "/notification-destinations",
        headers=_auth(token),
        json={
            "family_id": family_id,
            "name": "Kitchen ntfy",
            "target_url_secret": "ntfy://ntfy.sh/placeholder-topic?token=placeholder-token",
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
            "target_url_secret": "gotify://host.example/token",
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
    assert denied_outsider.status_code == 403
    assert "token" not in str(denied_outsider.json()).lower()


@pytest.mark.parametrize("url", [
    "https://example.com/hook?token=secret-token",
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
        dest = _destination(family_id, user_id, target_url_secret="mailto://user@mail.example")
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
    assert calls[0][0] == "mailto://user@mail.example"
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

    scheduler_module._check_notifications()

    assert len(calls) == 2
    db = TestSession()
    try:
        assert db.query(NotificationDestinationDelivery).count() == 2
    finally:
        db.close()
