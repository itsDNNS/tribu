"""Integration tests for the Radicale mount and PAT auth plugin.

Only the auth path is exercised here; Phase B will add tests around
the actual CalDAV storage plugin that projects Tribu's calendar
events onto DAV collections.
"""
from __future__ import annotations

import base64
import hashlib
import os
import tempfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.database import Base, SessionLocal, engine
from app.models import PersonalAccessToken, User
from app.security import hash_password, PAT_PREFIX


@pytest.fixture(scope="module")
def dav_storage_folder():
    with tempfile.TemporaryDirectory(prefix="tribu-dav-test-") as folder:
        os.environ["DAV_STORAGE_FOLDER"] = folder
        yield folder
        os.environ.pop("DAV_STORAGE_FOLDER", None)


@pytest.fixture(scope="module")
def app_under_test(dav_storage_folder):
    # Import app *after* the storage folder env var is set so the
    # Radicale configuration picks it up. The auth plugin reads the
    # production SessionLocal, so tests run against the same SQLite
    # DB that app.database points at via DATABASE_URL.
    from app.main import app

    Base.metadata.create_all(bind=engine)
    yield app, SessionLocal
    Base.metadata.drop_all(bind=engine)


def _seed_pat(TestSession, *, email: str, scopes: str, suffix: str) -> str:
    db = TestSession()
    user = User(email=email, password_hash=hash_password("x"), display_name="DAV User")
    db.add(user)
    db.flush()
    plain = f"{PAT_PREFIX}dav-{suffix}"
    db.add(PersonalAccessToken(
        user_id=user.id,
        name="dav-pat",
        token_hash=hashlib.sha256(plain.encode("utf-8")).hexdigest(),
        scopes=scopes,
    ))
    db.commit()
    db.close()
    return plain


def _basic(login: str, token: str) -> str:
    return "Basic " + base64.b64encode(f"{login}:{token}".encode("utf-8")).decode("ascii")


def _propfind(client: TestClient, path: str, *, headers=None):
    # Standard CalDAV discovery PROPFIND with Depth=0.
    body = (
        '<?xml version="1.0"?>'
        '<propfind xmlns="DAV:"><prop><current-user-principal/></prop></propfind>'
    )
    h = {"Depth": "0", "Content-Type": "application/xml"}
    if headers:
        h.update(headers)
    return client.request("PROPFIND", path, headers=h, content=body)


class TestDavAuth:
    def test_unauthenticated_propfind_returns_401(self, app_under_test):
        app, _ = app_under_test
        client = TestClient(app)
        resp = _propfind(client, "/dav/")
        assert resp.status_code == 401
        assert "WWW-Authenticate" in resp.headers

    def test_wrong_token_returns_401(self, app_under_test):
        app, TestSession = app_under_test
        _seed_pat(TestSession, email="dav-wrong@example.com", scopes="calendar:read", suffix="wrong")
        client = TestClient(app)
        headers = {"Authorization": _basic("dav-wrong@example.com", PAT_PREFIX + "garbage")}
        resp = _propfind(client, "/dav/dav-wrong@example.com/", headers=headers)
        assert resp.status_code == 401

    def test_valid_pat_with_dav_scope_gets_through(self, app_under_test):
        app, TestSession = app_under_test
        token = _seed_pat(
            TestSession,
            email="dav-ok@example.com",
            scopes="calendar:read,contacts:read",
            suffix="ok",
        )
        client = TestClient(app)
        headers = {"Authorization": _basic("dav-ok@example.com", token)}
        resp = _propfind(client, "/dav/dav-ok@example.com/", headers=headers)
        # Radicale returns 207 Multi-Status on a successful PROPFIND.
        assert resp.status_code == 207, resp.text

    def test_valid_pat_without_dav_scope_is_rejected(self, app_under_test):
        """A PAT that only has shopping:read cannot unlock DAV."""
        app, TestSession = app_under_test
        token = _seed_pat(
            TestSession,
            email="dav-shop@example.com",
            scopes="shopping:read",
            suffix="shop",
        )
        client = TestClient(app)
        headers = {"Authorization": _basic("dav-shop@example.com", token)}
        resp = _propfind(client, "/dav/dav-shop@example.com/", headers=headers)
        assert resp.status_code == 401

    def test_wildcard_scope_works(self, app_under_test):
        app, TestSession = app_under_test
        token = _seed_pat(
            TestSession,
            email="dav-star@example.com",
            scopes="*",
            suffix="star",
        )
        client = TestClient(app)
        headers = {"Authorization": _basic("dav-star@example.com", token)}
        resp = _propfind(client, "/dav/dav-star@example.com/", headers=headers)
        assert resp.status_code == 207
