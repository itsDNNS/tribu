"""Tests for backend app version resolution."""
from __future__ import annotations

from app.core.versioning import (
    build_metadata_version,
    is_placeholder_version,
    is_release_like_version,
    load_build_info,
    resolve_app_version,
    write_build_info_file,
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
    assert resolve_app_version({"APP_VERSION": "v2026-04-24"}, build_info={}) == "2026-04-24"
    assert resolve_app_version({"APP_VERSION": "v2026-04-24.412"}, build_info={}) == "2026-04-24.412"
    assert resolve_app_version({"APP_VERSION": "1.6.0-3-gabc1234+build.412"}, build_info={}) == "1.6.0-3-gabc1234+build.412"


def test_resolve_app_version_prefers_image_build_info_over_stale_runtime_env():
    version = resolve_app_version(
        {
            "APP_VERSION": "2026-05-13.287",
            "APP_BUILD_NUMBER": "287",
            "APP_GIT_SHA": "b0944c70aacb9600be8ae3266096c89691225461",
            "APP_BUILD_DATE": "2026-06-05",
        },
        build_info={
            "APP_VERSION": "2026-05-13.294",
            "APP_BUILD_NUMBER": "294",
            "APP_GIT_SHA": "08edd2634291fe882bc59556f2d56c8bef54176b",
            "APP_BUILD_DATE": "2026-06-18",
        },
    )

    assert version == "2026-05-13.294"


def test_resolve_app_version_uses_image_build_metadata_for_branch_placeholders(monkeypatch):
    monkeypatch.setattr("app.core.versioning.git_describe_version", lambda repo_root=None: None)
    version = resolve_app_version(
        {"APP_VERSION": "2026-05-13.287", "APP_BUILD_NUMBER": "287"},
        build_info={
            "APP_VERSION": "main",
            "APP_BUILD_NUMBER": "294",
            "APP_GIT_SHA": "08edd2634291fe882bc59556f2d56c8bef54176b",
            "APP_BUILD_DATE": "2026-06-18",
        },
    )

    assert version == "2026-06-18.294"


def test_app_version_override_remains_explicit_escape_hatch():
    version = resolve_app_version(
        {"APP_VERSION_OVERRIDE": "2026-06-19.manual", "APP_VERSION": "2026-05-13.287"},
        build_info={"APP_VERSION": "2026-05-13.294"},
    )

    assert version == "2026-06-19.manual"


def test_build_info_file_round_trip(tmp_path):
    path = tmp_path / "build_info.json"
    write_build_info_file(
        path,
        {
            "APP_VERSION": "main",
            "APP_BUILD_NUMBER": "294",
            "APP_GIT_SHA": "08edd2634291fe882bc59556f2d56c8bef54176b",
            "APP_BUILD_DATE": "2026-06-18",
        },
    )

    assert load_build_info(path) == {
        "APP_VERSION": "main",
        "APP_BUILD_NUMBER": "294",
        "APP_GIT_SHA": "08edd2634291fe882bc59556f2d56c8bef54176b",
        "APP_BUILD_DATE": "2026-06-18",
    }


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
