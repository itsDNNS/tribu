"""Tests for backend app version resolution."""
from __future__ import annotations

from app.core.versioning import (
    build_metadata_version,
    git_describe_version,
    is_placeholder_version,
    resolve_app_version,
)


def test_placeholder_versions_are_detected():
    assert is_placeholder_version("main") is True
    assert is_placeholder_version("vmain") is True
    assert is_placeholder_version("dev") is True
    assert is_placeholder_version("1.6.0-3-gabc1234") is False


def test_build_metadata_version_uses_run_number_and_sha():
    assert build_metadata_version("412", "abcdef123456") == "build.412-gabcdef1"
    assert build_metadata_version("412", None) == "build.412"
    assert build_metadata_version(None, "abcdef123456") == "gabcdef1"


def test_resolve_app_version_preserves_explicit_release_versions():
    version = resolve_app_version({"APP_VERSION": "1.6.0-3-gabc1234+build.412"})
    assert version == "1.6.0-3-gabc1234+build.412"


def test_resolve_app_version_replaces_branch_placeholder_with_build_metadata(monkeypatch):
    monkeypatch.setattr("app.core.versioning.git_describe_version", lambda repo_root=None: None)
    version = resolve_app_version({
        "APP_VERSION": "main",
        "APP_BUILD_NUMBER": "412",
        "APP_GIT_SHA": "abcdef123456",
    })
    assert version == "build.412-gabcdef1"




def test_resolve_app_version_prefers_build_metadata_over_bare_git_sha(monkeypatch):
    monkeypatch.setattr("app.core.versioning.git_describe_version", lambda repo_root=None: "abcdef1")
    version = resolve_app_version({
        "APP_VERSION": "main",
        "APP_BUILD_NUMBER": "412",
        "APP_GIT_SHA": "abcdef123456",
    })
    assert version == "build.412-gabcdef1"
def test_resolve_app_version_falls_back_to_git_describe_when_available(monkeypatch):
    monkeypatch.setattr("app.core.versioning.git_describe_version", lambda repo_root=None: "1.6.0-3-gabc1234")
    version = resolve_app_version({"APP_VERSION": "main"})
    assert version == "1.6.0-3-gabc1234"


def test_config_version_uses_resolver(monkeypatch):
    monkeypatch.setattr("app.core.versioning.git_describe_version", lambda repo_root=None: None)
    monkeypatch.setenv("APP_VERSION", "main")
    monkeypatch.setenv("APP_BUILD_NUMBER", "412")
    monkeypatch.setenv("APP_GIT_SHA", "abcdef123456")

    import app.core.config as config
    import importlib

    config = importlib.reload(config)
    assert config.VERSION == "build.412-gabcdef1"
