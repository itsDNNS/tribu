"""Human notification destination helpers."""

from __future__ import annotations

import base64
import hashlib
import importlib
import ipaddress
import logging
import os
import socket
import threading
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime
from typing import Any
from urllib.parse import urlsplit

from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy.exc import IntegrityError

from app.core.clock import utcnow
from app.database import SessionLocal
from app.models import Membership, NotificationDestination, NotificationDestinationDelivery, NotificationPreference

logger = logging.getLogger(__name__)

ALLOWED_APPRISE_SCHEMES = {
    "gotify",
    "gotifys",
    "ntfy",
    "ntfys",
    "tgram",
    "matrix",
    "matrixs",
    "mailto",
    "mailtos",
    "smtp",
    "smtps",
}

NETWORK_TARGET_SCHEMES = {"gotify", "gotifys", "ntfy", "ntfys", "matrix", "matrixs", "mailto", "mailtos", "smtp", "smtps"}
REMINDER_EVENT_TYPES = {"calendar.reminder", "task.reminder", "birthday.reminder"}
SHOPPING_EVENT_TYPES = {"shopping.list.changed", "shopping.item.changed"}
DESTINATION_EVENT_TYPES = REMINDER_EVENT_TYPES | SHOPPING_EVENT_TYPES
TEST_EVENT_TYPE = "notification.test"
ENCRYPTED_TARGET_PREFIX = "enc:v1:"
DEFAULT_CONNECT_TIMEOUT_SECONDS = 4.0
DEFAULT_READ_TIMEOUT_SECONDS = 4.0
_APPRISE_EGRESS_GUARD_LOCK = threading.Lock()
SAFE_ERROR_CODES = {
    "invalid_url",
    "provider_unavailable",
    "send_failed",
    "timeout",
    "quiet_hours",
    "disabled",
    "duplicate",
}


@dataclass(frozen=True)
class EligibleReminderUser:
    user_id: int
    in_quiet_hours: bool


def validate_target_url(value: str) -> str:
    cleaned = (value or "").strip()
    try:
        parsed = urlsplit(cleaned)
    except ValueError as exc:
        raise ValueError("Invalid notification destination URL") from exc
    scheme = parsed.scheme.lower()
    if not parsed.scheme or scheme not in ALLOWED_APPRISE_SCHEMES:
        raise ValueError("Invalid notification destination URL")
    if scheme in NETWORK_TARGET_SCHEMES and not parsed.netloc:
        raise ValueError("Invalid notification destination URL")
    if not (parsed.netloc or parsed.path):
        raise ValueError("Invalid notification destination URL")
    if scheme in NETWORK_TARGET_SCHEMES:
        _validate_egress_host(parsed.hostname)
    return cleaned


def protect_target_url(value: str) -> str:
    """Validate and encrypt a destination URL before database storage."""

    cleaned = validate_target_url(value)
    if cleaned.startswith(ENCRYPTED_TARGET_PREFIX):
        return cleaned
    token = _target_url_fernet().encrypt(cleaned.encode("utf-8")).decode("ascii")
    return f"{ENCRYPTED_TARGET_PREFIX}{token}"


def reveal_target_url(value: str | None) -> str:
    """Return the usable destination URL, decrypting new rows and preserving legacy rows."""

    if not value:
        return ""
    if not value.startswith(ENCRYPTED_TARGET_PREFIX):
        return value
    token = value[len(ENCRYPTED_TARGET_PREFIX):]
    try:
        return _target_url_fernet().decrypt(token.encode("ascii")).decode("utf-8")
    except (InvalidToken, UnicodeDecodeError, ValueError) as exc:
        raise ValueError("Invalid notification destination URL") from exc


def _target_url_fernet() -> Fernet:
    raw_secret = os.getenv("NOTIFICATION_DESTINATION_SECRET_KEY") or os.getenv("JWT_SECRET") or ""
    if not raw_secret:
        raise RuntimeError("NOTIFICATION_DESTINATION_SECRET_KEY or JWT_SECRET is required")
    key = base64.urlsafe_b64encode(hashlib.sha256(raw_secret.encode("utf-8")).digest())
    return Fernet(key)


def _allowed_private_hosts() -> set[str]:
    raw = os.getenv("NOTIFICATION_DESTINATION_ALLOWED_HOSTS", "")
    return {part.strip().lower().strip("[]") for part in raw.replace(";", ",").split(",") if part.strip()}


def _private_hosts_globally_allowed() -> bool:
    return os.getenv("NOTIFICATION_DESTINATION_ALLOW_PRIVATE_HOSTS", "").lower() in {"1", "true", "yes", "on"}


def _is_unsafe_address(address: str) -> bool:
    try:
        ip = ipaddress.ip_address(address)
    except ValueError:
        return True
    return bool(not ip.is_global or ip.is_multicast)


def _host_is_allowlisted(host: str, addresses: list[str]) -> bool:
    allowed = _allowed_private_hosts()
    if not allowed:
        return False
    host_key = host.lower().strip("[]")
    return host_key in allowed or any(address.lower().strip("[]") in allowed for address in addresses)


def _validate_egress_host(host: str | None) -> None:
    if not host:
        raise ValueError("Invalid notification destination URL")
    normalized = host.lower().strip("[]")
    if _private_hosts_globally_allowed():
        return

    addresses = _resolve_egress_addresses(normalized)

    if _host_is_allowlisted(normalized, addresses):
        return
    if not addresses or normalized == "localhost" or any(_is_unsafe_address(address) for address in addresses):
        raise ValueError("Invalid notification destination URL")


def _resolve_egress_addresses(host: str) -> list[str]:
    try:
        ipaddress.ip_address(host)
        return [host]
    except ValueError:
        if host == "localhost":
            return ["127.0.0.1"]
        try:
            infos = socket.getaddrinfo(host, None, proto=socket.IPPROTO_TCP)
        except socket.gaierror:
            return []
        return sorted({str(info[4][0]) for info in infos if info and info[4]})


@contextmanager
def _guard_apprise_egress_resolution():
    if _private_hosts_globally_allowed():
        yield
        return

    with _APPRISE_EGRESS_GUARD_LOCK:
        original_getaddrinfo = socket.getaddrinfo

        def guarded_getaddrinfo(host, port, family=0, type=0, proto=0, flags=0):
            infos = original_getaddrinfo(host, port, family, type, proto, flags)
            if host is None:
                return infos
            normalized = str(host).lower().strip("[]")
            addresses = sorted({str(info[4][0]) for info in infos if info and info[4]})
            if _host_is_allowlisted(normalized, addresses):
                return infos
            if not addresses or normalized == "localhost" or any(_is_unsafe_address(address) for address in addresses):
                raise ValueError("Invalid notification destination URL")
            return infos

        socket.getaddrinfo = guarded_getaddrinfo
        try:
            yield
        finally:
            socket.getaddrinfo = original_getaddrinfo


def clean_events(events: list[str], *, allow_test: bool = False) -> list[str]:
    allowed = set(DESTINATION_EVENT_TYPES)
    if allow_test:
        allowed.add(TEST_EVENT_TYPE)
    cleaned = sorted({event.strip() for event in (events or []) if event and event.strip()})
    invalid = [event for event in cleaned if event not in allowed]
    if invalid:
        raise ValueError("Unsupported notification destination event")
    return cleaned


def redact_target_url(url: str | None) -> str:
    if not url:
        return "[redacted]"
    try:
        url = reveal_target_url(url)
    except ValueError:
        return "[redacted]"
    try:
        parsed = urlsplit(url)
    except ValueError:
        return "[redacted]"
    scheme = parsed.scheme.lower()
    if scheme in ALLOWED_APPRISE_SCHEMES:
        return f"{scheme}://[redacted]"
    if scheme:
        return f"{scheme}://[redacted]"
    return "[redacted]"


def destination_response(destination: NotificationDestination) -> dict[str, Any]:
    return {
        "id": destination.id,
        "family_id": destination.family_id,
        "name": destination.name,
        "provider": destination.provider,
        "url_redacted": redact_target_url(destination.target_url_secret),
        "events": destination.events or [],
        "active": destination.active,
        "respect_quiet_hours": destination.respect_quiet_hours,
        "has_secret": bool(destination.target_url_secret),
        "created_at": destination.created_at,
        "updated_at": destination.updated_at,
        "last_attempted_at": destination.last_attempted_at,
        "last_success_at": destination.last_success_at,
        "last_status": destination.last_status or "never",
        "last_error": _safe_error(destination.last_error),
    }


def provider_status() -> dict[str, Any]:
    return {
        "provider": "apprise",
        "available": is_provider_available(),
        "allowed_schemes": sorted(ALLOWED_APPRISE_SCHEMES),
        "events": sorted(DESTINATION_EVENT_TYPES),
    }


def is_provider_available() -> bool:
    try:
        importlib.import_module("apprise")
        return True
    except Exception:
        return False


def _safe_error(value: str | None) -> str | None:
    if not value:
        return None
    return value if value in SAFE_ERROR_CODES else "send_failed"


def _send_with_apprise(url: str, payload: dict[str, Any]) -> bool:
    apprise_module = importlib.import_module("apprise")
    notifier = apprise_module.Apprise()
    if not notifier.add(url):
        return False
    connect_timeout, read_timeout = _apprise_timeout_pair()
    for server in notifier.servers:
        if hasattr(server, "socket_connect_timeout"):
            server.socket_connect_timeout = connect_timeout
        if hasattr(server, "socket_read_timeout"):
            server.socket_read_timeout = read_timeout
    title = str(payload.get("title") or "Tribu")
    body_parts = [str(payload.get("body") or "").strip()]
    link = str(payload.get("link") or "").strip()
    if link:
        body_parts.append(link)
    body = "\n".join(part for part in body_parts if part)
    with _guard_apprise_egress_resolution():
        return bool(notifier.notify(title=title, body=body))


def _apprise_timeout_pair() -> tuple[float, float]:
    return (
        _float_env("NOTIFICATION_DESTINATION_CONNECT_TIMEOUT_SECONDS", DEFAULT_CONNECT_TIMEOUT_SECONDS),
        _float_env("NOTIFICATION_DESTINATION_READ_TIMEOUT_SECONDS", DEFAULT_READ_TIMEOUT_SECONDS),
    )


def _float_env(name: str, default: float) -> float:
    try:
        value = float(os.getenv(name, str(default)))
    except (TypeError, ValueError):
        return default
    return max(0.5, min(value, 30.0))


def _claim_delivery(db, destination: NotificationDestination, payload: dict[str, Any]) -> NotificationDestinationDelivery | None:
    delivery = NotificationDestinationDelivery(
        destination_id=destination.id,
        family_id=destination.family_id,
        event_type=payload["event_type"],
        source_type=payload["source_type"],
        source_id=payload["source_id"],
        trigger_key=payload["trigger_key"],
        status="pending",
        attempts=0,
    )
    db.add(delivery)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        return None
    db.refresh(delivery)
    return delivery


def _mark_destination(destination: NotificationDestination, *, status: str, now: datetime, error: str | None = None) -> None:
    destination.last_attempted_at = now
    destination.last_status = status
    destination.last_error = _safe_error(error)
    if status == "delivered":
        destination.last_success_at = now


def _deliver_claimed(db, destination: NotificationDestination, delivery: NotificationDestinationDelivery, payload: dict[str, Any]) -> NotificationDestinationDelivery:
    now = utcnow()
    delivery.attempts = (delivery.attempts or 0) + 1
    delivery.last_attempted_at = now
    _mark_destination(destination, status="pending", now=now)
    db.commit()

    if not is_provider_available():
        delivery.status = "failed"
        delivery.last_error = "provider_unavailable"
        _mark_destination(destination, status="failed", now=utcnow(), error="provider_unavailable")
        db.commit()
        db.refresh(delivery)
        return delivery

    try:
        target_url = reveal_target_url(destination.target_url_secret)
        validate_target_url(target_url)
        sent = _send_with_apprise(target_url, payload)
    except ValueError:
        delivery.status = "failed"
        delivery.last_error = "invalid_url"
    except TimeoutError:
        delivery.status = "failed"
        delivery.last_error = "timeout"
    except Exception:
        logger.warning("Notification destination delivery failed for destination %s", destination.id)
        delivery.status = "failed"
        delivery.last_error = "send_failed"
    else:
        if sent:
            delivery.status = "delivered"
            delivery.last_error = None
            delivery.last_success_at = utcnow()
        else:
            delivery.status = "failed"
            delivery.last_error = "send_failed"

    finish = utcnow()
    _mark_destination(destination, status=delivery.status, now=finish, error=delivery.last_error)
    db.commit()
    db.refresh(delivery)
    return delivery


def send_test_notification(destination_id: int) -> NotificationDestinationDelivery | None:
    db = SessionLocal()
    try:
        destination = db.query(NotificationDestination).filter(NotificationDestination.id == destination_id).first()
        if not destination:
            return None
        payload = {
            "event_type": TEST_EVENT_TYPE,
            "title": "Tribu test notification",
            "body": "This is a test notification from Tribu.",
            "link": None,
            "source_type": "test",
            "source_id": destination.id,
            "trigger_key": f"test:{destination.id}:{utcnow().isoformat()}",
        }
        delivery = NotificationDestinationDelivery(
            destination_id=destination.id,
            family_id=destination.family_id,
            event_type=TEST_EVENT_TYPE,
            source_type="test",
            source_id=destination.id,
            trigger_key=payload["trigger_key"],
            status="pending",
            attempts=0,
        )
        db.add(delivery)
        db.commit()
        db.refresh(delivery)
        return _deliver_claimed(db, destination, delivery, payload)
    finally:
        db.close()


def _in_quiet_hours(quiet_start: str | None, quiet_end: str | None, now: datetime) -> bool:
    if not quiet_start or not quiet_end:
        return False
    try:
        start_h, start_m = map(int, quiet_start.split(":"))
        end_h, end_m = map(int, quiet_end.split(":"))
    except (ValueError, AttributeError):
        return False

    current_minutes = now.hour * 60 + now.minute
    start_minutes = start_h * 60 + start_m
    end_minutes = end_h * 60 + end_m

    if start_minutes <= end_minutes:
        return start_minutes <= current_minutes < end_minutes
    return current_minutes >= start_minutes or current_minutes < end_minutes


def _family_destination_users(db, family_id: int, now: datetime) -> list[EligibleReminderUser]:
    memberships = db.query(Membership).filter(Membership.family_id == family_id).all()
    if not memberships:
        return []
    user_ids = [membership.user_id for membership in memberships]
    prefs = {
        pref.user_id: pref
        for pref in db.query(NotificationPreference).filter(NotificationPreference.user_id.in_(user_ids)).all()
    }
    return [
        EligibleReminderUser(
            user_id=uid,
            in_quiet_hours=_in_quiet_hours(
                prefs[uid].quiet_start if uid in prefs else None,
                prefs[uid].quiet_end if uid in prefs else None,
                now,
            ),
        )
        for uid in user_ids
    ]


def dispatch_family_notification(
    *,
    family_id: int,
    event_type: str,
    title: str,
    body: str,
    link: str | None,
    source_type: str,
    source_id: int,
    trigger_key: str,
    eligible_users: list[EligibleReminderUser] | None = None,
) -> list[NotificationDestinationDelivery]:
    if event_type not in DESTINATION_EVENT_TYPES:
        return []
    if event_type in REMINDER_EVENT_TYPES and not eligible_users:
        return []

    payload = {
        "event_type": event_type,
        "title": title,
        "body": body,
        "link": link,
        "source_type": source_type,
        "source_id": source_id,
        "trigger_key": trigger_key,
        "metadata": {"source": "tribu"},
    }

    db = SessionLocal()
    try:
        destinations = (
            db.query(NotificationDestination)
            .filter(NotificationDestination.family_id == family_id)
            .all()
        )
        quiet_hour_users = eligible_users
        if quiet_hour_users is None:
            quiet_hour_users = _family_destination_users(db, family_id, utcnow())
        deliveries: list[NotificationDestinationDelivery] = []
        for destination in destinations:
            if not destination.active:
                continue
            if event_type not in (destination.events or []):
                continue
            if destination.respect_quiet_hours and quiet_hour_users and not any(not user.in_quiet_hours for user in quiet_hour_users):
                _mark_destination(destination, status="quiet_hours", now=utcnow(), error="quiet_hours")
                db.commit()
                continue
            delivery = _claim_delivery(db, destination, payload)
            if delivery is None:
                continue
            deliveries.append(_deliver_claimed(db, destination, delivery, payload))
        return deliveries
    finally:
        db.close()
