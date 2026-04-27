"""Integration tests for shared-home display devices (issue #172).

Covers:
- Admin can create + list display devices; plaintext token only returned once.
- Non-admin family members are rejected on create/list/revoke.
- A display token authenticates ``/display/me`` and ``/display/dashboard``.
- A display token CANNOT reach user-facing routes (``/auth/me``, ``/families/me``).
- Revocation makes subsequent display calls fail.
- The display dashboard never leaks member emails.
"""

import hashlib
import json as json_module

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from app.database import Base, get_db
from app.main import app
from app.models import DisplayDevice, Family, Membership, PersonalAccessToken, User
from app.security import PAT_PREFIX, hash_password


import tempfile
import os

# Keep the SQLite test DB outside committed artifacts. Per-process
# tempfile, cleaned up at interpreter exit.
_DB_FD, _DB_PATH = tempfile.mkstemp(prefix="tribu-display-devices-", suffix=".db")
os.close(_DB_FD)
engine = create_engine(
    f"sqlite:///{_DB_PATH}",
    connect_args={"check_same_thread": False},
)
TestSession = sessionmaker(bind=engine)


@event.listens_for(engine, "connect")
def _set_sqlite_pragma(dbapi_conn, _):
    cursor = dbapi_conn.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


@pytest.fixture(autouse=True)
def setup_db():
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


client = TestClient(app)


# ---------------------------------------------------------------------------
# Seed helpers
# ---------------------------------------------------------------------------


def _seed_member_with_pat(
    suffix: str,
    *,
    role: str,
    is_adult: bool,
    scopes: str = "*",
    family_id: int | None = None,
    email: str | None = None,
) -> tuple[str, int, int]:
    """Seed a user + family + membership + PAT. Returns (token, user_id, family_id)."""
    db = TestSession()
    user = User(
        email=email or f"display-{suffix}@example.com",
        password_hash=hash_password("password"),
        display_name=f"User {suffix}",
    )
    db.add(user)
    db.flush()

    if family_id is None:
        family = Family(name=f"Family {suffix}")
        db.add(family)
        db.flush()
        family_id = int(family.id)
    assert family_id is not None

    db.add(Membership(user_id=user.id, family_id=family_id, role=role, is_adult=is_adult))

    plain = f"{PAT_PREFIX}displaytest-{suffix}"
    lookup = hashlib.sha256(plain.encode()).hexdigest()
    db.add(PersonalAccessToken(
        user_id=user.id,
        name="display-pat",
        token_hash=lookup,
        token_lookup=lookup,
        scopes=scopes,
    ))
    user_id = user.id
    db.commit()
    db.close()
    return plain, user_id, family_id


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


# ---------------------------------------------------------------------------
# Admin CRUD
# ---------------------------------------------------------------------------


class TestAdminCreateAndList:
    def test_admin_can_create_and_token_is_returned_once(self):
        admin_token, _, family_id = _seed_member_with_pat("admin1", role="admin", is_adult=True)
        resp = client.post(
            f"/families/{family_id}/display-devices",
            json={"name": "Kitchen Tablet"},
            headers=_auth(admin_token),
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["token"].startswith("tribu_display_")
        assert body["device"]["family_id"] == family_id
        assert body["device"]["name"] == "Kitchen Tablet"
        assert body["device"]["revoked_at"] is None

        # Listing must NOT contain the plaintext token.
        list_resp = client.get(
            f"/families/{family_id}/display-devices",
            headers=_auth(admin_token),
        )
        assert list_resp.status_code == 200
        items = list_resp.json()
        assert len(items) == 1
        assert "token" not in items[0]
        assert "token_hash" not in items[0]
        assert "token_lookup" not in items[0]

    def test_non_admin_member_cannot_create(self):
        member_token, _, family_id = _seed_member_with_pat(
            "member1", role="member", is_adult=True
        )
        resp = client.post(
            f"/families/{family_id}/display-devices",
            json={"name": "Hallway Frame"},
            headers=_auth(member_token),
        )
        assert resp.status_code == 403
        assert "ADMIN_REQUIRED" in resp.text

    def test_non_admin_member_cannot_list(self):
        member_token, _, family_id = _seed_member_with_pat(
            "member2", role="member", is_adult=True
        )
        resp = client.get(
            f"/families/{family_id}/display-devices",
            headers=_auth(member_token),
        )
        assert resp.status_code == 403

    def test_outsider_cannot_list(self):
        # A different family's admin must not be able to read this one.
        _, _, family_a = _seed_member_with_pat("admA", role="admin", is_adult=True)
        outsider_token, _, _ = _seed_member_with_pat("admB", role="admin", is_adult=True)
        resp = client.get(
            f"/families/{family_a}/display-devices",
            headers=_auth(outsider_token),
        )
        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# Display token authentication boundary
# ---------------------------------------------------------------------------


def _mint_display_token(family_id: int, name: str = "Test Display") -> str:
    admin_token, _, _ = _seed_member_with_pat(
        f"adminmint-{name.replace(' ', '_')}-{family_id}",
        role="admin",
        is_adult=True,
        family_id=family_id,
    )
    resp = client.post(
        f"/families/{family_id}/display-devices",
        json={"name": name},
        headers=_auth(admin_token),
    )
    assert resp.status_code == 200, resp.text
    return resp.json()["token"]


class TestDisplayRuntime:
    def test_display_me_with_display_token_returns_identity(self):
        _, _, family_id = _seed_member_with_pat("dispOwner1", role="admin", is_adult=True)
        token = _mint_display_token(family_id, "Kitchen")

        resp = client.get("/display/me", headers=_auth(token))
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["family_id"] == family_id
        assert body["name"] == "Kitchen"
        assert "email" not in body

    def test_display_dashboard_excludes_member_emails(self):
        admin_token, _, family_id = _seed_member_with_pat(
            "dashAdmin",
            role="admin",
            is_adult=True,
            email="secret-admin@example.com",
        )
        # Add a second member whose email must also not leak.
        _seed_member_with_pat(
            "dashKid",
            role="member",
            is_adult=False,
            family_id=family_id,
            email="secret-kid@example.com",
        )

        resp = client.post(
            f"/families/{family_id}/display-devices",
            json={"name": "Living Room"},
            headers=_auth(admin_token),
        )
        assert resp.status_code == 200, resp.text
        display_token = resp.json()["token"]

        dash = client.get("/display/dashboard", headers=_auth(display_token))
        assert dash.status_code == 200, dash.text
        body = dash.json()
        assert body["family_id"] == family_id
        assert body["device_name"] == "Living Room"

        # No email field on any member, and no email value anywhere.
        member_keys = {k for m in body["members"] for k in m.keys()}
        assert "email" not in member_keys
        raw = dash.text
        assert "secret-admin@example.com" not in raw
        assert "secret-kid@example.com" not in raw

    def test_display_dashboard_member_fields_are_minimal(self):
        """Only display_name + color. No user_id, is_adult, profile_image, role."""
        admin_token, _, family_id = _seed_member_with_pat(
            "minAdmin", role="admin", is_adult=True
        )
        _seed_member_with_pat(
            "minKid", role="member", is_adult=False, family_id=family_id
        )

        resp = client.post(
            f"/families/{family_id}/display-devices",
            json={"name": "Wall"},
            headers=_auth(admin_token),
        )
        token = resp.json()["token"]

        dash = client.get("/display/dashboard", headers=_auth(token))
        assert dash.status_code == 200
        body = dash.json()
        assert body["members"], "expected at least one member"
        for m in body["members"]:
            assert set(m.keys()) == {"display_name", "color"}, m
        # Defensive: even if a future serializer leaks, the field
        # NAMES themselves must not appear in the JSON for a member.
        members_json = json_module.dumps(body["members"])
        for forbidden in ("user_id", "is_adult", "profile_image", "role", "email"):
            assert forbidden not in members_json, forbidden

    def test_display_dashboard_event_fields_are_display_safe(self):
        """Events must not expose user IDs, source URLs, or assignment metadata."""
        admin_token, admin_user_id, family_id = _seed_member_with_pat(
            "evAdmin", role="admin", is_adult=True
        )

        # Seed an event directly so we can prove the response strips
        # the personal/admin fields the underlying CalendarEvent has.
        from datetime import datetime, timedelta, timezone
        from app.models import CalendarEvent
        db = TestSession()
        future = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(days=1)
        ev = CalendarEvent(
            family_id=family_id,
            title="Soccer practice",
            starts_at=future,
            ends_at=future + timedelta(hours=1),
            all_day=False,
            assigned_to=[admin_user_id],
            color="#7c3aed",
            category="sports",
            created_by_user_id=admin_user_id,
            source_type="subscription",
            source_name="Coach Feed",
            source_url="https://leak.example.com/secret-feed.ics",
        )
        db.add(ev)
        db.commit()
        db.close()

        resp = client.post(
            f"/families/{family_id}/display-devices",
            json={"name": "Hall"},
            headers=_auth(admin_token),
        )
        token = resp.json()["token"]

        dash = client.get("/display/dashboard", headers=_auth(token))
        assert dash.status_code == 200, dash.text
        body = dash.json()
        assert body["next_events"], "event should appear in dashboard"
        evt = body["next_events"][0]
        # Whitelist exactly the keys we expect.
        assert set(evt.keys()) == {
            "title", "starts_at", "ends_at", "all_day",
            "occurrence_date", "color", "category",
        }, evt
        # Defensive: forbidden fields must not appear in the event JSON.
        events_json = json_module.dumps(body["next_events"])
        for forbidden in (
            "id", "family_id", "created_by_user_id", "assigned_to",
            "source_url", "source_name", "source_type",
            "subscription_id", "imported_at", "last_synced_at",
            "sync_status", "is_recurring",
        ):
            assert forbidden not in events_json, forbidden
        # And the literal source_url must NEVER appear in the response.
        assert "leak.example.com" not in dash.text


class TestDisplayTokenIsolation:
    """A display token must not unlock user-facing routes."""

    def test_display_token_rejected_on_auth_me(self):
        _, _, family_id = _seed_member_with_pat("isoAdm1", role="admin", is_adult=True)
        token = _mint_display_token(family_id, "Iso1")

        resp = client.get("/auth/me", headers=_auth(token))
        # Either 401 (display tokens are explicitly refused) or 403 — but never 200.
        assert resp.status_code in (401, 403)
        assert resp.status_code != 200

    def test_display_token_rejected_on_families_me(self):
        _, _, family_id = _seed_member_with_pat("isoAdm2", role="admin", is_adult=True)
        token = _mint_display_token(family_id, "Iso2")

        resp = client.get("/families/me", headers=_auth(token))
        assert resp.status_code in (401, 403)
        assert resp.status_code != 200

    def test_pat_rejected_on_display_endpoints(self):
        # A regular PAT must not impersonate a display device.
        admin_token, _, _ = _seed_member_with_pat(
            "patVsDisplay", role="admin", is_adult=True
        )
        resp = client.get("/display/me", headers=_auth(admin_token))
        assert resp.status_code == 401

    def test_no_token_on_display_endpoints(self):
        resp = client.get("/display/me")
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# Revocation
# ---------------------------------------------------------------------------


class TestRevocation:
    def test_revoked_token_fails_display_endpoints(self):
        admin_token, _, family_id = _seed_member_with_pat(
            "revAdm", role="admin", is_adult=True
        )
        create = client.post(
            f"/families/{family_id}/display-devices",
            json={"name": "Hallway"},
            headers=_auth(admin_token),
        )
        assert create.status_code == 200
        display_token = create.json()["token"]
        device_id = create.json()["device"]["id"]

        # Sanity: works before revoke.
        ok = client.get("/display/me", headers=_auth(display_token))
        assert ok.status_code == 200

        revoke = client.delete(
            f"/families/{family_id}/display-devices/{device_id}",
            headers=_auth(admin_token),
        )
        assert revoke.status_code == 200
        assert revoke.json()["status"] == "revoked"

        denied = client.get("/display/me", headers=_auth(display_token))
        assert denied.status_code == 401
        assert "DISPLAY_TOKEN_REVOKED" in denied.text

        # The DB row is still present (soft revoke) and surfaces a revoked_at.
        listed = client.get(
            f"/families/{family_id}/display-devices",
            headers=_auth(admin_token),
        )
        assert listed.status_code == 200
        items = listed.json()
        assert len(items) == 1
        assert items[0]["revoked_at"] is not None

    def test_revoke_unknown_device_returns_404(self):
        admin_token, _, family_id = _seed_member_with_pat(
            "rev404", role="admin", is_adult=True
        )
        resp = client.delete(
            f"/families/{family_id}/display-devices/9999",
            headers=_auth(admin_token),
        )
        assert resp.status_code == 404
        assert "DISPLAY_DEVICE_NOT_FOUND" in resp.text

    def test_revoke_other_familys_device_returns_404(self):
        # Devices are family-scoped on revoke too; you can't reach across families.
        admin_a, _, family_a = _seed_member_with_pat("revFamA", role="admin", is_adult=True)
        admin_b, _, family_b = _seed_member_with_pat("revFamB", role="admin", is_adult=True)
        create = client.post(
            f"/families/{family_a}/display-devices",
            json={"name": "FamA Display"},
            headers=_auth(admin_a),
        )
        device_id = create.json()["device"]["id"]
        # Admin B tries to revoke family A's device by addressing it under family B.
        cross = client.delete(
            f"/families/{family_b}/display-devices/{device_id}",
            headers=_auth(admin_b),
        )
        assert cross.status_code == 404
