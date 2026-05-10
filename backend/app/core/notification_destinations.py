"""Human notification destination helpers."""

from __future__ import annotations

import importlib
import logging
from dataclasses import dataclass
from datetime import datetime
from typing import Any
from urllib.parse import urlsplit

from sqlalchemy.exc import IntegrityError

from app.core.clock import utcnow
from app.database import SessionLocal
from app.models import NotificationDestination, NotificationDestinationDelivery

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

REMINDER_EVENT_TYPES = {"calendar.reminder", "task.reminder", "birthday.reminder"}
TEST_EVENT_TYPE = "notification.test"
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
    if not parsed.scheme or parsed.scheme.lower() not in ALLOWED_APPRISE_SCHEMES:
        raise ValueError("Invalid notification destination URL")
    if parsed.scheme.lower() in {"gotify", "gotifys", "ntfy", "ntfys", "tgram", "matrix", "matrixs", "smtp", "smtps"} and not parsed.netloc:
        raise ValueError("Invalid notification destination URL")
    if not (parsed.netloc or parsed.path):
        raise ValueError("Invalid notification destination URL")
    return cleaned


def clean_events(events: list[str], *, allow_test: bool = False) -> list[str]:
    allowed = set(REMINDER_EVENT_TYPES)
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
        "events": sorted(REMINDER_EVENT_TYPES),
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
    title = str(payload.get("title") or "Tribu")
    body_parts = [str(payload.get("body") or "").strip()]
    link = str(payload.get("link") or "").strip()
    if link:
        body_parts.append(link)
    body = "\n".join(part for part in body_parts if part)
    return bool(notifier.notify(title=title, body=body))


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
        sent = _send_with_apprise(destination.target_url_secret, payload)
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
    eligible_users: list[EligibleReminderUser],
) -> list[NotificationDestinationDelivery]:
    if event_type not in REMINDER_EVENT_TYPES or not eligible_users:
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
        deliveries: list[NotificationDestinationDelivery] = []
        for destination in destinations:
            if not destination.active:
                continue
            if event_type not in (destination.events or []):
                continue
            if destination.respect_quiet_hours and not any(not user.in_quiet_hours for user in eligible_users):
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
