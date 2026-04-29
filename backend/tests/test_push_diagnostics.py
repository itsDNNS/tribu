"""Push notification diagnostics and test-send coverage."""

from __future__ import annotations

import hashlib

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app
from app.models import NotificationPreference, PersonalAccessToken, PushSubscription, User
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

    monkeypatch.delenv("VAPID_PUBLIC_KEY", raising=False)
    monkeypatch.delenv("VAPID_PRIVATE_KEY", raising=False)
    monkeypatch.delenv("VAPID_CLAIMS_EMAIL", raising=False)

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


client = TestClient(app)


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _seed_user(suffix: str = "push") -> tuple[str, int]:
    db = TestSession()
    user = User(
        email=f"{suffix}@example.com",
        password_hash=hash_password("Password123"),
        display_name="Push User",
    )
    db.add(user)
    db.flush()
    plain = f"{PAT_PREFIX}{suffix}-profile"
    lookup = hashlib.sha256(plain.encode()).hexdigest()
    db.add(
        PersonalAccessToken(
            user_id=user.id,
            name="push-pat",
            token_hash=lookup,
            token_lookup=lookup,
            scopes="profile:read,profile:write",
        )
    )
    db.commit()
    user_id = user.id
    db.close()
    return plain, user_id


def test_push_status_explains_missing_server_configuration_without_secrets():
    token, user_id = _seed_user("missing-vapid")
    db = TestSession()
    db.add(NotificationPreference(user_id=user_id, push_enabled=True))
    db.add(PushSubscription(user_id=user_id, endpoint="https://push.example/subscription-1", p256dh="p", auth="a"))
    db.commit()
    db.close()

    resp = client.get("/notifications/push/status", headers=_auth(token))

    assert resp.status_code == 200, resp.json()
    body = resp.json()
    assert body["server_configured"] is False
    assert body["vapid_public_key_available"] is False
    assert body["subscription_count"] == 1
    assert body["push_enabled"] is True
    assert body["ready"] is False
    assert body["blocked_reason"] == "server_not_configured"
    assert "VAPID_PUBLIC_KEY" not in str(body)
    assert "push.example" not in str(body)
    assert "subscription-1" not in str(body)


def test_push_subscribe_persists_subscription_and_enables_preference():
    token, user_id = _seed_user("subscribe")

    resp = client.post(
        "/notifications/push/subscribe",
        headers=_auth(token),
        json={"endpoint": "https://push.example/device-1", "p256dh": "key", "auth": "secret"},
    )

    assert resp.status_code == 200, resp.json()
    db = TestSession()
    try:
        pref = db.query(NotificationPreference).filter(NotificationPreference.user_id == user_id).one()
        sub = db.query(PushSubscription).filter(PushSubscription.user_id == user_id).one()
        assert pref.push_enabled is True
        assert sub.endpoint == "https://push.example/device-1"
    finally:
        db.close()


def test_push_status_treats_blank_vapid_values_as_not_configured(monkeypatch):
    token, user_id = _seed_user("blank-vapid")
    db = TestSession()
    db.add(NotificationPreference(user_id=user_id, push_enabled=True))
    db.add(PushSubscription(user_id=user_id, endpoint="https://push.example/subscription-blank", p256dh="p", auth="a"))
    db.commit()
    db.close()
    monkeypatch.setenv("VAPID_PUBLIC_KEY", " public ")
    monkeypatch.setenv("VAPID_PRIVATE_KEY", " private ")
    monkeypatch.setenv("VAPID_CLAIMS_EMAIL", "   ")

    resp = client.get("/notifications/push/status", headers=_auth(token))

    assert resp.status_code == 200, resp.json()
    body = resp.json()
    assert body["server_configured"] is False
    assert body["ready"] is False
    assert body["blocked_reason"] == "server_not_configured"


def test_push_test_skips_when_push_preference_is_disabled(monkeypatch):
    token, user_id = _seed_user("test-disabled")
    db = TestSession()
    db.add(NotificationPreference(user_id=user_id, push_enabled=False))
    db.add(PushSubscription(user_id=user_id, endpoint="https://push.example/private-disabled", p256dh="p", auth="a"))
    db.commit()
    db.close()
    monkeypatch.setenv("VAPID_PUBLIC_KEY", "public")
    monkeypatch.setenv("VAPID_PRIVATE_KEY", "private")
    monkeypatch.setenv("VAPID_CLAIMS_EMAIL", "admin@example.com")

    from app.modules import notifications_router

    calls = []

    def fake_send(*args, **kwargs):
        calls.append((args, kwargs))
        raise AssertionError("send_push_for_user should not be called when push is disabled")

    monkeypatch.setattr(notifications_router, "send_push_for_user", fake_send)

    resp = client.post("/notifications/push/test", headers=_auth(token))

    assert resp.status_code == 200, resp.json()
    assert calls == []
    assert resp.json() == {
        "status": "skipped",
        "attempted": 0,
        "succeeded": 0,
        "failed": 0,
        "removed": 0,
        "skipped_reason": "preference_disabled",
    }


def test_push_test_endpoint_uses_stored_subscriptions_and_redacts_failures(monkeypatch):
    token, user_id = _seed_user("test-send")
    db = TestSession()
    db.add(NotificationPreference(user_id=user_id, push_enabled=True))
    db.add(PushSubscription(user_id=user_id, endpoint="https://push.example/private-endpoint", p256dh="p", auth="a"))
    db.commit()
    db.close()

    monkeypatch.setenv("VAPID_PUBLIC_KEY", "public")
    monkeypatch.setenv("VAPID_PRIVATE_KEY", "private")
    monkeypatch.setenv("VAPID_CLAIMS_EMAIL", "admin@example.com")

    from app.core import push as push_module
    from app.modules import notifications_router

    calls = []

    def fake_send(db, uid, title, body, url=None):
        calls.append((uid, title, body, url))
        return push_module.PushResult(
            attempted=1,
            succeeded=0,
            failed=1,
            errors=["WebPushException: failed for https://push.example/private-endpoint"],
        )

    monkeypatch.setattr(notifications_router, "send_push_for_user", fake_send)

    resp = client.post("/notifications/push/test", headers=_auth(token))

    assert resp.status_code == 200, resp.json()
    body = resp.json()
    assert calls == [(user_id, "Tribu test notification", "Push notifications are ready for this device.", "settings")]
    assert body == {
        "status": "failed",
        "attempted": 1,
        "succeeded": 0,
        "failed": 1,
        "removed": 0,
        "skipped_reason": None,
    }
    assert "push.example" not in str(body)
    assert "private-endpoint" not in str(body)


def test_vapid_claim_subject_accepts_plain_email_or_mailto(monkeypatch):
    from app.core.push import get_vapid_claim_subject

    monkeypatch.setenv("VAPID_CLAIMS_EMAIL", "admin@example.com")
    assert get_vapid_claim_subject() == "mailto:admin@example.com"

    monkeypatch.setenv("VAPID_CLAIMS_EMAIL", "mailto:admin@example.com")
    assert get_vapid_claim_subject() == "mailto:admin@example.com"

    monkeypatch.setenv("VAPID_CLAIMS_EMAIL", " MAILTO:admin@example.com ")
    assert get_vapid_claim_subject() == "mailto:admin@example.com"

    monkeypatch.setenv("VAPID_CLAIMS_EMAIL", "mailto:   ")
    assert get_vapid_claim_subject() is None
