"""Outbound webhook delivery helpers."""

from __future__ import annotations

from typing import Any
from urllib.parse import urlsplit, urlunsplit

import httpx
from sqlalchemy.orm import Session

from app.core.utils import utcnow
from app.models import WebhookDelivery, WebhookEndpoint

WEBHOOK_TIMEOUT_SECONDS = 3.0
REDACTED_URL = "[redacted]"


def redact_webhook_url(url: str) -> str:
    """Return a URL that is useful for diagnostics without leaking query secrets."""
    try:
        parsed = urlsplit(url)
    except ValueError:
        return REDACTED_URL
    if not parsed.scheme or not parsed.netloc:
        return REDACTED_URL
    return urlunsplit((parsed.scheme, parsed.netloc, "/[redacted]", "", ""))


def endpoint_response(endpoint: WebhookEndpoint) -> dict[str, Any]:
    return {
        "id": endpoint.id,
        "family_id": endpoint.family_id,
        "name": endpoint.name,
        "url_redacted": redact_webhook_url(endpoint.url),
        "events": endpoint.events or [],
        "active": endpoint.active,
        "secret_header_name": endpoint.secret_header_name,
        "has_secret": bool(endpoint.secret_header_value),
        "created_at": endpoint.created_at,
        "updated_at": endpoint.updated_at,
    }


def _delivery_payload(*, family_id: int, event_type: str, data: dict[str, Any]) -> dict[str, Any]:
    return {
        "source": "tribu",
        "event_type": event_type,
        "family_id": family_id,
        "occurred_at": utcnow().isoformat(),
        "data": data,
    }


def deliver_to_endpoint(
    db: Session,
    endpoint: WebhookEndpoint,
    *,
    event_type: str,
    data: dict[str, Any],
) -> WebhookDelivery:
    """Deliver one webhook synchronously and persist redacted status metadata."""
    delivery = WebhookDelivery(
        endpoint_id=endpoint.id,
        family_id=endpoint.family_id,
        event_type=event_type,
        status="pending",
    )
    db.add(delivery)
    db.flush()

    headers = {"Content-Type": "application/json", "User-Agent": "Tribu-Webhooks/1.0"}
    if endpoint.secret_header_name and endpoint.secret_header_value:
        headers[endpoint.secret_header_name] = endpoint.secret_header_value

    try:
        response = httpx.post(
            endpoint.url,
            json=_delivery_payload(family_id=endpoint.family_id, event_type=event_type, data=data),
            headers=headers,
            timeout=WEBHOOK_TIMEOUT_SECONDS,
            follow_redirects=False,
        )
        delivery.status_code = response.status_code
        delivery.status = "delivered" if 200 <= response.status_code < 300 else "failed"
        if delivery.status == "failed":
            delivery.error = f"HTTP {response.status_code}"
    except httpx.HTTPError as exc:
        delivery.status = "failed"
        delivery.error = exc.__class__.__name__
    except Exception as exc:  # pragma: no cover - defensive guard around network delivery
        delivery.status = "failed"
        delivery.error = exc.__class__.__name__
    delivery.attempted_at = utcnow()
    db.commit()
    db.refresh(delivery)
    return delivery


def dispatch_webhook_event(db: Session, *, family_id: int, event_type: str, data: dict[str, Any]) -> list[WebhookDelivery]:
    """Send an event to all active endpoints subscribed to the event type."""
    endpoints = (
        db.query(WebhookEndpoint)
        .filter(WebhookEndpoint.family_id == family_id, WebhookEndpoint.active.is_(True))
        .all()
    )
    deliveries: list[WebhookDelivery] = []
    for endpoint in endpoints:
        events = endpoint.events or []
        if event_type not in events:
            continue
        deliveries.append(deliver_to_endpoint(db, endpoint, event_type=event_type, data=data))
    return deliveries
