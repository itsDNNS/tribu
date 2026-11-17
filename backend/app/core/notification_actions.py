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
from urllib.parse import parse_qs, urlsplit

import jwt
from sqlalchemy.orm import Session

from app.core import task_service
from app.core.clock import local_wall_now, utcnow
from app.core.event_reminders import MUTE_OCCURRENCE, ReminderMuteError, set_reminder_mute
from app.core.reminder_text import reminder_text
from app.models import CalendarEvent, MealPlan, Membership, ReminderSnooze, ShoppingList, User
from app.security import JWT_ALG, JWT_SECRET

TOKEN_TYPE = "notification_action"
TOKEN_TTL = timedelta(days=2)
SNOOZE_DELAY = timedelta(hours=1)

# What each kind of reminder offers. Browsers show at most two buttons.
REMINDER_ACTIONS: dict[str, tuple[str, ...]] = {
    "task": ("done", "snooze"),
    # "Don't remind me": a single event is muted right from the
    # notification; for a series the button opens Tribu to choose between
    # this occurrence and all of them (see ``link_actions``).
    "event": ("snooze", "mute"),
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


def link_actions(source_type: str, link: str | None) -> dict[str, str]:
    """Buttons that open Tribu at a link instead of running from the
    notification: "Don't remind me" for an occurrence of a series (its link
    says ``repeats=1``, see ``scheduler.event_reminder_link``), so the
    choice between this one and all of them is made in the app."""
    if source_type == "event" and link and parse_qs(urlsplit(link).query).get("repeats") == ["1"]:
        return {"mute": f"{link}&mute=choose"}
    return {}


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
    expires_at: datetime | None = None,
    occurrence_start: datetime | None = None,
    event_created_at: datetime | None = None,
) -> str | None:
    """A token for the actions of one reminder, or None when it has none.

    ``expires_at`` (naive UTC) is when the reminder stops being true, such
    as the start of the event occurrence; a snooze keeps it.
    ``occurrence_start`` is the occurrence of a series in the form mutes
    name it (``event_reminders.reminder_mute_key``); a snooze keeps it.
    ``event_created_at`` ties the token to that very event: an event id can
    come back for a new event once the old one is deleted (SQLite reuses
    the highest id), and "Don't remind me" must not reach the new one.
    """
    opened = link_actions(source_type, link)
    actions = tuple(action for action in reminder_actions(source_type) if action not in opened)
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
    if expires_at is not None:
        payload["end"] = int(expires_at.replace(tzinfo=timezone.utc).timestamp())
    for key, value in (("occ", occurrence_start), ("evc", event_created_at)):
        if value is not None:
            # To the microsecond: an event created in the same second as a
            # deleted one with its id must not match.
            payload[key] = value.isoformat(timespec="microseconds")
    return jwt.encode(payload, _signing_key(), algorithm=JWT_ALG)


def _token_time(payload: dict, key: str) -> datetime | None:
    return datetime.fromisoformat(payload[key]) if payload.get(key) else None


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
    **token_fields,
) -> dict:
    """``send_push_for_user`` options for a reminder's buttons, or none.

    ``token_fields`` are the optional fields of :func:`create_action_token`.
    """
    token = create_action_token(
        user_id=user_id,
        family_id=family_id,
        source_type=source_type,
        source_id=source_id,
        notification_type=notification_type,
        title=title,
        body=body,
        link=link,
        **token_fields,
    )
    if token is None:
        return {}
    actions = reminder_actions(source_type)
    options = {
        "actions": actions,
        "action_token": token,
        "action_labels": {action: reminder_text(language, f"action_{action}") for action in actions},
    }
    opened = link_actions(source_type, link)
    if opened:
        options["action_urls"] = opened
    return options


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
            expires_at=(
                datetime.fromtimestamp(payload["end"], timezone.utc).replace(tzinfo=None)
                if payload.get("end") is not None
                else None
            ),
            occurrence_start=_token_time(payload, "occ"),
            # The event the reminder was about, so the snooze never comes
            # back for another event that got its id.
            event_created_at=_token_time(payload, "evc"),
        ))
        db.commit()
        return {"status": "ok", "action": action, "remind_at": remind_at.isoformat()}

    if action == "shopping" and payload["src"] == "meal_plan":
        return _add_meal_to_list(db, user, member, payload["sid"])

    if action == "mute" and payload["src"] == "event":
        return _mute_event_reminder(db, user, member, payload)

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


def _mute_event_reminder(db: Session, user: User, member: Membership, payload: dict) -> dict:
    """"Don't remind me" from a reminder of a single event.

    Should the event have become part of a series since, only the
    occurrence the reminder was about is muted. A token for an event that is
    gone does nothing, also when a new event got its id.
    """
    event = (
        db.query(CalendarEvent)
        .filter(CalendarEvent.id == payload["sid"], CalendarEvent.family_id == member.family_id)
        .first()
    )
    if event is None or _token_time(payload, "evc") != event.created_at:
        raise NotificationActionError("ACTION_GONE", 404)
    start = local_wall_now(datetime.fromtimestamp(payload["end"], timezone.utc))
    try:
        state = set_reminder_mute(db, user.id, event, MUTE_OCCURRENCE, start)
    except ReminderMuteError as exc:
        raise NotificationActionError("ACTION_GONE", 404) from exc
    db.commit()
    return {"status": "ok", "action": "mute", "event_id": event.id, "reminder_muted": state}
