import importlib.util
import json
import logging
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field, asdict
from typing import Any

import jwt
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


def _load_fcm_service_account() -> dict[str, Any] | None:
    raw = _clean_env("FCM_SERVICE_ACCOUNT_JSON") or _clean_env("FIREBASE_SERVICE_ACCOUNT_JSON")
    if raw:
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            logger.warning("FCM service account JSON is invalid")
            return None
        return data if isinstance(data, dict) else None

    path = _clean_env("GOOGLE_APPLICATION_CREDENTIALS")
    if not path:
        return None
    try:
        with open(path, "r", encoding="utf-8") as fh:
            data = json.load(fh)
    except Exception as exc:
        logger.warning("Could not load GOOGLE_APPLICATION_CREDENTIALS for FCM: %s", _short_error(exc))
        return None
    return data if isinstance(data, dict) else None


def get_fcm_project_id() -> str | None:
    explicit = _clean_env("FCM_PROJECT_ID") or _clean_env("FIREBASE_PROJECT_ID")
    if explicit:
        return explicit
    account = _load_fcm_service_account()
    project_id = account.get("project_id") if account else None
    return str(project_id).strip() if project_id else None


def is_fcm_configured() -> bool:
    account = _load_fcm_service_account()
    return bool(
        get_fcm_project_id()
        and account
        and account.get("client_email")
        and account.get("private_key")
    )


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


def _fcm_access_token(account: dict[str, Any]) -> str:
    now = int(time.time())
    assertion = jwt.encode(
        {
            "iss": account["client_email"],
            "scope": "https://www.googleapis.com/auth/firebase.messaging",
            "aud": "https://oauth2.googleapis.com/token",
            "iat": now,
            "exp": now + 3600,
        },
        account["private_key"],
        algorithm="RS256",
    )
    request = urllib.request.Request(
        "https://oauth2.googleapis.com/token",
        data=urllib.parse.urlencode(
            {
                "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
                "assertion": assertion,
            }
        ).encode("utf-8"),
        headers={
            "Accept": "application/json",
            "Content-Type": "application/x-www-form-urlencoded",
        },
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=10) as response:
        data = json.loads(response.read().decode("utf-8") or "{}")
    token = data.get("access_token")
    if not token:
        raise RuntimeError("FCM OAuth response did not contain access_token")
    return str(token)


def _fcm_error_code(data: Any) -> str:
    if not isinstance(data, dict):
        return "fcm_invalid_response"
    error = data.get("error")
    if not isinstance(error, dict):
        return "fcm_invalid_response"
    details = error.get("details")
    if isinstance(details, list):
        for item in details:
            if isinstance(item, dict) and item.get("@type", "").endswith("google.firebase.fcm.v1.FcmError"):
                code = item.get("errorCode")
                if code:
                    return str(code)
    return str(error.get("status") or error.get("message") or "fcm_send_failed")[:120]


def _send_fcm_push(token: str, title: str, body: str, url: str | None = None) -> tuple[bool, str | None, bool]:
    account = _load_fcm_service_account()
    project_id = get_fcm_project_id()
    if not account or not project_id or not account.get("client_email") or not account.get("private_key"):
        return False, "fcm_not_configured", False

    payload = {
        "message": {
            "token": token,
            "notification": {"title": title, "body": body},
            "data": {k: v for k, v in {"url": url or ""}.items() if v},
        }
    }
    try:
        access_token = _fcm_access_token(account)
        request = urllib.request.Request(
            f"https://fcm.googleapis.com/v1/projects/{project_id}/messages:send",
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Accept": "application/json",
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        with urllib.request.urlopen(request, timeout=10):
            return True, None, False
    except urllib.error.HTTPError as exc:
        try:
            data = json.loads(exc.read().decode("utf-8") or "{}")
        except Exception:
            data = None
        error = _fcm_error_code(data)
        return False, error, error in {"UNREGISTERED", "INVALID_ARGUMENT"}
    except Exception as exc:
        return False, _short_error(exc), False


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
    web_subscriptions = [sub for sub in subscriptions if getattr(sub, "platform", "web") == "web"]
    expo_subscriptions = [sub for sub in subscriptions if getattr(sub, "platform", "web") == "expo"]
    fcm_subscriptions = [sub for sub in subscriptions if getattr(sub, "platform", "web") == "fcm"]

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

    if fcm_subscriptions and not is_fcm_configured():
        result.skipped_reason = "fcm_not_configured" if result.attempted == 0 else result.skipped_reason
    for sub in fcm_subscriptions if is_fcm_configured() else []:
        result.attempted += 1
        ok, error, remove = _send_fcm_push(sub.endpoint, title, body, url)
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
            logger.warning("FCM push failed for token prefix %s: %s", sub.endpoint[:24], error)

    if result.attempted == 0 and not result.skipped_reason:
        result.skipped_reason = "no_available_sender"

    return result
