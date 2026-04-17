"""Verify the bcrypt + lookup migration path for Personal Access Tokens.

Seeds a legacy SHA-256 hashed PAT, authenticates once to trigger the
lazy migration, and then asserts the row has been rewritten to bcrypt
plus an HMAC lookup key. A second authentication must still succeed,
now via the new path.
"""
from __future__ import annotations

import base64
import os
import tempfile

import pytest
from fastapi.testclient import TestClient

from app.database import Base, SessionLocal, engine
from app.models import Family, Membership, PersonalAccessToken, User
from app.security import PAT_PREFIX, hash_password


EMAIL = "pat-migrate@example.com"


@pytest.fixture(scope="module")
def dav_storage_folder():
    with tempfile.TemporaryDirectory(prefix="tribu-pat-migrate-") as folder:
        os.environ["DAV_STORAGE_FOLDER"] = folder
        yield folder
        os.environ.pop("DAV_STORAGE_FOLDER", None)


@pytest.fixture(scope="module")
def app_under_test(dav_storage_folder):
    from app.main import app

    Base.metadata.create_all(bind=engine)
    yield app
    Base.metadata.drop_all(bind=engine)


def _basic(login: str, token: str) -> str:
    return "Basic " + base64.b64encode(f"{login}:{token}".encode("utf-8")).decode("ascii")


def test_legacy_pat_lazy_migrates_on_first_auth(app_under_test):
    from app.security import pat_lookup_key

    app = app_under_test
    db = SessionLocal()
    try:
        user = User(email=EMAIL, password_hash=hash_password("x"), display_name="Mig User")
        db.add(user)
        db.flush()
        family = Family(name="Mig Family")
        db.add(family)
        db.flush()
        db.add(Membership(user_id=user.id, family_id=family.id, role="admin", is_adult=True))
        plain = f"{PAT_PREFIX}legacy-pat-migrate"
        # Seed the row in the pre-migration layout that the Alembic
        # upgrade would produce: token_hash = SHA-256(plain),
        # token_lookup = same value (Alembic 0027 backfills it from
        # token_hash).
        legacy = pat_lookup_key(plain)
        db.add(PersonalAccessToken(
            user_id=user.id,
            name="legacy-pat",
            token_hash=legacy,
            token_lookup=legacy,
            scopes="calendar:read,calendar:write,contacts:read",
        ))
        db.commit()
        pat_id = db.query(PersonalAccessToken).filter(PersonalAccessToken.user_id == user.id).one().id
    finally:
        db.close()

    client = TestClient(app)
    headers = {"Authorization": _basic(EMAIL, plain)}
    body = (
        '<?xml version="1.0"?>'
        '<propfind xmlns="DAV:"><prop><current-user-principal/></prop></propfind>'
    )
    # First PROPFIND must succeed via the legacy fallback.
    resp1 = client.request("PROPFIND", f"/dav/{EMAIL}/", headers={**headers, "Depth": "0", "Content-Type": "application/xml"}, content=body)
    assert resp1.status_code == 207, resp1.text

    # Row should now be bcrypt-format, and token_lookup still holds
    # the SHA-256 fingerprint so the second PROPFIND hits the same
    # index row.
    db = SessionLocal()
    try:
        row = db.query(PersonalAccessToken).filter(PersonalAccessToken.id == pat_id).one()
        assert row.token_hash.startswith("$2"), row.token_hash
        assert row.token_lookup == pat_lookup_key(plain)
    finally:
        db.close()

    # Second PROPFIND still works (now via bcrypt + lookup).
    resp2 = client.request("PROPFIND", f"/dav/{EMAIL}/", headers={**headers, "Depth": "0", "Content-Type": "application/xml"}, content=body)
    assert resp2.status_code == 207, resp2.text

    # Wrong token must still fail.
    resp3 = client.request(
        "PROPFIND",
        f"/dav/{EMAIL}/",
        headers={
            "Authorization": _basic(EMAIL, PAT_PREFIX + "not-the-real-token"),
            "Depth": "0",
            "Content-Type": "application/xml",
        },
        content=body,
    )
    assert resp3.status_code == 401

    # Cleanup
    db = SessionLocal()
    try:
        db.query(PersonalAccessToken).filter(PersonalAccessToken.user_id == user.id).delete()
        db.query(Membership).filter(Membership.user_id == user.id).delete()
        db.query(Family).delete()
        db.query(User).filter(User.email == EMAIL).delete()
        db.commit()
    finally:
        db.close()
