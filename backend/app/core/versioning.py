"""Version resolution helpers for backend health/build reporting."""
from __future__ import annotations

import os
import re
import subprocess
from datetime import UTC, date, datetime
from pathlib import Path

_BRANCH_PLACEHOLDERS = {"main", "master", "dev", "latest", "head"}
_SEMVER_PREFIX = re.compile(r"^v?\d+\.\d+\.\d+")
_DATE_VERSION_PREFIX = re.compile(r"^v?(\d{4}-\d{2}-\d{2})(?:[.-]|$)")


def _clean(value: str | None) -> str:
    return (value or "").strip()


def _valid_iso_date(value: str) -> str | None:
    try:
        return date.fromisoformat(value).isoformat()
    except ValueError:
        return None


def _date_version_base(version: str | None) -> str | None:
    value = _clean(version)
    match = _DATE_VERSION_PREFIX.match(value)
    if not match:
        return None
    return _valid_iso_date(match.group(1))


def _build_date(value: str | None) -> str:
    cleaned = _clean(value)
    if cleaned:
        parsed = _valid_iso_date(cleaned[:10])
        if parsed:
            return parsed
        if cleaned.isdigit():
            try:
                return datetime.fromtimestamp(int(cleaned), UTC).date().isoformat()
            except (OSError, OverflowError, ValueError):
                pass
    return datetime.now(UTC).date().isoformat()


def is_placeholder_version(version: str | None) -> bool:
    value = _clean(version)
    if not value:
        return True
    return value.lower().lstrip("v") in _BRANCH_PLACEHOLDERS


def is_release_like_version(version: str | None) -> bool:
    value = _clean(version)
    return bool(value and (_date_version_base(value) or _SEMVER_PREFIX.match(value)))


def build_metadata_version(
    build_number: str | None,
    git_sha: str | None = None,
    *,
    base_version: str | None = None,
    build_date: str | None = None,
) -> str | None:
    number = _clean(build_number)
    base = _date_version_base(base_version) or _build_date(build_date)
    if number:
        return f"{base}.{number}"
    if _clean(git_sha):
        return f"{base}.dev"
    return None


def git_describe_version(repo_root: Path | None = None) -> str | None:
    root = repo_root or Path(__file__).resolve().parents[3]
    try:
        result = subprocess.run(
            ["git", "-C", str(root), "describe", "--tags", "--abbrev=7", "--match", "v[0-9]*", "--always"],
            check=True,
            capture_output=True,
            text=True,
        )
    except (OSError, subprocess.CalledProcessError):
        return None
    described = _clean(result.stdout)
    return described.lstrip("v") or None


def resolve_app_version(env: dict[str, str] | None = None) -> str:
    source = env or os.environ
    configured = _clean(source.get("APP_VERSION"))
    if configured and not is_placeholder_version(configured):
        return configured.lstrip("v")

    described = git_describe_version()
    build_number = source.get("APP_BUILD_NUMBER") or source.get("GITHUB_RUN_NUMBER")
    git_sha = source.get("APP_GIT_SHA") or source.get("GITHUB_SHA")
    derived = build_metadata_version(
        build_number,
        git_sha,
        base_version=described,
        build_date=source.get("APP_BUILD_DATE") or source.get("SOURCE_DATE_EPOCH"),
    )
    if derived:
        return derived

    if described and _date_version_base(described) == described:
        return described

    if described and is_release_like_version(described):
        return described

    if described and not is_placeholder_version(described):
        return described

    return configured.lstrip("v") if configured else "dev"
