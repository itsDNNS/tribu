"""Tests for backend app version resolution."""
from __future__ import annotations

from app.core.versioning import (
    build_metadata_version,
    is_placeholder_version,
    is_release_like_version,
    resolve_app_version,
)


def test_placeholder_versions_are_detected():
    assert is_placeholder_version("main") is True
    assert is_placeholder_version("vmain") is True
    assert is_placeholder_version("dev") is True
    assert is_placeholder_version("v2026-04-24") is False
    assert is_placeholder_version("1.6.0-3-gabc1234") is False


def test_release_like_versions_include_product_dates_and_semver():
    assert is_release_like_version("v2026-04-24") is True
    assert is_release_like_version("2026-04-24.412") is True
    assert is_release_like_version("1.6.0-3-gabc1234") is True
    assert is_release_like_version("build.412-gabcdef1") is False


def test_build_metadata_version_uses_date_and_run_number():
    assert build_metadata_version("412", "abcdef123456", build_date="2026-04-24") == "2026-04-24.412"
    assert build_metadata_version("412", None, base_version="v2026-04-23-2-gabcdef1") == "2026-04-23.412"
    assert build_metadata_version(None, "abcdef123456", build_date="2026-04-24") == "2026-04-24.dev"


def test_resolve_app_version_preserves_explicit_release_versions():
    assert resolve_app_version({"APP_VERSION": "v2026-04-24"}) == "2026-04-24"
    assert resolve_app_version({"APP_VERSION": "v2026-04-24.412"}) == "2026-04-24.412"
    assert resolve_app_version({"APP_VERSION": "1.6.0-3-gabc1234+build.412"}) == "1.6.0-3-gabc1234+build.412"


def test_resolve_app_version_replaces_branch_placeholder_with_build_metadata(monkeypatch):
    monkeypatch.setattr("app.core.versioning.git_describe_version", lambda repo_root=None: None)
    version = resolve_app_version({
        "APP_VERSION": "main",
        "APP_BUILD_NUMBER": "412",
        "APP_GIT_SHA": "abcdef123456",
        "APP_BUILD_DATE": "2026-04-24",
    })
    assert version == "2026-04-24.412"


def test_resolve_app_version_prefers_build_metadata_over_bare_git_sha(monkeypatch):
    monkeypatch.setattr("app.core.versioning.git_describe_version", lambda repo_root=None: "abcdef1")
    version = resolve_app_version({
        "APP_VERSION": "main",
        "APP_BUILD_NUMBER": "412",
        "APP_GIT_SHA": "abcdef123456",
        "APP_BUILD_DATE": "2026-04-24",
    })
    assert version == "2026-04-24.412"


def test_resolve_app_version_uses_date_tag_base_for_non_release_builds(monkeypatch):
    monkeypatch.setattr("app.core.versioning.git_describe_version", lambda repo_root=None: "2026-04-23-2-gabc1234")
    version = resolve_app_version({
        "APP_VERSION": "main",
        "APP_BUILD_NUMBER": "412",
        "APP_GIT_SHA": "abcdef123456",
        "APP_BUILD_DATE": "2026-04-24",
    })
    assert version == "2026-04-23.412"


def test_resolve_app_version_appends_build_number_to_exact_date_tag_placeholders(monkeypatch):
    monkeypatch.setattr("app.core.versioning.git_describe_version", lambda repo_root=None: "2026-04-24")
    version = resolve_app_version({
        "APP_VERSION": "main",
        "APP_BUILD_NUMBER": "412",
        "APP_GIT_SHA": "abcdef123456",
    })
    assert version == "2026-04-24.412"


def test_resolve_app_version_falls_back_to_git_describe_when_available(monkeypatch):
    monkeypatch.setattr("app.core.versioning.git_describe_version", lambda repo_root=None: "1.6.0-3-gabc1234")
    version = resolve_app_version({"APP_VERSION": "main"})
    assert version == "1.6.0-3-gabc1234"


def test_config_version_uses_resolver(monkeypatch):
    monkeypatch.setattr("app.core.versioning.git_describe_version", lambda repo_root=None: None)
    monkeypatch.setenv("APP_VERSION", "main")
    monkeypatch.setenv("APP_BUILD_NUMBER", "412")
    monkeypatch.setenv("APP_GIT_SHA", "abcdef123456")
    monkeypatch.setenv("APP_BUILD_DATE", "2026-04-24")

    import app.core.config as config
    import importlib

    config = importlib.reload(config)
    assert config.VERSION == "2026-04-24.412"
