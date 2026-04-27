"""Validated render configuration for Shared Home Display devices."""

from __future__ import annotations

from copy import deepcopy
from typing import Any

MODE_TABLET = "tablet"
MODE_EINK = "eink"
ALLOWED_MODES = {MODE_TABLET, MODE_EINK}
DEFAULT_MODE = MODE_TABLET

REFRESH_BOUNDS = {
    MODE_TABLET: (30, 3600),
    MODE_EINK: (300, 86400),
}
DEFAULT_REFRESH = {
    MODE_TABLET: 60,
    MODE_EINK: 900,
}

ALLOWED_WIDGETS = {"identity", "clock", "focus", "agenda", "birthdays", "members"}
GRID_MAX_COLUMNS = 6
GRID_MAX_ROWS = 6

PRESETS: dict[str, dict[str, Any]] = {
    "hearth": {
        "mode": MODE_TABLET,
        "layout": {
            "columns": 3,
            "rows": 3,
            "widgets": [
                {"type": "identity", "x": 0, "y": 0, "w": 1, "h": 1},
                {"type": "clock", "x": 0, "y": 1, "w": 1, "h": 1},
                {"type": "focus", "x": 0, "y": 2, "w": 1, "h": 1},
                {"type": "agenda", "x": 1, "y": 0, "w": 1, "h": 3},
                {"type": "birthdays", "x": 2, "y": 0, "w": 1, "h": 1},
                {"type": "members", "x": 2, "y": 1, "w": 1, "h": 2},
            ],
        },
    },
    "agenda_first": {
        "mode": MODE_TABLET,
        "layout": {
            "columns": 3,
            "rows": 3,
            "widgets": [
                {"type": "agenda", "x": 0, "y": 0, "w": 2, "h": 3},
                {"type": "identity", "x": 2, "y": 0, "w": 1, "h": 1},
                {"type": "clock", "x": 2, "y": 1, "w": 1, "h": 1},
                {"type": "birthdays", "x": 2, "y": 2, "w": 1, "h": 1},
            ],
        },
    },
    "family_board": {
        "mode": MODE_TABLET,
        "layout": {
            "columns": 3,
            "rows": 3,
            "widgets": [
                {"type": "identity", "x": 0, "y": 0, "w": 1, "h": 1},
                {"type": "members", "x": 1, "y": 0, "w": 2, "h": 2},
                {"type": "clock", "x": 0, "y": 1, "w": 1, "h": 1},
                {"type": "agenda", "x": 0, "y": 2, "w": 2, "h": 1},
                {"type": "birthdays", "x": 2, "y": 2, "w": 1, "h": 1},
            ],
        },
    },
    "eink_compact": {
        "mode": MODE_EINK,
        "layout": {
            "columns": 2,
            "rows": 3,
            "widgets": [
                {"type": "identity", "x": 0, "y": 0, "w": 1, "h": 1},
                {"type": "clock", "x": 1, "y": 0, "w": 1, "h": 1},
                {"type": "agenda", "x": 0, "y": 1, "w": 2, "h": 1},
                {"type": "birthdays", "x": 0, "y": 2, "w": 1, "h": 1},
                {"type": "members", "x": 1, "y": 2, "w": 1, "h": 1},
            ],
        },
    },
    "eink_agenda": {
        "mode": MODE_EINK,
        "layout": {
            "columns": 1,
            "rows": 3,
            "widgets": [
                {"type": "identity", "x": 0, "y": 0, "w": 1, "h": 1},
                {"type": "agenda", "x": 0, "y": 1, "w": 1, "h": 1},
                {"type": "birthdays", "x": 0, "y": 2, "w": 1, "h": 1},
            ],
        },
    },
}
DEFAULT_PRESET = {MODE_TABLET: "hearth", MODE_EINK: "eink_compact"}


def normalize_mode(value: Any) -> str:
    return value if isinstance(value, str) and value in ALLOWED_MODES else DEFAULT_MODE


def normalize_preset(mode: str, value: Any) -> str:
    mode = normalize_mode(mode)
    if isinstance(value, str) and PRESETS.get(value, {}).get("mode") == mode:
        return value
    return DEFAULT_PRESET[mode]


def normalize_refresh(mode: str, value: Any) -> int:
    mode = normalize_mode(mode)
    lo, hi = REFRESH_BOUNDS[mode]
    if isinstance(value, int) and not isinstance(value, bool):
        return min(hi, max(lo, value))
    return DEFAULT_REFRESH[mode]


def preset_layout(preset: str) -> dict[str, Any]:
    return deepcopy(PRESETS.get(preset, PRESETS["hearth"])["layout"])


def _bounded_int(value: Any, lo: int, hi: int) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and lo <= value <= hi


def normalize_layout_config(mode: str, preset: str, value: Any) -> dict[str, Any]:
    preset = normalize_preset(mode, preset)
    fallback = preset_layout(preset)
    if not isinstance(value, dict):
        return fallback
    columns = value.get("columns")
    rows = value.get("rows")
    widgets = value.get("widgets")
    if not _bounded_int(columns, 1, GRID_MAX_COLUMNS) or not _bounded_int(rows, 1, GRID_MAX_ROWS):
        return fallback
    if not isinstance(widgets, list):
        return fallback
    cleaned: list[dict[str, int | str]] = []
    for widget in widgets:
        if not isinstance(widget, dict) or widget.get("type") not in ALLOWED_WIDGETS:
            continue
        x, y = widget.get("x"), widget.get("y")
        w, h = widget.get("w", 1), widget.get("h", 1)
        if not _bounded_int(x, 0, columns - 1) or not _bounded_int(y, 0, rows - 1):
            continue
        if not _bounded_int(w, 1, columns - x) or not _bounded_int(h, 1, rows - y):
            continue
        cleaned.append({"type": widget["type"], "x": x, "y": y, "w": w, "h": h})
    return {"columns": columns, "rows": rows, "widgets": cleaned} if cleaned else fallback


def normalize_config(mode: Any = None, refresh_interval_seconds: Any = None, layout_preset: Any = None, layout_config: Any = None) -> dict[str, Any]:
    normalized_mode = normalize_mode(mode)
    normalized_preset = normalize_preset(normalized_mode, layout_preset)
    return {
        "display_mode": normalized_mode,
        "refresh_interval_seconds": normalize_refresh(normalized_mode, refresh_interval_seconds),
        "layout_preset": normalized_preset,
        "layout_config": normalize_layout_config(normalized_mode, normalized_preset, layout_config),
    }
