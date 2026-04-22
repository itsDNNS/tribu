"""Integration tests for the birthdays module.

Covers the optional year field added in phase 4 of the discussion-154
feature set: creating a birthday with or without a year, persisting it
on response, rejecting out-of-range years, and patching the year
(including clearing a previously-set year with an explicit null).
"""

import hashlib

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from app.core.clock import utcnow
from app.core.contact_birthdays import backfill_contact_id_from_name_match
from app.database import Base, get_db
from app.main import app
from app.models import Contact, Family, FamilyBirthday, Membership, PersonalAccessToken, User
from app.security import hash_password, PAT_PREFIX


engine = create_engine(
    "sqlite:///./test-birthdays.db",
    connect_args={"check_same_thread": False},
)
TestSession = sessionmaker(bind=engine, autoflush=False)


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


def _seed_member(scopes: str = "birthdays:read,birthdays:write") -> tuple[str, int]:
    db = TestSession()
    try:
        user = User(email="bd@example.com", password_hash=hash_password("p"), display_name="BD")
        db.add(user)
        db.flush()
        family = Family(name="Birthday Family")
        db.add(family)
        db.flush()
        db.add(Membership(user_id=user.id, family_id=family.id, role="admin", is_adult=True))
        plain = f"{PAT_PREFIX}bd-rw"
        db.add(PersonalAccessToken(
            user_id=user.id,
            name="bd-pat",
            token_hash=hashlib.sha256(plain.encode("utf-8")).hexdigest(),
            token_lookup=hashlib.sha256(plain.encode("utf-8")).hexdigest(),
            scopes=scopes,
        ))
        db.commit()
        return plain, family.id
    finally:
        db.close()


def _auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def test_create_without_year_stores_and_returns_null():
    token, family_id = _seed_member()
    client = TestClient(app)

    resp = client.post(
        "/birthdays",
        json={"family_id": family_id, "person_name": "Unknown Aunt", "month": 7, "day": 3},
        headers=_auth_headers(token),
    )

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["year"] is None


def test_create_with_year_persists_and_returns_it():
    token, family_id = _seed_member()
    client = TestClient(app)

    resp = client.post(
        "/birthdays",
        json={"family_id": family_id, "person_name": "Oma Schmidt", "month": 4, "day": 14, "year": 1948},
        headers=_auth_headers(token),
    )

    assert resp.status_code == 200, resp.text
    assert resp.json()["year"] == 1948


def test_create_rejects_year_before_1900():
    token, family_id = _seed_member()
    client = TestClient(app)

    resp = client.post(
        "/birthdays",
        json={"family_id": family_id, "person_name": "Ancestor", "month": 1, "day": 1, "year": 1899},
        headers=_auth_headers(token),
    )

    assert resp.status_code == 400
    assert resp.json()["detail"]["code"] == "INVALID_YEAR"


def test_create_rejects_year_too_far_in_future():
    token, family_id = _seed_member()
    client = TestClient(app)

    resp = client.post(
        "/birthdays",
        json={
            "family_id": family_id,
            "person_name": "Future Baby",
            "month": 1,
            "day": 1,
            "year": utcnow().year + 5,
        },
        headers=_auth_headers(token),
    )

    assert resp.status_code == 400
    assert resp.json()["detail"]["code"] == "INVALID_YEAR"


def test_patch_sets_year_on_existing_birthday():
    token, family_id = _seed_member()
    client = TestClient(app)

    created = client.post(
        "/birthdays",
        json={"family_id": family_id, "person_name": "Onkel Karl", "month": 9, "day": 3},
        headers=_auth_headers(token),
    ).json()

    resp = client.patch(
        f"/birthdays/{created['id']}",
        json={"year": 1962},
        headers=_auth_headers(token),
    )

    assert resp.status_code == 200, resp.text
    assert resp.json()["year"] == 1962


def test_patch_clears_year_when_explicit_null_sent():
    token, family_id = _seed_member()
    client = TestClient(app)

    created = client.post(
        "/birthdays",
        json={"family_id": family_id, "person_name": "Tante", "month": 5, "day": 22, "year": 1950},
        headers=_auth_headers(token),
    ).json()

    resp = client.patch(
        f"/birthdays/{created['id']}",
        json={"year": None},
        headers=_auth_headers(token),
    )

    assert resp.status_code == 200, resp.text
    assert resp.json()["year"] is None


def test_patch_without_year_key_leaves_year_untouched():
    token, family_id = _seed_member()
    client = TestClient(app)

    created = client.post(
        "/birthdays",
        json={"family_id": family_id, "person_name": "Opa", "month": 3, "day": 11, "year": 1940},
        headers=_auth_headers(token),
    ).json()

    resp = client.patch(
        f"/birthdays/{created['id']}",
        json={"person_name": "Grandpa"},
        headers=_auth_headers(token),
    )

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["person_name"] == "Grandpa"
    assert body["year"] == 1940


def test_contact_rename_updates_same_synced_row_without_creating_duplicate():
    """Renaming a contact must rename its own synced birthday in place.

    Stable identity lives on ``FamilyBirthday.contact_id`` now, so a
    rename updates the existing row regardless of whether the old name
    still matches.
    """
    token, family_id = _seed_member(scopes="birthdays:read,birthdays:write,contacts:write")
    client = TestClient(app)

    created = client.post(
        "/contacts",
        json={"family_id": family_id, "full_name": "Alice", "birthday_month": 4, "birthday_day": 14},
        headers=_auth_headers(token),
    )
    assert created.status_code == 200, created.text
    contact_id = created.json()["id"]

    before = client.get(
        "/birthdays", params={"family_id": family_id}, headers=_auth_headers(token),
    ).json()
    assert len(before) == 1
    synced_id = before[0]["id"]
    assert before[0]["contact_id"] == contact_id

    rename = client.patch(
        f"/contacts/{contact_id}",
        json={"full_name": "Alice Smith"},
        headers=_auth_headers(token),
    )
    assert rename.status_code == 200, rename.text

    after = client.get(
        "/birthdays", params={"family_id": family_id}, headers=_auth_headers(token),
    ).json()
    assert len(after) == 1
    assert after[0]["id"] == synced_id
    assert after[0]["person_name"] == "Alice Smith"
    assert after[0]["contact_id"] == contact_id
    assert after[0]["month"] == 4
    assert after[0]["day"] == 14


def test_contact_birthday_date_change_updates_same_row_in_place():
    """Changing ``birthday_month``/``birthday_day`` on an existing contact
    must update the synced row in place — no stale leftover, no new row.
    """
    token, family_id = _seed_member(scopes="birthdays:read,birthdays:write,contacts:write")
    client = TestClient(app)

    created = client.post(
        "/contacts",
        json={"family_id": family_id, "full_name": "Alice", "birthday_month": 4, "birthday_day": 14},
        headers=_auth_headers(token),
    )
    assert created.status_code == 200, created.text
    contact_id = created.json()["id"]

    before = client.get(
        "/birthdays", params={"family_id": family_id}, headers=_auth_headers(token),
    ).json()
    assert len(before) == 1
    synced_id = before[0]["id"]
    assert before[0]["contact_id"] == contact_id
    assert (before[0]["month"], before[0]["day"]) == (4, 14)

    patch = client.patch(
        f"/contacts/{contact_id}",
        json={"birthday_month": 12, "birthday_day": 25},
        headers=_auth_headers(token),
    )
    assert patch.status_code == 200, patch.text

    after = client.get(
        "/birthdays", params={"family_id": family_id}, headers=_auth_headers(token),
    ).json()
    assert len(after) == 1, f"expected exactly one synced row, got {after}"
    assert after[0]["id"] == synced_id
    assert after[0]["contact_id"] == contact_id
    assert (after[0]["month"], after[0]["day"]) == (12, 25)
    assert after[0]["person_name"] == "Alice"


def test_manual_birthday_survives_matching_contact_create_and_delete():
    """A manual birthday that happens to match a contact must remain safe."""
    token, family_id = _seed_member(scopes="birthdays:read,birthdays:write,contacts:write")
    client = TestClient(app)

    manual = client.post(
        "/birthdays",
        json={"family_id": family_id, "person_name": "Alice", "month": 4, "day": 14, "year": 1980},
        headers=_auth_headers(token),
    ).json()
    manual_id = manual["id"]
    assert manual["contact_id"] is None

    contact = client.post(
        "/contacts",
        json={"family_id": family_id, "full_name": "Alice", "birthday_month": 4, "birthday_day": 14},
        headers=_auth_headers(token),
    ).json()
    contact_id = contact["id"]

    rows = client.get(
        "/birthdays", params={"family_id": family_id}, headers=_auth_headers(token),
    ).json()
    by_id = {r["id"]: r for r in rows}
    assert manual_id in by_id
    assert by_id[manual_id]["contact_id"] is None
    assert by_id[manual_id]["year"] == 1980
    synced = [r for r in rows if r["contact_id"] == contact_id]
    assert len(synced) == 1
    assert synced[0]["id"] != manual_id

    delete = client.delete(
        f"/contacts/{contact_id}", headers=_auth_headers(token),
    )
    assert delete.status_code == 200, delete.text

    remaining = client.get(
        "/birthdays", params={"family_id": family_id}, headers=_auth_headers(token),
    ).json()
    assert [r["id"] for r in remaining] == [manual_id]
    assert remaining[0]["year"] == 1980


def test_two_contacts_same_name_each_own_a_birthday_row():
    token, family_id = _seed_member(scopes="birthdays:read,birthdays:write,contacts:write")
    client = TestClient(app)

    a = client.post(
        "/contacts",
        json={"family_id": family_id, "full_name": "Max", "birthday_month": 9, "birthday_day": 3},
        headers=_auth_headers(token),
    ).json()
    b = client.post(
        "/contacts",
        json={"family_id": family_id, "full_name": "Max", "birthday_month": 9, "birthday_day": 3},
        headers=_auth_headers(token),
    ).json()
    assert a["id"] != b["id"]

    rows = client.get(
        "/birthdays", params={"family_id": family_id}, headers=_auth_headers(token),
    ).json()
    assert {r["contact_id"] for r in rows} == {a["id"], b["id"]}
    assert len(rows) == 2


def test_deleting_one_duplicate_name_contact_only_removes_its_own_row():
    token, family_id = _seed_member(scopes="birthdays:read,birthdays:write,contacts:write")
    client = TestClient(app)

    a = client.post(
        "/contacts",
        json={"family_id": family_id, "full_name": "Max", "birthday_month": 9, "birthday_day": 3},
        headers=_auth_headers(token),
    ).json()
    b = client.post(
        "/contacts",
        json={"family_id": family_id, "full_name": "Max", "birthday_month": 9, "birthday_day": 3},
        headers=_auth_headers(token),
    ).json()

    client.delete(f"/contacts/{a['id']}", headers=_auth_headers(token))

    remaining = client.get(
        "/birthdays", params={"family_id": family_id}, headers=_auth_headers(token),
    ).json()
    assert len(remaining) == 1
    assert remaining[0]["contact_id"] == b["id"]


def test_backfill_is_conservative_with_ambiguous_legacy_data():
    """Simulate a legacy DB: contacts + unlinked birthday rows with
    matching names and dates. The backfill must link only unambiguous
    pairs and leave ambiguous ones as ``contact_id IS NULL``.
    """
    db = TestSession()
    try:
        family = Family(name="Legacy Family")
        db.add(family)
        db.flush()
        fid = family.id

        # Unambiguous pair: one contact + one birthday with the same name/date.
        solo_contact = Contact(
            family_id=fid, full_name="Anna", birthday_month=3, birthday_day=1,
        )
        db.add(solo_contact)
        solo_row = FamilyBirthday(family_id=fid, person_name="Anna", month=3, day=1)
        db.add(solo_row)

        # Ambiguous: two contacts with identical name+date.
        db.add(Contact(family_id=fid, full_name="Max", birthday_month=9, birthday_day=3))
        db.add(Contact(family_id=fid, full_name="Max", birthday_month=9, birthday_day=3))
        ambiguous_row = FamilyBirthday(family_id=fid, person_name="Max", month=9, day=3)
        db.add(ambiguous_row)

        # Ambiguous: one contact but two candidate birthday rows.
        db.add(Contact(family_id=fid, full_name="Lena", birthday_month=6, birthday_day=10))
        dup_a = FamilyBirthday(family_id=fid, person_name="Lena", month=6, day=10)
        dup_b = FamilyBirthday(family_id=fid, person_name="Lena", month=6, day=10, year=1970)
        db.add(dup_a)
        db.add(dup_b)

        db.commit()
        solo_contact_id = solo_contact.id
        solo_row_id = solo_row.id
        ambiguous_row_id = ambiguous_row.id
        dup_a_id, dup_b_id = dup_a.id, dup_b.id
    finally:
        db.close()

    with engine.connect() as conn:
        with conn.begin():
            updated = backfill_contact_id_from_name_match(conn)

    assert updated == 1

    db = TestSession()
    try:
        linked = db.query(FamilyBirthday).filter(FamilyBirthday.id == solo_row_id).one()
        assert linked.contact_id == solo_contact_id

        untouched_ambiguous = db.query(FamilyBirthday).filter(FamilyBirthday.id == ambiguous_row_id).one()
        assert untouched_ambiguous.contact_id is None

        for rid in (dup_a_id, dup_b_id):
            row = db.query(FamilyBirthday).filter(FamilyBirthday.id == rid).one()
            assert row.contact_id is None
    finally:
        db.close()
