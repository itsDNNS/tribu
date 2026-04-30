from __future__ import annotations

from typing import Any

from app.models import NotificationPreference

PUSH_CATEGORY_DEFAULTS: dict[str, bool] = {
    "calendar_reminders": True,
    "task_due": True,
    "birthdays": True,
    "event_assignments": False,
    "shopping_changes": False,
    "meal_plan_changes": False,
    "family_changes": False,
}

NOTIFICATION_TYPE_TO_PUSH_CATEGORY: dict[str, str] = {
    "event_reminder": "calendar_reminders",
    "task_due": "task_due",
    "birthday": "birthdays",
    "event_assigned": "event_assignments",
    "shopping_item_added": "shopping_changes",
    "shopping_item_checked": "shopping_changes",
    "shopping_item_unchecked": "shopping_changes",
    "meal_plan_changed": "meal_plan_changes",
    "family_changed": "family_changes",
}


def normalize_push_categories(value: Any) -> dict[str, bool]:
    """Return known push category flags with safe defaults.

    Missing reminder categories default to on so existing scheduled reminder
    push behavior remains equivalent for users who already enabled browser push.
    New noisier/immediate categories default to off.
    """
    raw = value if isinstance(value, dict) else {}
    return {
        key: bool(raw[key]) if key in raw else default
        for key, default in PUSH_CATEGORY_DEFAULTS.items()
    }


def should_push_notification_type(pref: NotificationPreference, notification_type: str) -> tuple[bool, str | None]:
    if not pref.push_enabled:
        return False, "push_disabled"
    category = NOTIFICATION_TYPE_TO_PUSH_CATEGORY.get(notification_type)
    if not category:
        return False, "unknown_category"
    categories = normalize_push_categories(pref.push_categories)
    if not categories.get(category, False):
        return False, f"category_disabled:{category}"
    return True, None
