import json
import logging
import os

from sqlalchemy.orm import Session

from app.models import PushSubscription

logger = logging.getLogger(__name__)


def get_vapid_public_key() -> str | None:
    return os.environ.get("VAPID_PUBLIC_KEY") or None


def send_push_for_user(db: Session, user_id: int, title: str, body: str, url: str | None = None):
    public_key = os.environ.get("VAPID_PUBLIC_KEY")
    private_key = os.environ.get("VAPID_PRIVATE_KEY")
    claims_email = os.environ.get("VAPID_CLAIMS_EMAIL")

    if not public_key or not private_key or not claims_email:
        return

    try:
        from pywebpush import webpush, WebPushException
    except ImportError:
        logger.warning("pywebpush not installed, skipping push notification")
        return

    subscriptions = db.query(PushSubscription).filter(PushSubscription.user_id == user_id).all()
    if not subscriptions:
        return

    payload = json.dumps({"title": title, "body": body, "url": url})
    vapid_claims = {"sub": f"mailto:{claims_email}"}

    for sub in subscriptions:
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
        except WebPushException as e:
            if hasattr(e, "response") and e.response is not None and e.response.status_code == 410:
                logger.info("Push subscription gone (410), removing: %s", sub.endpoint[:60])
                db.delete(sub)
            else:
                logger.warning("Push failed for endpoint %s: %s", sub.endpoint[:60], e)
        except Exception:
            logger.exception("Unexpected push error for endpoint %s", sub.endpoint[:60])
