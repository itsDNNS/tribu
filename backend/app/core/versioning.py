"""Version resolution helpers for backend health/build reporting."""
from __future__ import annotations

import os
import re
import subprocess
from pathlib import Path

_BRANCH_PLACEHOLDERS = {"main", "master", "dev", "latest", "head"}
_SEMVER_PREFIX = re.compile(r"^v?\d+\.\d+\.\d+")
_SHA_CHARS = re.compile(r"[^0-9a-f]", re.IGNORECASE)


def _clean(value: str | None) -> str:
    return (value or "").strip()


def is_placeholder_version(version: str | None) -> bool:
    value = _clean(version)
    if not value:
        return True
    return value.lower().lstrip("v") in _BRANCH_PLACEHOLDERS


def is_release_like_version(version: str | None) -> bool:
    value = _clean(version)
    return bool(value and _SEMVER_PREFIX.match(value))


def build_metadata_version(build_number: str | None, git_sha: str | None) -> str | None:
    number = _clean(build_number)
    sha = _SHA_CHARS.sub("", _clean(git_sha))[:7]
    if number and sha:
        return f"build.{number}-g{sha}"
    if number:
        return f"build.{number}"
    if sha:
        return f"g{sha}"
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
    if described and is_release_like_version(described):
        return described

    derived = build_metadata_version(
        source.get("APP_BUILD_NUMBER") or source.get("GITHUB_RUN_NUMBER"),
        source.get("APP_GIT_SHA") or source.get("GITHUB_SHA"),
    )
    if derived:
        return derived

    if described and not is_placeholder_version(described):
        return described

    return configured.lstrip("v") if configured else "dev"
