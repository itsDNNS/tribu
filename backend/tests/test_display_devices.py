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
from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import sessionmaker

from app.database import Base, get_db
from app.main import app
from app.models import Family, Membership, PersonalAccessToken, SchoolTimetable, SchoolTimetableAssignment, SchoolTimetableLesson, SchoolTimetablePeriod, User
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
    profile_image: str | None = None,
    color: str | None = None,
) -> tuple[str, int, int]:
    """Seed a user + family + membership + PAT. Returns (token, user_id, family_id)."""
    db = TestSession()
    user = User(
        email=email or f"display-{suffix}@example.com",
        password_hash=hash_password("password"),
        display_name=f"User {suffix}",
        profile_image=profile_image,
    )
    db.add(user)
    db.flush()

    if family_id is None:
        family = Family(name=f"Family {suffix}")
        db.add(family)
        db.flush()
        family_id = int(family.id)
    assert family_id is not None

    db.add(Membership(user_id=user.id, family_id=family_id, role=role, is_adult=is_adult, color=color))

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

    def test_display_dashboard_member_fields_are_display_safe_with_avatar(self):
        """Only display_name + color + profile_image. No user_id, is_adult, role, email."""
        avatar = "data:image/png;base64,iVBORw0KGgo="
        admin_token, _, family_id = _seed_member_with_pat(
            "minAdmin", role="admin", is_adult=True, profile_image=avatar
        )
        _seed_member_with_pat(
            "minKid", role="member", is_adult=False, family_id=family_id
        )
        _seed_member_with_pat(
            "badAvatar",
            role="member",
            is_adult=False,
            family_id=family_id,
            profile_image="data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
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
            assert set(m.keys()) == {"display_name", "color", "profile_image"}, m
        assert any(m["profile_image"] == avatar for m in body["members"])
        assert any(m["profile_image"] is None for m in body["members"])
        assert "image/svg+xml" not in dash.text
        # Defensive: even if a future serializer leaks, the field
        # NAMES themselves must not appear in the JSON for a member.
        members_json = json_module.dumps(body["members"])
        for forbidden in ("user_id", "is_adult", "role", "email"):
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
            icon="soccer",
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
            "occurrence_date", "color", "category", "icon", "participant_colors",
            "member_refs", "location",
        }, evt
        assert evt["icon"] == "soccer"
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

    def test_display_dashboard_event_participant_colors_are_display_safe(self):
        """Expose only participant colors for assigned events, never user identifiers."""
        admin_token, admin_user_id, family_id = _seed_member_with_pat(
            "participantAdmin", role="admin", is_adult=True, color="#7c3aed"
        )
        _, kid_user_id, _ = _seed_member_with_pat(
            "participantKid",
            role="member",
            is_adult=False,
            family_id=family_id,
            color="#f43f5e",
        )
        _, invalid_color_user_id, _ = _seed_member_with_pat(
            "participantBadColor",
            role="member",
            is_adult=False,
            family_id=family_id,
            color="url(https://example.com/bad)",
        )
        _, outsider_user_id, _ = _seed_member_with_pat(
            "participantOutsider", role="member", is_adult=False, color="#10b981"
        )

        from datetime import datetime, timedelta, timezone
        from app.models import CalendarEvent

        db = TestSession()
        future = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(days=1)
        db.add(CalendarEvent(
            family_id=family_id,
            title="Two kids practice",
            starts_at=future,
            ends_at=future + timedelta(hours=1),
            all_day=False,
            assigned_to=[admin_user_id, kid_user_id, invalid_color_user_id, outsider_user_id, 999999],
        ))
        db.add(CalendarEvent(
            family_id=family_id,
            title="Family dinner",
            starts_at=future + timedelta(hours=2),
            ends_at=future + timedelta(hours=3),
            all_day=False,
            assigned_to="all",
        ))
        db.add(CalendarEvent(
            family_id=family_id,
            title="General reminder",
            starts_at=future + timedelta(hours=4),
            ends_at=future + timedelta(hours=5),
            all_day=False,
            assigned_to=None,
        ))
        db.commit()
        db.close()

        resp = client.post(
            f"/families/{family_id}/display-devices",
            json={"name": "Kitchen"},
            headers=_auth(admin_token),
        )
        token = resp.json()["token"]

        dash = client.get("/display/dashboard", headers=_auth(token))
        assert dash.status_code == 200, dash.text
        events = {event["title"]: event for event in dash.json()["next_events"]}

        assert events["Two kids practice"]["participant_colors"] == ["#7c3aed", "#f43f5e"]
        assert events["Family dinner"]["participant_colors"] == ["#7c3aed", "#f43f5e"]
        assert events["General reminder"]["participant_colors"] == []

        events_json = json_module.dumps(dash.json()["next_events"])
        assert "assigned_to" not in events_json
        assert "user_id" not in events_json
        assert "#10b981" not in events_json
        assert "url(https://example.com/bad)" not in events_json


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


class TestStageLayoutConfig:
    """Every display uses the rotating stage layout; configs are normalized server-side."""

    def test_new_device_gets_the_default_stage_layout(self):
        admin_token, _, family_id = _seed_member_with_pat("stageDefault", role="admin", is_adult=True)
        resp = client.post(f"/families/{family_id}/display-devices", json={"name": "Kitchen"}, headers=_auth(admin_token))
        assert resp.status_code == 200, resp.text
        device = resp.json()["device"]
        assert device["layout_preset"] == "stage"
        assert device["refresh_interval_seconds"] == 60
        layout = device["layout_config"]
        assert layout["version"] == 2
        assert layout["zones"]["a"] == {"cards": ["dinner", "shopping", "weather"], "interval_seconds": 60}
        assert layout["zones"]["d"]["cards"] == ["people", "week"]
        assert layout["stagger"] is True and layout["skip_empty"] is True
        assert layout["day_parts"]["evening_start"] == "18:00"
        assert layout["language"] == "auto"

    def test_admin_config_is_bounded_and_whitelisted(self):
        admin_token, _, family_id = _seed_member_with_pat("stageBounds", role="admin", is_adult=True)
        resp = client.post(
            f"/families/{family_id}/display-devices",
            json={
                "name": "Hall",
                "display_mode": "eink",
                "refresh_interval_seconds": 60,
                "layout_preset": "hearth",
                "layout_config": {
                    "version": 2,
                    "zones": {
                        # Unknown, duplicate and wide-only cards are dropped from side zones.
                        "a": {"cards": ["weather", "weather", "iframe", "people", "stars"], "interval_seconds": 5},
                        # Side cards cannot move into the wide bottom zone.
                        "d": {"cards": ["dinner"], "interval_seconds": 9999},
                        "b": "not-a-zone",
                    },
                    "stagger": False,
                    "skip_empty": "yes",
                    "day_parts": {"morning_start": "06:15", "evening_start": "25:00"},
                    "eink_format": "large",
                    "language": "<script>",
                },
            },
            headers=_auth(admin_token),
        )
        assert resp.status_code == 200, resp.text
        device = resp.json()["device"]
        assert device["display_mode"] == "eink"
        assert device["refresh_interval_seconds"] == 300
        assert device["layout_preset"] == "stage"
        layout = device["layout_config"]
        assert layout["zones"]["a"] == {"cards": ["weather", "stars"], "interval_seconds": 15}
        assert layout["zones"]["b"]["cards"] == ["reminders", "school"]
        assert layout["zones"]["d"] == {"cards": ["people", "week"], "interval_seconds": 600}
        assert layout["stagger"] is False
        assert layout["skip_empty"] is True
        assert layout["day_parts"]["morning_start"] == "06:15"
        assert layout["day_parts"]["evening_start"] == "18:00"
        assert layout["eink_format"] == "large"
        assert layout["language"] == "auto"

    def test_retired_grid_layouts_reset_to_the_stage_default(self):
        admin_token, _, family_id = _seed_member_with_pat("stageLegacy", role="admin", is_adult=True)
        resp = client.post(
            f"/families/{family_id}/display-devices",
            json={
                "name": "Legacy",
                "layout_preset": "family_board",
                "layout_config": {"columns": 3, "rows": 3, "widgets": [{"type": "agenda", "x": 0, "y": 0, "w": 3, "h": 3}]},
            },
            headers=_auth(admin_token),
        )
        assert resp.status_code == 200, resp.text
        layout = resp.json()["device"]["layout_config"]
        assert "widgets" not in layout
        assert layout["zones"]["c"]["cards"] == ["soon", "stars"]

    def test_admin_can_update_display_config_without_reminting_token(self):
        admin_token, _, family_id = _seed_member_with_pat("cfgUpdate", role="admin", is_adult=True)
        create = client.post(f"/families/{family_id}/display-devices", json={"name": "Wall"}, headers=_auth(admin_token))
        body = create.json()
        token = body["token"]
        device_id = body["device"]["id"]

        update = client.patch(
            f"/families/{family_id}/display-devices/{device_id}",
            json={"layout_config": {"version": 2, "zones": {"c": {"cards": ["birthdays"], "interval_seconds": 120}}}},
            headers=_auth(admin_token),
        )
        assert update.status_code == 200, update.text
        assert "token" not in update.json()

        # Switching the mode keeps the stored rotation.
        mode = client.patch(
            f"/families/{family_id}/display-devices/{device_id}",
            json={"display_mode": "eink", "refresh_interval_seconds": 900},
            headers=_auth(admin_token),
        )
        assert mode.status_code == 200, mode.text

        dash = client.get("/display/dashboard", headers=_auth(token))
        assert dash.status_code == 200
        config = dash.json()["config"]
        assert config["display_mode"] == "eink"
        assert config["refresh_interval_seconds"] == 900
        assert config["layout_config"]["zones"]["c"] == {"cards": ["birthdays"], "interval_seconds": 120}
        assert "email" not in dash.text

    def test_non_admin_cannot_update_display_config(self):
        admin_token, _, family_id = _seed_member_with_pat("cfgAdmin", role="admin", is_adult=True)
        member_token, _, _ = _seed_member_with_pat("cfgMember", role="member", is_adult=True, family_id=family_id)
        create = client.post(f"/families/{family_id}/display-devices", json={"name": "Wall"}, headers=_auth(admin_token))
        device_id = create.json()["device"]["id"]
        update = client.patch(
            f"/families/{family_id}/display-devices/{device_id}",
            json={"display_mode": "eink"},
            headers=_auth(member_token),
        )
        assert update.status_code == 403


# ---------------------------------------------------------------------------
# School timetables
# ---------------------------------------------------------------------------


def _seed_child(family_id: int, suffix: str, *, color: str | None = None) -> int:
    db = TestSession()
    child = User(
        email=f"school-child-{suffix}@example.com",
        password_hash=hash_password("password"),
        display_name=f"Child {suffix}",
    )
    db.add(child)
    db.flush()
    db.add(Membership(user_id=child.id, family_id=family_id, role="member", is_adult=False, color=color))
    child_id = child.id
    db.commit()
    db.close()
    return child_id


def _school_payload(family_id: int, child_ids: list[int], *, include_saturday: bool = False) -> dict:
    return {
        "family_id": family_id,
        "name": "Class 4b",
        "class_label": "4b",
        "include_saturday": include_saturday,
        "assigned_member_user_ids": child_ids,
        "periods": [
            {"position": 1, "label": "1", "start_time": "08:00", "end_time": "08:45", "kind": "lesson"},
            {"position": 2, "label": "Break", "start_time": "08:45", "end_time": "09:00", "kind": "break", "break_label": "Big break"},
            {"position": 3, "label": "2", "start_time": "09:00", "end_time": "09:45", "kind": "lesson"},
        ],
        "lessons": [
            {"weekday": weekday, "period_position": 1, "subject": "Math", "room": "A1", "teacher": "Ms Ada"}
            for weekday in range(1, 7 if include_saturday else 6)
        ],
    }


class TestSchoolTimetables:
    def test_adult_can_create_shared_class_timetable_for_twins(self):
        admin_token, _, family_id = _seed_member_with_pat(
            "schoolAdmin", role="admin", is_adult=True, scopes="school_timetables:read,school_timetables:write"
        )
        child_a = _seed_child(family_id, "A", color="#7c3aed")
        child_b = _seed_child(family_id, "B", color="#f43f5e")

        resp = client.post(
            "/school-timetables",
            json=_school_payload(family_id, [child_a, child_b]),
            headers=_auth(admin_token),
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["class_label"] == "4b"
        assert body["assigned_member_user_ids"] == [child_a, child_b]
        assert [m["display_name"] for m in body["assigned_members"]] == ["Child A", "Child B"]
        assert [p["kind"] for p in body["periods"]] == ["lesson", "break", "lesson"]

        listed = client.get(f"/school-timetables?family_id={family_id}", headers=_auth(admin_token))
        assert listed.status_code == 200, listed.text
        assert listed.json()[0]["lessons"][0]["subject"] == "Math"

    def test_list_avoids_cartesian_join_for_assigned_member_avatars(self):
        admin_token, _, family_id = _seed_member_with_pat(
            "schoolAvatarAdmin", role="admin", is_adult=True, scopes="school_timetables:read,school_timetables:write"
        )
        child_a = _seed_child(family_id, "AvatarA", color="#7c3aed")
        child_b = _seed_child(family_id, "AvatarB", color="#f43f5e")
        avatar = "data:image/png;base64,iVBORw0KGgo="
        db = TestSession()
        try:
            db.query(User).filter(User.id == child_a).update({User.profile_image: avatar})
            db.commit()
        finally:
            db.close()

        created = client.post(
            "/school-timetables",
            json=_school_payload(family_id, [child_a, child_b], include_saturday=True),
            headers=_auth(admin_token),
        )
        assert created.status_code == 200, created.text

        statements: list[str] = []

        def capture_statement(_conn, _cursor, statement, _parameters, _context, _executemany):
            statements.append(" ".join(statement.lower().split()))

        event.listen(engine, "before_cursor_execute", capture_statement)
        try:
            listed = client.get(f"/school-timetables?family_id={family_id}", headers=_auth(admin_token))
        finally:
            event.remove(engine, "before_cursor_execute", capture_statement)

        assert listed.status_code == 200, listed.text
        body = listed.json()[0]
        profile_images = {member["display_name"]: member["profile_image"] for member in body["assigned_members"]}
        assert profile_images["Child AvatarA"] == avatar
        assert body["lessons"][0]["subject"] == "Math"
        assert not any(
            "join school_timetable_periods" in statement
            and "join school_timetable_lessons" in statement
            and "join users" in statement
            for statement in statements
        ), statements

    def test_list_skips_legacy_lessons_without_period_rows(self):
        admin_token, _, family_id = _seed_member_with_pat(
            "schoolLegacyLesson", role="admin", is_adult=True, scopes="school_timetables:read,school_timetables:write"
        )
        child_id = _seed_child(family_id, "Legacy")

        created = client.post(
            "/school-timetables",
            json=_school_payload(family_id, [child_id]),
            headers=_auth(admin_token),
        )
        assert created.status_code == 200, created.text
        lesson_id = created.json()["lessons"][0]["id"]

        db = TestSession()
        try:
            db.execute(text("PRAGMA foreign_keys=OFF"))
            db.execute(
                text("UPDATE school_timetable_lessons SET period_id = :period_id WHERE id = :lesson_id"),
                {"period_id": 999_999, "lesson_id": lesson_id},
            )
            db.commit()
            db.execute(text("PRAGMA foreign_keys=ON"))
        finally:
            db.close()

        listed = client.get(f"/school-timetables?family_id={family_id}", headers=_auth(admin_token))
        assert listed.status_code == 200, listed.text
        assert all(lesson["period_id"] != 999_999 for lesson in listed.json()[0]["lessons"])

    def test_rejects_adult_members_as_child_assignments(self):
        admin_token, admin_user_id, family_id = _seed_member_with_pat(
            "schoolAdultAssignment", role="admin", is_adult=True, scopes="school_timetables:write"
        )
        payload = _school_payload(family_id, [admin_user_id])

        resp = client.post("/school-timetables", json=payload, headers=_auth(admin_token))
        assert resp.status_code == 400
        assert "child family members" in resp.text

    def test_saturday_lessons_require_opt_in(self):
        admin_token, _, family_id = _seed_member_with_pat(
            "schoolSaturday", role="admin", is_adult=True, scopes="school_timetables:write"
        )
        child_id = _seed_child(family_id, "Saturday")
        payload = _school_payload(family_id, [child_id])
        payload["lessons"].append({"weekday": 6, "period_position": 1, "subject": "Club"})

        resp = client.post("/school-timetables", json=payload, headers=_auth(admin_token))
        assert resp.status_code == 400
        assert "Saturday" in resp.text

    def test_display_dashboard_includes_today_school_timetable_without_ids(self, monkeypatch):
        import app.modules.display_router as display_router
        from datetime import date

        monkeypatch.setattr(display_router, "local_today", lambda: date(2026, 4, 27))

        admin_token, _, family_id = _seed_member_with_pat("schoolDisplay", role="admin", is_adult=True)
        child_a = _seed_child(family_id, "TwinA", color="#7c3aed")
        child_b = _seed_child(family_id, "TwinB", color="#f43f5e")
        create = client.post(
            "/school-timetables",
            json=_school_payload(family_id, [child_a, child_b], include_saturday=True),
            headers=_auth(admin_token),
        )
        assert create.status_code == 200, create.text
        token = _mint_display_token(family_id, "Kitchen School")

        resp = client.get("/display/dashboard", headers=_auth(token))
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert "today_school_timetables" in body
        rendered = json_module.dumps(body["today_school_timetables"])
        assert "Child TwinA" in rendered
        assert "Child TwinB" in rendered
        assert "Math" in rendered
        assert "Ms Ada" not in rendered
        assert "A1" not in rendered
        assert str(child_a) not in rendered
        assert "@example.com" not in rendered


# ---------------------------------------------------------------------------
# Stage dashboard data (Home Family Display 2.0)
# ---------------------------------------------------------------------------


def _seed_stage_family(suffix: str):
    """A family with events, meals, shopping, routines, tasks and rewards around today."""
    from datetime import datetime, time as dtime, timedelta, timezone
    from app.core.clock import local_today
    from app.models import (
        CalendarEvent, MealPlan, Reward, RewardCurrency, ShoppingItem, ShoppingList, Task, TokenTransaction,
    )

    admin_token, admin_id, family_id = _seed_member_with_pat(f"stage{suffix}", role="admin", is_adult=True)
    child_id = _seed_child(family_id, f"Stage{suffix}", color="#c26f80")
    today = local_today()
    at = lambda day, hour, minute=0: datetime.combine(day, dtime(hour, minute))
    tomorrow = today + timedelta(days=1)

    db = TestSession()
    db.add_all([
        CalendarEvent(family_id=family_id, title="Swimming", starts_at=at(today, 15), ends_at=at(today, 16),
                      assigned_to=[child_id], location="Pool", created_by_user_id=admin_id),
        CalendarEvent(family_id=family_id, title="Zoo trip", starts_at=at(tomorrow, 7, 15), ends_at=at(tomorrow, 14),
                      assigned_to="all", created_by_user_id=admin_id),
        CalendarEvent(family_id=family_id, title="Autumn break", starts_at=at(today + timedelta(days=10), 0),
                      ends_at=at(today + timedelta(days=15), 0), all_day=True, created_by_user_id=admin_id),
        CalendarEvent(family_id=family_id, title="Far away", starts_at=at(today + timedelta(days=90), 0),
                      all_day=True, created_by_user_id=admin_id),
        MealPlan(family_id=family_id, plan_date=today, slot="evening", meal_name="Pumpkin soup"),
        MealPlan(family_id=family_id, plan_date=today, slot="morning", meal_name="Porridge"),
        MealPlan(family_id=family_id, plan_date=tomorrow, slot="noon", meal_name="Pasta"),
        MealPlan(family_id=family_id, plan_date=today + timedelta(days=2), slot="noon", meal_name="Too late"),
    ])
    shopping = ShoppingList(family_id=family_id, name="Groceries")
    db.add(shopping)
    db.flush()
    db.add_all([
        ShoppingItem(list_id=shopping.id, name="Bread", position=2),
        ShoppingItem(list_id=shopping.id, name="Milk", position=1),
        ShoppingItem(list_id=shopping.id, name="Eggs", position=3, checked=True),
        ShoppingItem(list_id=shopping.id, name="Old", position=4, archived=True),
    ])
    now_utc = datetime.now(timezone.utc).replace(tzinfo=None)
    db.add_all([
        Task(family_id=family_id, title="Brush teeth", recurrence="daily", due_date=at(today, 7),
             assigned_to_user_id=child_id, created_by_user_id=admin_id),
        Task(family_id=family_id, title="Pack bag", recurrence="daily", status="done", due_date=at(today, 7),
             completed_at=now_utc, assigned_to_user_id=child_id, created_by_user_id=admin_id),
        Task(family_id=family_id, title="Old routine", recurrence="daily", status="done", due_date=at(today, 7),
             completed_at=now_utc - timedelta(days=2), created_by_user_id=admin_id),
        Task(family_id=family_id, title="Bins out", due_date=at(today, 20), created_by_user_id=admin_id),
        Task(family_id=family_id, title="Sign letter", due_date=at(today - timedelta(days=1), 9), created_by_user_id=admin_id),
        Task(family_id=family_id, title="Call plumber", due_date=at(tomorrow, 9), created_by_user_id=admin_id),
        Task(family_id=family_id, title="Later", due_date=at(today + timedelta(days=3), 9), created_by_user_id=admin_id),
    ])
    currency = RewardCurrency(family_id=family_id, name="Stars", icon="star")
    db.add(currency)
    db.flush()
    db.add_all([
        Reward(family_id=family_id, currency_id=currency.id, name="Ice cream", cost=10),
        Reward(family_id=family_id, currency_id=currency.id, name="Cinema", cost=50),
        TokenTransaction(family_id=family_id, currency_id=currency.id, user_id=child_id, kind="earn", amount=12),
    ])
    db.commit()
    db.close()
    return admin_token, family_id, child_id


class TestStageDashboardData:
    def test_dashboard_contains_the_stage_cards_without_identifiers(self):
        _, family_id, child_id = _seed_stage_family("Data")
        token = _mint_display_token(family_id, "Stage Data")
        resp = client.get("/display/dashboard", headers=_auth(token))
        assert resp.status_code == 200, resp.text
        body = resp.json()
        names = [member["display_name"] for member in body["members"]]
        child_ref = names.index("Child StageData")

        assert body["generated_at"]
        assert body["time_format"] == "24h"
        swim = next(event for event in body["today_events"] if event["title"] == "Swimming")
        assert swim["member_refs"] == [child_ref]
        assert swim["location"] == "Pool"
        zoo = next(event for event in body["tomorrow_events"] if event["title"] == "Zoo trip")
        assert zoo["member_refs"] == list(range(len(names)))
        assert any(event["title"] == "Swimming" for event in body["week_events"])

        assert [(meal["slot"], meal["meal_name"]) for meal in body["meals"]] == [
            ("morning", "Porridge"), ("evening", "Pumpkin soup"), ("noon", "Pasta"),
        ]
        assert body["shopping"] == {"open_count": 2, "lists": [{"name": "Groceries", "open_count": 2, "items": ["Milk", "Bread"]}]}

        routines = {routine["title"]: routine for routine in body["routines"]}
        assert set(routines) == {"Brush teeth", "Pack bag"}
        assert routines["Brush teeth"] == {"title": "Brush teeth", "done": False, "member_ref": child_ref}
        assert routines["Pack bag"]["done"] is True

        due = {task["title"]: task["due_state"] for task in body["due_tasks"]}
        assert due == {"Sign letter": "overdue", "Bins out": "today", "Call plumber": "tomorrow"}

        rewards = body["rewards"]
        assert rewards["currency_name"] == "Stars"
        assert rewards["members"] == [
            {"member_ref": child_ref, "balance": 12, "next_reward_name": "Cinema", "next_reward_cost": 50},
        ]
        assert body["countdowns"] == [
            {"title": "Autumn break", "starts_on": body["countdowns"][0]["starts_on"], "days_until": 10},
        ]
        assert body["weather"] is None

        rendered = resp.text
        assert "@example.com" not in rendered
        assert f'"user_id"' not in rendered
        assert str(child_id) not in json_module.dumps(body["routines"])


def _forecast_payload():
    hours = [f"2026-09-29T{hour:02d}:00" for hour in range(24)] + [f"2026-09-30T{hour:02d}:00" for hour in range(24)]
    return {
        "current": {"time": "2026-09-29T07:15", "temperature_2m": 11.6, "weather_code": 2, "is_day": 0},
        "hourly": {
            "time": hours,
            "temperature_2m": [12.0] * 48,
            "weather_code": [2] * 48,
            "precipitation_probability": [10] * 16 + [70] * 32,
        },
        "daily": {
            "time": ["2026-09-29", "2026-09-30"],
            "weather_code": [61, 3],
            "temperature_2m_max": [19.4, 15.2],
            "temperature_2m_min": [8.6, 7.9],
            "precipitation_probability_max": [70, 20],
        },
    }


class TestDisplayWeather:
    @pytest.fixture(autouse=True)
    def _fresh_cache(self):
        from app.core import weather
        weather.clear_cache()
        yield
        weather.clear_cache()

    def test_admin_sets_place_and_display_shows_forecast(self, monkeypatch):
        from app.core import weather
        calls = []

        def fake_fetch(url, params):
            calls.append((url, params))
            return _forecast_payload()

        monkeypatch.setattr(weather, "_fetch_json", fake_fetch)
        admin_token, _, family_id = _seed_member_with_pat("wxSet", role="admin", is_adult=True)
        put = client.put(
            f"/families/{family_id}/weather-location",
            json={"name": "Hamburg", "latitude": 53.55, "longitude": 9.99},
            headers=_auth(admin_token),
        )
        assert put.status_code == 200, put.text
        assert client.get(f"/families/{family_id}/weather-location", headers=_auth(admin_token)).json()["name"] == "Hamburg"

        token = _mint_display_token(family_id, "Weather Wall")
        first = client.get("/display/dashboard", headers=_auth(token)).json()["weather"]
        second = client.get("/display/dashboard", headers=_auth(token)).json()["weather"]
        assert first == second
        assert len(calls) == 1, "forecast must be cached between display refreshes"
        assert calls[0][1]["latitude"] == "53.5500"
        assert first["location_name"] == "Hamburg"
        assert first["current_temperature"] == 12
        assert first["current_is_day"] is False
        assert first["today"] == {"date": "2026-09-29", "code": 61, "min": 9, "max": 19, "precipitation_probability": 70}
        assert first["rain_from"] == "16:00"
        assert first["hourly"][0]["time"] == "2026-09-29T07:00"
        assert len(first["hourly"]) == 16

        cleared = client.delete(f"/families/{family_id}/weather-location", headers=_auth(admin_token))
        assert cleared.json() == {"name": None, "latitude": None, "longitude": None}
        assert client.get("/display/dashboard", headers=_auth(token)).json()["weather"] is None

    def test_forecast_failure_keeps_the_display_working(self, monkeypatch):
        from app.core import weather

        def broken(url, params):
            raise OSError("offline")

        monkeypatch.setattr(weather, "_fetch_json", broken)
        admin_token, _, family_id = _seed_member_with_pat("wxFail", role="admin", is_adult=True)
        client.put(
            f"/families/{family_id}/weather-location",
            json={"name": "Nowhere", "latitude": 1, "longitude": 2},
            headers=_auth(admin_token),
        )
        token = _mint_display_token(family_id, "Offline Wall")
        resp = client.get("/display/dashboard", headers=_auth(token))
        assert resp.status_code == 200
        assert resp.json()["weather"] is None

    def test_place_search_is_admin_only_and_reports_geocoder_errors(self, monkeypatch):
        from app.core import weather

        monkeypatch.setattr(weather, "_fetch_json", lambda url, params: {"results": [
            {"name": "Hamburg", "admin1": "Hamburg", "country": "Germany", "latitude": 53.55, "longitude": 9.99},
            {"name": "Broken", "latitude": None, "longitude": 1},
        ]})
        admin_token, _, family_id = _seed_member_with_pat("wxSearch", role="admin", is_adult=True)
        member_token, _, _ = _seed_member_with_pat("wxSearchMember", role="member", is_adult=True, family_id=family_id)
        found = client.get(f"/families/{family_id}/weather-location/search?q=Hamb&lang=de", headers=_auth(admin_token))
        assert found.status_code == 200, found.text
        assert found.json() == [{"name": "Hamburg", "region": "Hamburg", "country": "Germany", "latitude": 53.55, "longitude": 9.99}]
        assert client.get(f"/families/{family_id}/weather-location/search?q=Hamb", headers=_auth(member_token)).status_code == 403
        assert client.put(
            f"/families/{family_id}/weather-location",
            json={"name": "X", "latitude": 99, "longitude": 0},
            headers=_auth(admin_token),
        ).status_code == 422

        def broken(url, params):
            raise OSError("down")

        monkeypatch.setattr(weather, "_fetch_json", broken)
        failed = client.get(f"/families/{family_id}/weather-location/search?q=Hamb", headers=_auth(admin_token))
        assert failed.status_code == 502
        assert failed.json()["detail"]["code"] == "WEATHER_SEARCH_UNAVAILABLE"
