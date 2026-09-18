"""Delivery policy at the push-provider boundary, without contacting devices."""

import json
import base64
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
import pywebpush
from py_vapid import Vapid
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat

from app.core import push

REAL_WEBPUSH = pywebpush.webpush


@pytest.fixture
def sender(monkeypatch):
    now = datetime(2026, 9, 17, 13, 45)
    monkeypatch.setattr(push, "utcnow", lambda: now)
    monkeypatch.setenv("VAPID_PUBLIC_KEY", "public")
    monkeypatch.setenv("VAPID_PRIVATE_KEY", "private")
    monkeypatch.setenv("VAPID_CLAIMS_EMAIL", "ops@example.com")
    monkeypatch.setattr(push, "is_fcm_configured", lambda: False)
    db = MagicMock()
    db.query.return_value.filter.return_value.all.return_value = [
        SimpleNamespace(platform="web", endpoint="https://push.example/device", p256dh="key", auth="auth")
    ]
    send = MagicMock()
    monkeypatch.setattr(pywebpush, "webpush", send)
    return db, send, now


def test_calendar_push_wakes_idle_device_and_expires_at_start(sender):
    db, send, now = sender
    result = push.send_push_for_user(
        db, 1, "Music lesson", "Starts at 2026-09-17 16:45 (Europe/Berlin)",
        "/calendar?event=38", urgent=True,
        expires_at=(now + timedelta(hours=1)).replace(tzinfo=timezone.utc),
    )
    assert result.succeeded == 1
    request = send.call_args.kwargs
    assert request["headers"]["Urgency"] == "high"
    assert request["ttl"] == 3600
    assert request["timeout"] == 10
    assert json.loads(request["data"])["url"] == "/calendar?event=38"


def test_encrypted_webpush_request_carries_priority_expiry_and_timeout(sender, monkeypatch):
    db, _, now = sender
    receiver = ec.generate_private_key(ec.SECP256R1())
    public = receiver.public_key().public_bytes(Encoding.X962, PublicFormat.UncompressedPoint)
    sub = db.query.return_value.filter.return_value.all.return_value[0]
    sub.p256dh = base64.urlsafe_b64encode(public).rstrip(b"=").decode()
    sub.auth = base64.urlsafe_b64encode(b"0123456789abcdef").rstrip(b"=").decode()
    vapid = Vapid()
    vapid.generate_keys()
    monkeypatch.setattr(push, "get_vapid_private_key", lambda: vapid)
    monkeypatch.setattr(pywebpush, "webpush", REAL_WEBPUSH)
    post = MagicMock(return_value=SimpleNamespace(status_code=201, text="", headers={}))
    monkeypatch.setattr(pywebpush.requests, "post", post)

    result = push.send_push_for_user(db, 1, "Music lesson", "Starts at 16:45", urgent=True, expires_at=now + timedelta(hours=1))

    assert result.succeeded == 1
    request = post.call_args.kwargs
    headers = {key.lower(): value for key, value in request["headers"].items()}
    assert headers["urgency"] == "high"
    assert headers["ttl"] == "3600"
    assert headers["content-encoding"] == "aes128gcm"
    assert request["timeout"] == 10
    assert b"Music lesson" not in request["data"]


def test_ordinary_push_keeps_normal_priority(sender):
    db, send, _ = sender
    push.send_push_for_user(db, 1, "Shopping", "Milk added")
    assert send.call_args.kwargs["headers"]["Urgency"] == "normal"
    assert send.call_args.kwargs["ttl"] == 0
    assert send.call_args.kwargs["timeout"] == 10


@pytest.mark.parametrize("delay", [0, -1, -1800])
def test_expired_reminder_is_not_sent(sender, delay):
    db, send, now = sender
    result = push.send_push_for_user(
        db, 1, "Music lesson", "Starts at 16:45", urgent=True,
        expires_at=now + timedelta(seconds=delay),
    )
    send.assert_not_called()
    assert result.attempted == 0
    assert result.skipped_reason == "expired"


def test_slow_first_device_cannot_send_expired_reminder_to_next_device(sender, monkeypatch):
    db, send, now = sender
    subscriptions = db.query.return_value.filter.return_value.all.return_value
    subscriptions.append(SimpleNamespace(platform="web", endpoint="https://push.example/second", p256dh="k", auth="a"))
    send.side_effect = lambda **kwargs: monkeypatch.setattr(push, "utcnow", lambda: now + timedelta(seconds=20))
    result = push.send_push_for_user(
        db, 1, "Music lesson", "Starts at 16:45", urgent=True,
        expires_at=now + timedelta(seconds=10),
    )
    assert send.call_count == 1
    assert result.succeeded == 1
    assert result.skipped_reason == "expired"


def test_timeout_does_not_block_other_devices(sender):
    db, send, now = sender
    subscriptions = db.query.return_value.filter.return_value.all.return_value
    subscriptions.append(SimpleNamespace(platform="web", endpoint="https://push.example/second", p256dh="k", auth="a"))
    send.side_effect = [TimeoutError("provider unavailable"), None]
    result = push.send_push_for_user(db, 1, "Music lesson", "Starts at 16:45", urgent=True, expires_at=now + timedelta(hours=1))
    assert result.attempted == 2
    assert result.failed == 1
    assert result.succeeded == 1


@pytest.mark.parametrize("platform", ["expo", "fcm"])
def test_native_reminders_receive_same_delivery_policy(sender, monkeypatch, platform):
    db, _, now = sender
    db.query.return_value.filter.return_value.all.return_value = [SimpleNamespace(platform=platform, endpoint="device-token")]
    monkeypatch.setattr(push, "is_fcm_configured", lambda: True)
    send = MagicMock(return_value=(True, None, False))
    monkeypatch.setattr(push, f"_send_{platform}_push", send)
    result = push.send_push_for_user(db, 1, "Music lesson", "Starts at 16:45", urgent=True, expires_at=now + timedelta(minutes=30))
    assert result.succeeded == 1
    assert send.call_args.kwargs == {"urgent": True, "ttl": 1800}


@pytest.mark.parametrize("platform", ["expo", "fcm"])
def test_native_provider_payload_marks_reminders_urgent(monkeypatch, platform):
    monkeypatch.setattr(push, "_load_fcm_service_account", lambda: {"client_email": "test@example.com", "private_key": "test"})
    monkeypatch.setattr(push, "get_fcm_project_id", lambda: "test-project")
    monkeypatch.setattr(push, "_fcm_access_token", lambda account: "test-access-token")
    response = MagicMock()
    response.__enter__.return_value.read.return_value = b'{"data":{"status":"ok"}}'
    request = MagicMock(return_value=response)
    monkeypatch.setattr(push.urllib.request, "urlopen", request)

    result = getattr(push, f"_send_{platform}_push")("device", "Music lesson", "Starts at 16:45", urgent=True, ttl=1800)

    assert result == (True, None, False)
    payload = json.loads(request.call_args.args[0].data)
    if platform == "expo":
        assert payload["priority"] == "high"
        assert payload["ttl"] == 1800
    else:
        assert payload["message"]["android"] == {"priority": "high", "ttl": "1800s"}
