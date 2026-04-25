import json
import logging
import os
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


def get_vapid_public_key() -> str | None:
    return os.environ.get("VAPID_PUBLIC_KEY") or None


def _short_error(exc: BaseException, limit: int = 200) -> str:
    msg = f"{type(exc).__name__}: {exc}"
    return msg[:limit]


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

    public_key = os.environ.get("VAPID_PUBLIC_KEY")
    private_key = os.environ.get("VAPID_PRIVATE_KEY")
    claims_email = os.environ.get("VAPID_CLAIMS_EMAIL")

    if not public_key or not private_key or not claims_email:
        result.skipped_reason = "vapid_not_configured"
        return result

    try:
        from pywebpush import webpush, WebPushException
    except ImportError:
        logger.warning("pywebpush not installed, skipping push notification")
        result.skipped_reason = "pywebpush_missing"
        return result

    subscriptions = db.query(PushSubscription).filter(PushSubscription.user_id == user_id).all()
    if not subscriptions:
        result.skipped_reason = "no_subscriptions"
        return result

    payload = json.dumps({"title": title, "body": body, "url": url})
    vapid_claims = {"sub": f"mailto:{claims_email}"}

    for sub in subscriptions:
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
                # 410 means the subscription is permanently invalid; we do not
                # count it as a transient failure that should drive retries.
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

    return result
