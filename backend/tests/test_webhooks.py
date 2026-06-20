"""Outbound webhook endpoint and delivery tests."""

from __future__ import annotations

import hashlib
import json
import urllib.error

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401 - ensure all models are registered before create_all
from app.database import Base, get_db
from app.main import app
from app.models import Family, Membership, PersonalAccessToken, ShoppingList, User, WebhookDelivery, WebhookEndpoint
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
def setup_db():
    Base.metadata.drop_all(bind=engine)
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


client = TestClient(app)


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _seed_admin(scopes: str = "admin:read,admin:write,shopping:write") -> tuple[str, int, int]:
    db = TestSession()
    try:
        family = Family(name="Webhook Family")
        user = User(email="webhooks@example.com", password_hash=hash_password("Password123"), display_name="Webhook Admin")
        db.add_all([family, user])
        db.flush()
        db.add(Membership(user_id=user.id, family_id=family.id, role="admin", is_adult=True))
        plain = f"{PAT_PREFIX}webhook-admin"
        lookup = hashlib.sha256(plain.encode()).hexdigest()
        db.add(
            PersonalAccessToken(
                user_id=user.id,
                name="webhook-pat",
                token_hash=lookup,
                token_lookup=lookup,
                scopes=scopes,
            )
        )
        db.commit()
        return plain, family.id, user.id
    finally:
        db.close()


def _seed_webhook_endpoint(family_id: int, *, url: str = "https://receiver.example/hook?token=private") -> int:
    db = TestSession()
    try:
        endpoint = WebhookEndpoint(
            family_id=family_id,
            name="Receiver",
            url=url,
            events=["webhook.test"],
            active=True,
            secret_header_name="X-Tribu-Secret",
            secret_header_value="secret-value",
        )
        db.add(endpoint)
        db.commit()
        return int(endpoint.id)
    finally:
        db.close()



def test_create_webhook_redacts_url_and_secret():
    token, family_id, _ = _seed_admin()

    resp = client.post(
        "/webhooks",
        headers=_auth(token),
        json={
            "family_id": family_id,
            "name": "Home Assistant",
            "url": "https://ha.example/[redacted]?secret=private",
            "events": ["shopping.item.created", "task.created"],
            "secret_header_name": "X-Tribu-Secret",
            "secret_header_value": "super-secret",
        },
    )

    assert resp.status_code == 200, resp.json()
    body = resp.json()
    assert body["name"] == "Home Assistant"
    assert body["url_redacted"] == "https://ha.example/[redacted]"
    assert body["has_secret"] is True
    assert "super-secret" not in str(body)
    assert "secret=private" not in str(body)
    assert "api/webhook/token" not in str(body)


def test_rejects_invalid_webhook_url_without_echoing_secret_path():
    token, family_id, _ = _seed_admin()
    secret_url = "http://ha.example/api/webhook/private-token?secret=private-secret"

    resp = client.post(
        "/webhooks",
        headers=_auth(token),
        json={
            "family_id": family_id,
            "name": "Unsafe endpoint",
            "url": secret_url,
            "events": ["webhook.test"],
        },
    )

    assert resp.status_code == 422
    body_text = str(resp.json())
    assert "private-token" not in body_text
    assert "private-secret" not in body_text
    assert secret_url not in body_text
    assert "[redacted]" in body_text


def test_rejects_reserved_secret_header_name():
    token, family_id, _ = _seed_admin()

    resp = client.post(
        "/webhooks",
        headers=_auth(token),
        json={
            "family_id": family_id,
            "name": "Reserved header",
            "url": "https://ha.example/webhook",
            "events": ["webhook.test"],
            "secret_header_name": "Authorization",
            "secret_header_value": "secret-value",
        },
    )

    assert resp.status_code == 422
    assert "secret-value" not in str(resp.json())


def test_webhook_stdlib_post_sets_method_headers_payload_and_timeout(monkeypatch):
    from app.core import webhooks as webhooks_core

    calls = []

    class FakeResponse:
        status = 201

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

    class FakeOpener:
        def open(self, request, *, timeout):
            calls.append({"request": request, "timeout": timeout})
            return FakeResponse()

    monkeypatch.setattr(webhooks_core, "_WEBHOOK_OPENER", FakeOpener())

    status = webhooks_core._post_webhook_json(
        "https://receiver.example/hook",
        payload={"event_type": "webhook.test", "data": {"message": "hello"}},
        headers={"Content-Type": "application/json", "User-Agent": "Tribu-Webhooks/1.0", "X-Tribu-Secret": "secret"},
    )

    assert status == 201
    request = calls[0]["request"]
    assert request.get_method() == "POST"
    assert calls[0]["timeout"] == webhooks_core.WEBHOOK_TIMEOUT_SECONDS
    assert dict(request.header_items())["Content-type"] == "application/json"
    assert dict(request.header_items())["User-agent"] == "Tribu-Webhooks/1.0"
    assert dict(request.header_items())["X-tribu-secret"] == "secret"
    assert json.loads(request.data.decode("utf-8"))["event_type"] == "webhook.test"


def test_test_webhook_sends_redacted_delivery(monkeypatch):
    token, family_id, _ = _seed_admin()
    endpoint_id = _seed_webhook_endpoint(family_id)

    calls = []

    class FakeResponse:
        status_code = 204

    def fake_post(url, *, payload, headers):
        calls.append({"url": url, "payload": payload, "headers": headers})
        return FakeResponse.status_code

    from app.core import webhooks as webhooks_core

    monkeypatch.setattr(webhooks_core, "_post_webhook_json", fake_post)

    resp = client.post(f"/webhooks/{endpoint_id}/test", headers=_auth(token))

    assert resp.status_code == 200, resp.json()
    body = resp.json()
    assert body["status"] == "delivered"
    assert body["delivery"]["status_code"] == 204
    assert calls[0]["url"] == "https://receiver.example/hook?token=private"
    assert calls[0]["headers"]["X-Tribu-Secret"] == "secret-value"
    assert calls[0]["payload"]["event_type"] == "webhook.test"
    assert "receiver.example" not in str(body)
    assert "secret-value" not in str(body)


def test_webhook_status_code_failure_is_recorded_safely(monkeypatch):
    token, family_id, _ = _seed_admin()
    endpoint_id = _seed_webhook_endpoint(family_id)

    from app.core import webhooks as webhooks_core

    monkeypatch.setattr(webhooks_core, "_post_webhook_json", lambda *_args, **_kwargs: 503)

    resp = client.post(f"/webhooks/{endpoint_id}/test", headers=_auth(token))

    assert resp.status_code == 200, resp.json()
    body = resp.json()
    assert body["status"] == "failed"
    assert body["delivery"]["status_code"] == 503
    assert body["delivery"]["error"] == "HTTP 503"
    assert "secret-value" not in str(body)
    assert "token=private" not in str(body)


def test_webhook_connection_error_records_safe_operator_error(monkeypatch):
    token, family_id, _ = _seed_admin()
    endpoint_id = _seed_webhook_endpoint(family_id)

    def raise_connection_error(*_args, **_kwargs):
        raise urllib.error.URLError(ConnectionRefusedError("connection refused for token=private"))

    from app.core import webhooks as webhooks_core

    monkeypatch.setattr(webhooks_core, "_post_webhook_json", raise_connection_error)

    resp = client.post(f"/webhooks/{endpoint_id}/test", headers=_auth(token))

    assert resp.status_code == 200, resp.json()
    body = resp.json()
    assert body["status"] == "failed"
    assert body["delivery"]["status_code"] is None
    assert body["delivery"]["error"] == "ConnectionRefusedError"
    assert "token=private" not in str(body)
    assert "secret-value" not in str(body)


def test_webhook_timeout_error_records_safe_operator_error(monkeypatch):
    token, family_id, _ = _seed_admin()
    endpoint_id = _seed_webhook_endpoint(family_id)

    def raise_timeout(*_args, **_kwargs):
        raise TimeoutError("timeout for token=private")

    from app.core import webhooks as webhooks_core

    monkeypatch.setattr(webhooks_core, "_post_webhook_json", raise_timeout)

    resp = client.post(f"/webhooks/{endpoint_id}/test", headers=_auth(token))

    assert resp.status_code == 200, resp.json()
    body = resp.json()
    assert body["status"] == "failed"
    assert body["delivery"]["status_code"] is None
    assert body["delivery"]["error"] == "TimeoutError"
    assert "token=private" not in str(body)
    assert "secret-value" not in str(body)


def test_subscribed_shopping_event_creates_delivery(monkeypatch):
    token, family_id, user_id = _seed_admin()
    db = TestSession()
    shopping_list = ShoppingList(family_id=family_id, name="Groceries", created_by_user_id=user_id)
    endpoint = WebhookEndpoint(
        family_id=family_id,
        name="Shopping Automation",
        url="https://automation.example/hook",
        events=["shopping.item.created"],
        active=True,
    )
    db.add_all([shopping_list, endpoint])
    db.commit()
    list_id = shopping_list.id
    db.close()

    sent_payloads = []

    class FakeResponse:
        status_code = 200

    def fake_post(url, *, payload, headers):
        sent_payloads.append(payload)
        return FakeResponse.status_code

    from app.core import webhooks as webhooks_core

    monkeypatch.setattr(webhooks_core, "_post_webhook_json", fake_post)

    resp = client.post(
        f"/shopping/lists/{list_id}/items",
        headers=_auth(token),
        json={"name": "Milch"},
    )

    assert resp.status_code == 200, resp.json()
    assert sent_payloads[0]["event_type"] == "shopping.item.created"
    assert sent_payloads[0]["family_id"] == family_id
    assert sent_payloads[0]["data"]["name"] == "Milch"

    db = TestSession()
    try:
        delivery = db.query(WebhookDelivery).one()
        assert delivery.status == "delivered"
        assert delivery.status_code == 200
    finally:
        db.close()


def test_task_event_creates_delivery(monkeypatch):
    token, family_id, _ = _seed_admin("admin:read,admin:write,tasks:write")
    db = TestSession()
    endpoint = WebhookEndpoint(
        family_id=family_id,
        name="Task Automation",
        url="https://automation.example/tasks",
        events=["task.created"],
        active=True,
    )
    db.add(endpoint)
    db.commit()
    db.close()

    sent_payloads = []

    class FakeResponse:
        status_code = 202

    def fake_post(url, *, payload, headers):
        sent_payloads.append(payload)
        return FakeResponse.status_code

    from app.core import webhooks as webhooks_core

    monkeypatch.setattr(webhooks_core, "_post_webhook_json", fake_post)

    resp = client.post(
        "/tasks",
        headers=_auth(token),
        json={"family_id": family_id, "title": "Pack sports bag"},
    )

    assert resp.status_code == 200, resp.json()
    assert sent_payloads[0]["event_type"] == "task.created"
    assert sent_payloads[0]["family_id"] == family_id
    assert sent_payloads[0]["data"]["title"] == "Pack sports bag"

    db = TestSession()
    try:
        delivery = db.query(WebhookDelivery).one()
        assert delivery.status == "delivered"
        assert delivery.status_code == 202
    finally:
        db.close()


def test_inactive_or_unsubscribed_webhooks_are_skipped(monkeypatch):
    token, family_id, user_id = _seed_admin()
    db = TestSession()
    shopping_list = ShoppingList(family_id=family_id, name="Groceries", created_by_user_id=user_id)
    db.add_all(
        [
            shopping_list,
            WebhookEndpoint(
                family_id=family_id,
                name="Inactive",
                url="https://inactive.example/hook",
                events=["shopping.item.created"],
                active=False,
            ),
            WebhookEndpoint(
                family_id=family_id,
                name="Other Event",
                url="https://other.example/hook",
                events=["task.created"],
                active=True,
            ),
        ]
    )
    db.commit()
    list_id = shopping_list.id
    db.close()

    from app.core import webhooks as webhooks_core

    def fake_post(*args, **kwargs):
        raise AssertionError("No webhook should be sent")

    monkeypatch.setattr(webhooks_core, "_post_webhook_json", fake_post)

    resp = client.post(
        f"/shopping/lists/{list_id}/items",
        headers=_auth(token),
        json={"name": "Bread"},
    )

    assert resp.status_code == 200, resp.json()
    db = TestSession()
    try:
        assert db.query(WebhookDelivery).count() == 0
    finally:
        db.close()
