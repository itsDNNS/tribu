"""Version resolution helpers for backend health reporting."""
from __future__ import annotations

import os
from collections.abc import Mapping


def _clean(value: str | None) -> str:
    return (value or "").strip()


def _normalize_version(value: str | None) -> str | None:
    cleaned = _clean(value)
    if not cleaned:
        return None
    return cleaned.removeprefix("v") or None


def resolve_app_version(env: Mapping[str, str] | None = None) -> str:
    """Resolve the backend version from supported runtime environment values."""

    source = env or os.environ
    return (
        _normalize_version(source.get("APP_VERSION_OVERRIDE"))
        or _normalize_version(source.get("APP_VERSION"))
        or "dev"
    )


if __name__ == "__main__":
    print(resolve_app_version())
