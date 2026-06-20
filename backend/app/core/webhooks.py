"""Outbound webhook delivery helpers."""

from __future__ import annotations

import json
import socket
import urllib.error
import urllib.request
from typing import Any
from urllib.parse import urlsplit, urlunsplit

from sqlalchemy.orm import Session

from app.core.utils import utcnow
from app.models import WebhookDelivery, WebhookEndpoint

WEBHOOK_TIMEOUT_SECONDS = 3.0
REDACTED_URL = "[redacted]"


class _NoRedirectHandler(urllib.request.HTTPRedirectHandler):
    """Keep webhook delivery status codes visible instead of following redirects."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):  # noqa: N802 - stdlib override signature
        return None


class _WebhookHTTPErrorProcessor(urllib.request.HTTPErrorProcessor):
    """Return non-2xx responses so delivery status can be persisted consistently."""

    def http_response(self, request, response):
        return response

    https_response = http_response


_WEBHOOK_OPENER = urllib.request.build_opener(_NoRedirectHandler, _WebhookHTTPErrorProcessor)


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


def _webhook_network_error_name(exc: BaseException) -> str:
    if isinstance(exc, urllib.error.URLError) and exc.reason:
        return exc.reason.__class__.__name__
    return exc.__class__.__name__


def _post_webhook_json(url: str, *, payload: dict[str, Any], headers: dict[str, str]) -> int:
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers=headers,
        method="POST",
    )
    with _WEBHOOK_OPENER.open(request, timeout=WEBHOOK_TIMEOUT_SECONDS) as response:
        return int(response.status)


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
        status_code = _post_webhook_json(
            endpoint.url,
            payload=_delivery_payload(family_id=endpoint.family_id, event_type=event_type, data=data),
            headers=headers,
        )
        delivery.status_code = status_code
        delivery.status = "delivered" if 200 <= status_code < 300 else "failed"
        if delivery.status == "failed":
            delivery.error = f"HTTP {status_code}"
    except urllib.error.HTTPError as exc:
        delivery.status_code = exc.code
        delivery.status = "failed"
        delivery.error = f"HTTP {exc.code}"
    except (urllib.error.URLError, TimeoutError, socket.timeout, OSError) as exc:
        delivery.status = "failed"
        delivery.error = _webhook_network_error_name(exc)
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
