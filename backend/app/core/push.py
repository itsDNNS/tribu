import importlib.util
import json
import logging
import os
import urllib.error
import urllib.request
from dataclasses import dataclass, field, asdict
from typing import Any

from sqlalchemy.orm import Session

from app.models import PushSubscription

logger = logging.getLogger(__name__)


@dataclass
class PushResult:
    """Outcome of a single send_push_for_user call.

    Counts cover the subscriptions actually attempted in this call. ``removed``
    counts 410-Gone subscriptions that were deleted from the database.
    ``errors`` holds short, redacted snippets so the scheduler can log
    last_error without persisting full stack traces.
    """

    attempted: int = 0
    succeeded: int = 0
    failed: int = 0
    removed: int = 0
    errors: list[str] = field(default_factory=list)
    skipped_reason: str | None = None

    @property
    def all_failed(self) -> bool:
        return self.attempted > 0 and self.succeeded == 0

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _clean_env(name: str) -> str | None:
    value = os.environ.get(name)
    if value is None:
        return None
    value = value.strip()
    return value or None


def get_vapid_public_key() -> str | None:
    return _clean_env("VAPID_PUBLIC_KEY")


def get_vapid_private_key() -> str | None:
    return _clean_env("VAPID_PRIVATE_KEY")


def is_vapid_configured() -> bool:
    return bool(get_vapid_public_key() and get_vapid_private_key() and get_vapid_claim_subject())


def is_pywebpush_available() -> bool:
    return importlib.util.find_spec("pywebpush") is not None


def get_vapid_claim_subject() -> str | None:
    claims_email = _clean_env("VAPID_CLAIMS_EMAIL")
    if not claims_email:
        return None
    if claims_email.lower().startswith("mailto:"):
        address = claims_email[7:].strip()
        return f"mailto:{address}" if address else None
    return f"mailto:{claims_email}"


def _short_error(exc: BaseException, limit: int = 200) -> str:
    msg = f"{type(exc).__name__}: {exc}"
    return msg[:limit]


def _send_expo_push(token: str, title: str, body: str, url: str | None = None) -> tuple[bool, str | None, bool]:
    payload = {
        "to": token,
        "title": title,
        "body": body,
        "sound": "default",
        "data": {"url": url} if url else {},
    }
    request = urllib.request.Request(
        "https://exp.host/--/api/v2/push/send",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Accept": "application/json",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            data = json.loads(response.read().decode("utf-8") or "{}")
    except urllib.error.HTTPError as exc:
        return False, f"expo_http_{exc.code}", False
    except Exception as exc:
        return False, _short_error(exc), False

    ticket = data.get("data") if isinstance(data, dict) else None
    if isinstance(ticket, list):
        ticket = ticket[0] if ticket else {}
    if not isinstance(ticket, dict):
        return False, "expo_invalid_response", False
    if ticket.get("status") == "ok":
        return True, None, False

    details = ticket.get("details") if isinstance(ticket.get("details"), dict) else {}
    error = details.get("error") or ticket.get("message") or "expo_push_failed"
    return False, str(error)[:120], error == "DeviceNotRegistered"


def send_push_for_user(
    db: Session,
    user_id: int,
    title: str,
    body: str,
    url: str | None = None,
) -> PushResult:
    """Send a web-push payload to every active subscription for ``user_id``.

    Returns a :class:`PushResult` describing the attempt. Subscriptions that
    return HTTP 410 Gone are removed from the database (preserved behavior).
    Callers can treat ``result.attempted == 0`` together with ``skipped_reason``
    as "push was not actually delivered" without raising.
    """
    result = PushResult()

    subscriptions = db.query(PushSubscription).filter(PushSubscription.user_id == user_id).all()
    if not subscriptions:
        result.skipped_reason = "no_subscriptions"
        return result

    payload = json.dumps({"title": title, "body": body, "url": url})
    web_subscriptions = [sub for sub in subscriptions if getattr(sub, "platform", "web") != "expo"]
    expo_subscriptions = [sub for sub in subscriptions if getattr(sub, "platform", "web") == "expo"]

    if web_subscriptions:
        public_key = get_vapid_public_key()
        private_key = get_vapid_private_key()
        vapid_subject = get_vapid_claim_subject()

        if not public_key or not private_key or not vapid_subject:
            result.skipped_reason = "vapid_not_configured" if not expo_subscriptions else None
            web_subscriptions = []
        else:
            try:
                from pywebpush import webpush, WebPushException
            except ImportError:
                logger.warning("pywebpush not installed, skipping browser push notification")
                result.skipped_reason = "pywebpush_missing" if not expo_subscriptions else None
                web_subscriptions = []
            else:
                vapid_claims = {"sub": vapid_subject}
                for sub in web_subscriptions:
                    result.attempted += 1
                    try:
                        webpush(
                            subscription_info={
                                "endpoint": sub.endpoint,
                                "keys": {"p256dh": sub.p256dh, "auth": sub.auth},
                            },
                            data=payload,
                            vapid_private_key=private_key,
                            vapid_claims=vapid_claims,
                        )
                        result.succeeded += 1
                    except WebPushException as e:
                        response = getattr(e, "response", None)
                        status = getattr(response, "status_code", None)
                        if status == 410:
                            logger.info("Push subscription gone (410), removing: %s", sub.endpoint[:60])
                            db.delete(sub)
                            result.removed += 1
                            continue
                        result.failed += 1
                        snippet = _short_error(e)
                        result.errors.append(snippet)
                        logger.warning("Push failed for endpoint %s: %s", sub.endpoint[:60], snippet)
                    except Exception as e:
                        result.failed += 1
                        snippet = _short_error(e)
                        result.errors.append(snippet)
                        logger.exception("Unexpected push error for endpoint %s", sub.endpoint[:60])

    for sub in expo_subscriptions:
        result.attempted += 1
        ok, error, remove = _send_expo_push(sub.endpoint, title, body, url)
        if ok:
            result.succeeded += 1
            continue
        if remove:
            db.delete(sub)
            result.removed += 1
            continue
        if error:
            result.failed += 1
            result.errors.append(error)
            logger.warning("Expo push failed for token prefix %s: %s", sub.endpoint[:24], error)

    if result.attempted == 0 and not result.skipped_reason:
        result.skipped_reason = "no_available_sender"

    return result
