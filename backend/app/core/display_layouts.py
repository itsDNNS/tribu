"""Validated render configuration for Shared Home Display devices.

Every display renders the "stage" layout: fixed anchors (clock, weather,
next event, day timeline) plus four zones whose cards rotate on a
configurable rhythm. Zones ``a``–``c`` sit in the narrow side column and
zone ``d`` spans the bottom, so each zone only accepts cards that fit its
shape. Anything invalid — including the retired widget-grid layouts —
falls back to the defaults instead of reaching the wall display.
"""

from __future__ import annotations

import re
from copy import deepcopy
from typing import Any

MODE_TABLET = "tablet"
MODE_EINK = "eink"
ALLOWED_MODES = {MODE_TABLET, MODE_EINK}
DEFAULT_MODE = MODE_TABLET

# How often the device reloads its data. E-ink devices also turn one card
# page per zone on every refresh.
REFRESH_BOUNDS = {
    MODE_TABLET: (30, 3600),
    MODE_EINK: (300, 86400),
}
DEFAULT_REFRESH = {
    MODE_TABLET: 60,
    MODE_EINK: 600,
}

LAYOUT_STAGE = "stage"
LAYOUT_VERSION = 2

SIDE_CARDS = ("dinner", "shopping", "weather", "reminders", "school", "soon", "stars", "birthdays")
WIDE_CARDS = ("people", "week")
ZONE_CARDS: dict[str, tuple[str, ...]] = {
    "a": SIDE_CARDS,
    "b": SIDE_CARDS,
    "c": SIDE_CARDS,
    "d": WIDE_CARDS,
}
MAX_CARDS_PER_ZONE = 6
ROTATION_BOUNDS = (15, 600)
DEFAULT_ROTATION = 60

EINK_FORMATS = ("compact", "large")
DEFAULT_EINK_FORMAT = "compact"

DEFAULT_LAYOUT: dict[str, Any] = {
    "version": LAYOUT_VERSION,
    "zones": {
        "a": {"cards": ["dinner", "shopping", "weather"], "interval_seconds": DEFAULT_ROTATION},
        "b": {"cards": ["reminders", "school"], "interval_seconds": DEFAULT_ROTATION},
        "c": {"cards": ["soon", "stars"], "interval_seconds": DEFAULT_ROTATION},
        "d": {"cards": ["people", "week"], "interval_seconds": DEFAULT_ROTATION},
    },
    "stagger": True,
    "skip_empty": True,
    "pause_on_touch": True,
    "night_dim": True,
    "day_parts": {
        "morning_start": "05:30",
        "morning_end": "09:00",
        "evening_start": "18:00",
        "night_start": "22:00",
    },
    "eink_format": DEFAULT_EINK_FORMAT,
    "language": "auto",
}

_LANGUAGE_RE = re.compile(r"^[a-z]{2}(?:-[A-Z]{2})?$")
_TIME_RE = re.compile(r"^(?:[01]\d|2[0-3]):[0-5]\d$")


def normalize_mode(value: Any) -> str:
    return value if isinstance(value, str) and value in ALLOWED_MODES else DEFAULT_MODE


def normalize_refresh(mode: str, value: Any) -> int:
    mode = normalize_mode(mode)
    lo, hi = REFRESH_BOUNDS[mode]
    if isinstance(value, int) and not isinstance(value, bool):
        return min(hi, max(lo, value))
    return DEFAULT_REFRESH[mode]


def default_layout() -> dict[str, Any]:
    return deepcopy(DEFAULT_LAYOUT)


def _is_int(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


def _normalize_zone(zone: str, value: Any) -> dict[str, Any]:
    fallback = deepcopy(DEFAULT_LAYOUT["zones"][zone])
    if not isinstance(value, dict):
        return fallback
    allowed = ZONE_CARDS[zone]
    cards: list[str] = []
    raw_cards = value.get("cards")
    if isinstance(raw_cards, list):
        for card in raw_cards:
            if isinstance(card, str) and card in allowed and card not in cards:
                cards.append(card)
    cards = cards[:MAX_CARDS_PER_ZONE] or fallback["cards"]
    interval = value.get("interval_seconds")
    lo, hi = ROTATION_BOUNDS
    interval = min(hi, max(lo, interval)) if _is_int(interval) else fallback["interval_seconds"]
    return {"cards": cards, "interval_seconds": interval}


def _normalize_day_parts(value: Any) -> dict[str, str]:
    parts = deepcopy(DEFAULT_LAYOUT["day_parts"])
    if isinstance(value, dict):
        for key in parts:
            candidate = value.get(key)
            if isinstance(candidate, str) and _TIME_RE.match(candidate):
                parts[key] = candidate
    return parts


def normalize_layout_config(value: Any) -> dict[str, Any]:
    """Return a complete stage layout; retired grid layouts reset to defaults."""
    if not isinstance(value, dict) or value.get("version") != LAYOUT_VERSION:
        return default_layout()
    zones = value.get("zones") if isinstance(value.get("zones"), dict) else {}
    layout = default_layout()
    layout["zones"] = {zone: _normalize_zone(zone, zones.get(zone)) for zone in ZONE_CARDS}
    for flag in ("stagger", "skip_empty", "pause_on_touch", "night_dim"):
        if isinstance(value.get(flag), bool):
            layout[flag] = value[flag]
    layout["day_parts"] = _normalize_day_parts(value.get("day_parts"))
    if value.get("eink_format") in EINK_FORMATS:
        layout["eink_format"] = value["eink_format"]
    language = value.get("language")
    if isinstance(language, str) and (language == "auto" or _LANGUAGE_RE.match(language)):
        layout["language"] = language
    return layout


def normalize_config(mode: Any = None, refresh_interval_seconds: Any = None, layout_preset: Any = None, layout_config: Any = None) -> dict[str, Any]:
    """Normalize a device render config.

    ``layout_preset`` is accepted for API compatibility but every device now
    uses the stage layout.
    """
    normalized_mode = normalize_mode(mode)
    return {
        "display_mode": normalized_mode,
        "refresh_interval_seconds": normalize_refresh(normalized_mode, refresh_interval_seconds),
        "layout_preset": LAYOUT_STAGE,
        "layout_config": normalize_layout_config(layout_config),
    }
