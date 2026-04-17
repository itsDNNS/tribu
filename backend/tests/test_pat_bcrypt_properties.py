"""Regression tests for post-migration PAT invariants.

Two properties this suite pins down:

1. ``pat_lookup_key`` is a pure function of the plain token and does
   not depend on ``JWT_SECRET``. This is the property whose earlier
   HMAC-based implementation stranded every PAT on secret rotation
   (fixed in 69c1275).

2. A freshly-minted bcrypt PAT on a clean install authenticates via
   the single-equality ``token_lookup`` path without triggering lazy
   migration. The existing ``test_pat_hash_migration.py`` exercises
   the legacy fallback; this file covers the happy path for brand-new
   rows so both code paths have explicit coverage.
"""
from __future__ import annotations

import hashlib
import importlib

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from app.database import Base, get_db
from app.main import app
from app.models import Family, Membership, PersonalAccessToken, User
from app.security import (
    PAT_PREFIX,
    generate_pat,
    hash_password,
    pat_lookup_key,
)


# ---------------------------------------------------------------------------
# Property 1: JWT_SECRET rotation does not invalidate PAT lookups
# ---------------------------------------------------------------------------

def test_pat_lookup_key_is_plain_sha256():
    """The on-disk index value is sha256(plain) with no secret mixed in."""
    plain = f"{PAT_PREFIX}rotation-probe"
    assert pat_lookup_key(plain) == hashlib.sha256(plain.encode()).hexdigest()


def test_pat_lookup_key_unaffected_by_jwt_secret_rotation(monkeypatch):
    """Rewriting JWT_SECRET must not change the lookup fingerprint.

    The rotation is simulated the way it actually happens in prod:
    the environment variable flips, the process re-imports the
    security module, and the new module-level ``JWT_SECRET`` value
    is read from the environment. ``monkeypatch.setenv`` is what
    propagates through the reload; patching the module attribute
    directly would be overwritten by the reload.
    """
    plain = f"{PAT_PREFIX}rotation-probe"
    before = pat_lookup_key(plain)

    monkeypatch.setenv("JWT_SECRET", "totally-different-secret-after-rotation")
    import app.security as sec
    importlib.reload(sec)
    assert sec.JWT_SECRET == "totally-different-secret-after-rotation"

    after = sec.pat_lookup_key(plain)
    assert before == after


# ---------------------------------------------------------------------------
# Property 2: Freshly-minted bcrypt PAT authenticates without migration
# ---------------------------------------------------------------------------

engine = create_engine(
    "sqlite:///./test-pat-bcrypt.db",
    connect_args={"check_same_thread": False},
)
TestSession = sessionmaker(bind=engine)


@event.listens_for(engine, "connect")
def _set_sqlite_pragma(dbapi_conn, _):
    cursor = dbapi_conn.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


@pytest.fixture
def clean_db():
    Base.metadata.create_all(bind=engine)

    def _override():
        db = TestSession()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _override
    yield
    app.dependency_overrides.pop(get_db, None)
    Base.metadata.drop_all(bind=engine)


def test_fresh_bcrypt_pat_authenticates_without_migration(clean_db):
    db = TestSession()
    user = User(
        email="fresh-bcrypt@example.com",
        password_hash=hash_password("x"),
        display_name="Fresh Install",
    )
    db.add(user)
    db.flush()
    family = Family(name="Fresh Family")
    db.add(family)
    db.flush()
    db.add(Membership(user_id=user.id, family_id=family.id, role="admin", is_adult=True))

    plain, token_hash, lookup_key = generate_pat()
    pat = PersonalAccessToken(
        user_id=user.id,
        name="fresh-pat",
        token_hash=token_hash,
        token_lookup=lookup_key,
        scopes="profile:read",
    )
    db.add(pat)
    db.commit()
    pat_id = pat.id

    # Row is in the post-migration layout: bcrypt envelope for verification
    # and a plain SHA-256 fingerprint for the index lookup.
    assert token_hash.startswith("$2")
    assert lookup_key == hashlib.sha256(plain.encode()).hexdigest()
    db.close()

    client = TestClient(app)
    resp = client.get("/tokens", headers={"Authorization": f"Bearer {plain}"})
    assert resp.status_code == 200, resp.text
    assert any(t["name"] == "fresh-pat" for t in resp.json())

    # Lazy migration must be a no-op here: the stored hash should still
    # be the exact bcrypt envelope minted at creation, bit-for-bit.
    db = TestSession()
    try:
        row = db.query(PersonalAccessToken).filter(PersonalAccessToken.id == pat_id).one()
        assert row.token_hash == token_hash
        assert row.token_lookup == lookup_key
        assert row.last_used_at is not None
    finally:
        db.close()
