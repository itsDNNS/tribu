"""Outbound webhook endpoint and delivery tests."""

from __future__ import annotations

import json
import urllib.error

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models import WebhookDelivery, WebhookEndpoint
from tests.support import TestSession, auth, seed_member, seed_shopping_list

pytestmark = pytest.mark.usefixtures("app_db")

client = TestClient(app)


def _seed_admin(scopes: str = "admin:read,admin:write,shopping:write") -> tuple[str, int, int]:
    member = seed_member(
        "webhooks@example.com", scopes=scopes, family_name="Webhook Family", password="Password123",
        display_name="Webhook Admin", pat_name="webhook-pat",
    )
    return member.token, member.family_id, member.user_id


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
        headers=auth(token),
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
        headers=auth(token),
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
        headers=auth(token),
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
    monkeypatch.setattr(webhooks_core, "validate_http_url_route", lambda url, allow_private_networks=False: url)

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

    resp = client.post(f"/webhooks/{endpoint_id}/test", headers=auth(token))

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

    resp = client.post(f"/webhooks/{endpoint_id}/test", headers=auth(token))

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

    resp = client.post(f"/webhooks/{endpoint_id}/test", headers=auth(token))

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

    resp = client.post(f"/webhooks/{endpoint_id}/test", headers=auth(token))

    assert resp.status_code == 200, resp.json()
    body = resp.json()
    assert body["status"] == "failed"
    assert body["delivery"]["status_code"] is None
    assert body["delivery"]["error"] == "TimeoutError"
    assert "token=private" not in str(body)
    assert "secret-value" not in str(body)


def test_subscribed_shopping_event_creates_delivery(monkeypatch):
    token, family_id, user_id = _seed_admin()
    list_id = seed_shopping_list(family_id, user_id=user_id)
    db = TestSession()
    db.add(WebhookEndpoint(
        family_id=family_id,
        name="Shopping Automation",
        url="https://automation.example/hook",
        events=["shopping.item.created"],
        active=True,
    ))
    db.commit()
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
        headers=auth(token),
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
        headers=auth(token),
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
    list_id = seed_shopping_list(family_id, user_id=user_id)
    db = TestSession()
    db.add_all(
        [
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
    db.close()

    from app.core import webhooks as webhooks_core

    def fake_post(*args, **kwargs):
        raise AssertionError("No webhook should be sent")

    monkeypatch.setattr(webhooks_core, "_post_webhook_json", fake_post)

    resp = client.post(
        f"/shopping/lists/{list_id}/items",
        headers=auth(token),
        json={"name": "Bread"},
    )

    assert resp.status_code == 200, resp.json()
    db = TestSession()
    try:
        assert db.query(WebhookDelivery).count() == 0
    finally:
        db.close()


def test_webhook_delivery_blocks_private_network_targets(monkeypatch):
    token, family_id, _ = _seed_admin()
    endpoint_id = _seed_webhook_endpoint(family_id, url="https://receiver.example/hook")

    from app.core import webhooks as webhooks_core
    from app.core.calendar_subscriptions import IcsSubscriptionError

    def reject_private(url, *, allow_private_networks=False):
        raise IcsSubscriptionError("Subscription URL host is not allowed")

    called = {"opened": False}

    class FakeOpener:
        def open(self, request, *, timeout):
            called["opened"] = True
            raise AssertionError("network opener should not be called")

    monkeypatch.setattr(webhooks_core, "validate_http_url_route", reject_private)
    monkeypatch.setattr(webhooks_core, "_WEBHOOK_OPENER", FakeOpener())

    resp = client.post(f"/webhooks/{endpoint_id}/test", headers=auth(token))

    assert resp.status_code == 200, resp.json()
    body = resp.json()
    assert body["status"] == "failed"
    assert body["delivery"]["error"] == "NetworkTargetNotAllowed"
    assert called["opened"] is False


def test_webhook_delivery_reaches_private_hosts_only_when_listed(monkeypatch):
    import socket

    from app.core import calendar_subscriptions
    from app.core import webhooks as webhooks_core
    from app.core.calendar_subscriptions import IcsSubscriptionError

    opened = []

    class FakeResponse:
        status = 200

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

    class FakeOpener:
        def open(self, request, *, timeout):
            opened.append(request.full_url)
            return FakeResponse()

    def lan_dns(host, port, *args, **kwargs):
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("192.168.1.50", port))]

    monkeypatch.setattr(calendar_subscriptions.socket, "getaddrinfo", lan_dns)
    monkeypatch.setattr(webhooks_core, "_WEBHOOK_OPENER", FakeOpener())
    monkeypatch.setenv("WEBHOOK_ALLOWED_HOSTS", " HomeAssistant.lan , 10.0.0.9")

    status = webhooks_core._post_webhook_json("https://homeassistant.lan/api/webhook/abc", payload={}, headers={})
    assert status == 200
    assert opened == ["https://homeassistant.lan/api/webhook/abc"]

    with pytest.raises(IcsSubscriptionError):
        webhooks_core._post_webhook_json("https://router.lan/admin", payload={}, headers={})
    assert len(opened) == 1
