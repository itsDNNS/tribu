"""Public-safe household activity helpers."""

from __future__ import annotations

import re
from typing import Optional

from sqlalchemy.orm import Session

from app.models import HouseholdActivity

MAX_LABEL_LENGTH = 80
MAX_SUMMARY_LENGTH = 240
_WHITESPACE_RE = re.compile(r"\s+")


def safe_activity_label(value: Optional[str], fallback: str = "item") -> str:
    """Return a short single-line label safe for feed summaries."""
    cleaned = _WHITESPACE_RE.sub(" ", (value or "").strip())
    if not cleaned:
        cleaned = fallback
    if len(cleaned) > MAX_LABEL_LENGTH:
        cleaned = f"{cleaned[: MAX_LABEL_LENGTH - 1].rstrip()}…"
    return cleaned


def build_activity_summary(actor_name: Optional[str], verb: str, object_label: str, *, object_kind: str | None = None) -> str:
    actor = safe_activity_label(actor_name, "Someone")
    label = safe_activity_label(object_label)
    if object_kind and object_kind.startswith("to "):
        summary = f'{actor} {verb} "{label}" {object_kind}'
    else:
        noun = f" {object_kind}" if object_kind else ""
        summary = f'{actor} {verb}{noun} "{label}"'
    if len(summary) > MAX_SUMMARY_LENGTH:
        summary = f"{summary[: MAX_SUMMARY_LENGTH - 1].rstrip()}…"
    return summary


def record_activity(
    db: Session,
    *,
    family_id: int,
    actor_user_id: Optional[int],
    actor_display_name: Optional[str],
    action: str,
    object_type: str,
    object_label: str,
    object_id: Optional[int] = None,
    verb: str,
    object_kind: str | None = None,
) -> HouseholdActivity:
    """Add a sanitized household activity row to the current transaction."""
    activity = HouseholdActivity(
        family_id=family_id,
        actor_user_id=actor_user_id,
        actor_display_name=safe_activity_label(actor_display_name, "Someone") if actor_display_name else None,
        action=action,
        object_type=object_type,
        object_id=object_id,
        summary=build_activity_summary(actor_display_name, verb, object_label, object_kind=object_kind),
    )
    db.add(activity)
    return activity
