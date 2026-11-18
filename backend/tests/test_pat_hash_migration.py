"""Verify the bcrypt + lookup migration path for Personal Access Tokens.

Seeds a legacy SHA-256 hashed PAT, authenticates once to trigger the
lazy migration, and then asserts the row has been rewritten to bcrypt
plus an HMAC lookup key. A second authentication must still succeed,
now via the new path.
"""
from __future__ import annotations

from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.models import Family, Membership, PersonalAccessToken, User
from app.security import PAT_PREFIX
from tests.support import add_member, dav_basic, delete_production_rows


EMAIL = "pat-migrate@example.com"


def test_legacy_pat_lazy_migrates_on_first_auth(dav_app):
    from app.security import pat_lookup_key

    with SessionLocal() as db:
        # add_member seeds the PAT in the pre-migration layout that the
        # Alembic upgrade would produce: token_hash = SHA-256(plain),
        # token_lookup = same value (Alembic 0027 backfills it from
        # token_hash).
        member = add_member(db, EMAIL, scopes="calendar:read,calendar:write,contacts:read", family_name="Mig Family", display_name="Mig User")
        db.commit()
        plain = member.token
        pat = db.query(PersonalAccessToken).filter(PersonalAccessToken.user_id == member.user_id).one()
        assert pat.token_hash == pat.token_lookup == pat_lookup_key(plain)
        pat_id = pat.id

    client = TestClient(dav_app)
    headers = {"Authorization": dav_basic(EMAIL, plain)}
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
            "Authorization": dav_basic(EMAIL, PAT_PREFIX + "not-the-real-token"),
            "Depth": "0",
            "Content-Type": "application/xml",
        },
        content=body,
    )
    assert resp3.status_code == 401

    # Cleanup
    delete_production_rows(PersonalAccessToken, Membership, Family, User)
