"""Actions in reminder notifications (Tribu 2.0, N-2).

A reminder push carries a signed action token, so its buttons work from the
lock screen: the service worker and the app send the token back without a
session. Each token names one user, one reminder source and the actions it
allows, expires after two days and is signed with a key of its own, so it
can never pass as an access token.
"""

from __future__ import annotations

import hashlib
import hmac
from datetime import datetime, timedelta, timezone

import jwt
from sqlalchemy.orm import Session

from app.core import task_service
from app.core.clock import utcnow
from app.core.reminder_text import reminder_text
from app.models import MealPlan, Membership, ReminderSnooze, ShoppingList, User
from app.security import JWT_ALG, JWT_SECRET

TOKEN_TYPE = "notification_action"
TOKEN_TTL = timedelta(days=2)
SNOOZE_DELAY = timedelta(hours=1)

# What each kind of reminder offers.
REMINDER_ACTIONS: dict[str, tuple[str, ...]] = {
    "task": ("done", "snooze"),
    "event": ("snooze",),
    # A meal whose ingredients are not on the list yet: "Add to list".
    "meal_plan": ("shopping",),
}


class NotificationActionError(Exception):
    """The token or the action cannot be used."""

    def __init__(self, code: str, status: int = 400):
        super().__init__(code)
        self.code = code
        self.status = status


def _signing_key() -> str:
    # Derived from the server secret but different from the access token key.
    return hmac.new(JWT_SECRET.encode(), b"tribu-notification-actions", hashlib.sha256).hexdigest()


def reminder_actions(source_type: str) -> tuple[str, ...]:
    return REMINDER_ACTIONS.get(source_type, ())


def create_action_token(
    *,
    user_id: int,
    family_id: int,
    source_type: str,
    source_id: int,
    notification_type: str,
    title: str,
    body: str | None,
    link: str | None,
) -> str | None:
    """A token for the actions of one reminder, or None when it has none."""
    actions = reminder_actions(source_type)
    if not actions:
        return None
    now = datetime.now(timezone.utc)
    payload = {
        "typ": TOKEN_TYPE,
        "uid": user_id,
        "fam": family_id,
        "src": source_type,
        "sid": source_id,
        "ntp": notification_type,
        "ttl": title[:200],
        "bdy": (body or "")[:500],
        "lnk": link or "",
        "act": list(actions),
        "iat": now.timestamp(),
        "exp": now + TOKEN_TTL,
    }
    return jwt.encode(payload, _signing_key(), algorithm=JWT_ALG)


def reminder_push_actions(
    user_id: int,
    family_id: int,
    source_type: str,
    source_id: int,
    notification_type: str,
    title: str,
    body: str | None,
    link: str | None,
    language: str,
) -> dict:
    """``send_push_for_user`` options for a reminder's buttons, or none."""
    token = create_action_token(
        user_id=user_id,
        family_id=family_id,
        source_type=source_type,
        source_id=source_id,
        notification_type=notification_type,
        title=title,
        body=body,
        link=link,
    )
    if token is None:
        return {}
    actions = reminder_actions(source_type)
    return {
        "actions": actions,
        "action_token": token,
        "action_labels": {action: reminder_text(language, f"action_{action}") for action in actions},
    }


def _read_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, _signing_key(), algorithms=[JWT_ALG])
    except jwt.ExpiredSignatureError as exc:
        raise NotificationActionError("ACTION_EXPIRED", 410) from exc
    except jwt.PyJWTError as exc:
        raise NotificationActionError("ACTION_INVALID", 401) from exc
    if payload.get("typ") != TOKEN_TYPE:
        raise NotificationActionError("ACTION_INVALID", 401)
    return payload


def apply_action(db: Session, token: str, action: str) -> dict:
    """Runs ``action`` for the reminder behind ``token``."""
    payload = _read_token(token)
    if action not in payload.get("act", []):
        raise NotificationActionError("ACTION_NOT_ALLOWED", 400)
    user = db.query(User).filter(User.id == payload["uid"]).first()
    member = (
        db.query(Membership)
        .filter(Membership.user_id == payload["uid"], Membership.family_id == payload["fam"])
        .first()
    )
    if user is None or member is None:
        raise NotificationActionError("ACTION_INVALID", 401)
    issued = datetime.fromtimestamp(payload.get("iat", 0), timezone.utc)
    invalidated = user.session_invalidated_at
    if invalidated is not None and issued < invalidated.replace(tzinfo=timezone.utc):
        # Signing out everywhere also retires reminder buttons.
        raise NotificationActionError("ACTION_INVALID", 401)

    if action == "done" and payload["src"] == "task":
        try:
            task_service.update_task(db, user, payload["sid"], {"status": "done"})
        except task_service.TaskNotFoundError as exc:
            raise NotificationActionError("ACTION_GONE", 404) from exc
        except task_service.TaskAdultRequiredError as exc:
            raise NotificationActionError("ACTION_NOT_ALLOWED", 403) from exc
        return {"status": "ok", "action": action}

    if action == "snooze":
        remind_at = utcnow() + SNOOZE_DELAY
        db.add(ReminderSnooze(
            user_id=user.id,
            family_id=payload["fam"],
            source_type=payload["src"],
            source_id=payload["sid"],
            notification_type=payload["ntp"],
            title=payload["ttl"],
            body=payload.get("bdy") or None,
            link=payload.get("lnk") or None,
            remind_at=remind_at,
        ))
        db.commit()
        return {"status": "ok", "action": action, "remind_at": remind_at.isoformat()}

    if action == "shopping" and payload["src"] == "meal_plan":
        return _add_meal_to_list(db, user, member, payload["sid"])

    raise NotificationActionError("ACTION_NOT_ALLOWED", 400)


def _add_meal_to_list(db: Session, user: User, member: Membership, plan_id: int) -> dict:
    """Puts what a meal still needs on the family's first shopping list."""
    # The meal plan router owns the ingredient rules; imported here to keep
    # the core free of router imports at load time.
    from app.modules.meal_plans_router import add_meal_ingredients, missing_meal_ingredients

    if not member.is_adult:
        raise NotificationActionError("ACTION_NOT_ALLOWED", 403)
    plan = (
        db.query(MealPlan)
        .filter(MealPlan.id == plan_id, MealPlan.family_id == member.family_id)
        .first()
    )
    shopping_list = (
        db.query(ShoppingList)
        .filter(ShoppingList.family_id == member.family_id)
        .order_by(ShoppingList.created_at.asc(), ShoppingList.id.asc())
        .first()
    )
    if plan is None or shopping_list is None:
        raise NotificationActionError("ACTION_GONE", 404)
    added = add_meal_ingredients(db, plan, shopping_list, user, missing_meal_ingredients(db, plan))
    return {"status": "ok", "action": "shopping", "added_count": len(added), "list_id": shopping_list.id}
