"""Tests for backend app version resolution."""
from __future__ import annotations

import importlib

from app.core.versioning import resolve_app_version


def test_resolve_app_version_prefers_explicit_override():
    version = resolve_app_version({"APP_VERSION_OVERRIDE": "2026-06-20.manual", "APP_VERSION": "2026-06-20.123"})

    assert version == "2026-06-20.manual"


def test_resolve_app_version_reads_release_version_from_environment():
    assert resolve_app_version({"APP_VERSION": "2026-06-20.456"}) == "2026-06-20.456"
    assert resolve_app_version({"APP_VERSION": "v2026-06-20"}) == "2026-06-20"


def test_resolve_app_version_falls_back_to_dev_without_environment():
    assert resolve_app_version({}) == "dev"
    assert resolve_app_version({"APP_VERSION": " ", "APP_VERSION_OVERRIDE": ""}) == "dev"


def test_config_version_uses_supported_environment(monkeypatch):
    monkeypatch.setenv("APP_VERSION", "2026-06-20.789")
    monkeypatch.setenv("JWT_SECRET", "test-secret")
    monkeypatch.delenv("APP_VERSION_OVERRIDE", raising=False)

    import app.core.config as config

    config = importlib.reload(config)
    assert config.VERSION == "2026-06-20.789"


def test_health_response_keeps_version_contract(monkeypatch):
    monkeypatch.setenv("JWT_SECRET", "test-secret")
    monkeypatch.setenv("DATABASE_URL", "sqlite:///:memory:")

    from fastapi.testclient import TestClient
    import app.main as main

    monkeypatch.setattr(main, "VERSION", "2026-06-20.789")

    response = TestClient(main.app).get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "tribu-api", "version": "2026-06-20.789"}
