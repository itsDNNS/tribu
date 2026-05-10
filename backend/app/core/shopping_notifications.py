"""Shared shopping notification destination dispatch helpers."""

from __future__ import annotations

import logging

from app.core.clock import utcnow
from app.core.notification_destinations import dispatch_family_notification

logger = logging.getLogger(__name__)


def dispatch_shopping_destination_event(
    *,
    family_id: int,
    event_type: str,
    title: str,
    body: str,
    link: str,
    source_type: str,
    source_id: int,
    action: str,
) -> None:
    """Send a shopping destination event without blocking the saved action."""

    try:
        dispatch_family_notification(
            family_id=family_id,
            event_type=event_type,
            title=title,
            body=body,
            link=link,
            source_type=source_type,
            source_id=source_id,
            trigger_key=f"{source_type}:{source_id}:{action}:{utcnow().isoformat()}",
            eligible_users=None,
        )
    except Exception:
        logger.warning("Shopping notification destination dispatch failed")
