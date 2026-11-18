"""Integration tests for the birthdays module.

Covers the optional year field added in phase 4 of the discussion-154
feature set: creating a birthday with or without a year, persisting it
on response, rejecting out-of-range years, and patching the year
(including clearing a previously-set year with an explicit null).
"""

import pytest
from fastapi.testclient import TestClient

from app.core.clock import utcnow
from app.core.contact_birthdays import backfill_contact_id_from_name_match
from app.main import app
from app.models import Contact, Family, FamilyBirthday
from tests.support import TestSession, auth, engine, seed_member


pytestmark = pytest.mark.usefixtures("app_db")

client = TestClient(app)


def _seed_member(scopes: str = "birthdays:read,birthdays:write") -> tuple[str, int]:
    member = seed_member(scopes=scopes, family_name="Birthday Family", display_name="BD")
    return member.token, member.family_id


def test_create_without_year_stores_and_returns_null():
    token, family_id = _seed_member()

    resp = client.post(
        "/birthdays",
        json={"family_id": family_id, "person_name": "Unknown Aunt", "month": 7, "day": 3},
        headers=auth(token),
    )

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["year"] is None


def test_create_with_year_persists_and_returns_it():
    token, family_id = _seed_member()

    resp = client.post(
        "/birthdays",
        json={"family_id": family_id, "person_name": "Oma Schmidt", "month": 4, "day": 14, "year": 1948},
        headers=auth(token),
    )

    assert resp.status_code == 200, resp.text
    assert resp.json()["year"] == 1948


@pytest.mark.parametrize(
    ("person_name", "year"),
    [("Ancestor", 1899), ("Future Baby", utcnow().year + 5)],
    ids=["before_1900", "too_far_in_future"],
)
def test_create_rejects_year(person_name: str, year: int):
    token, family_id = _seed_member()

    resp = client.post(
        "/birthdays",
        json={"family_id": family_id, "person_name": person_name, "month": 1, "day": 1, "year": year},
        headers=auth(token),
    )

    assert resp.status_code == 400
    assert resp.json()["detail"]["code"] == "INVALID_YEAR"


def test_patch_sets_year_on_existing_birthday():
    token, family_id = _seed_member()

    created = client.post(
        "/birthdays",
        json={"family_id": family_id, "person_name": "Onkel Karl", "month": 9, "day": 3},
        headers=auth(token),
    ).json()

    resp = client.patch(
        f"/birthdays/{created['id']}",
        json={"year": 1962},
        headers=auth(token),
    )

    assert resp.status_code == 200, resp.text
    assert resp.json()["year"] == 1962


def test_patch_clears_year_when_explicit_null_sent():
    token, family_id = _seed_member()

    created = client.post(
        "/birthdays",
        json={"family_id": family_id, "person_name": "Tante", "month": 5, "day": 22, "year": 1950},
        headers=auth(token),
    ).json()

    resp = client.patch(
        f"/birthdays/{created['id']}",
        json={"year": None},
        headers=auth(token),
    )

    assert resp.status_code == 200, resp.text
    assert resp.json()["year"] is None


def test_patch_without_year_key_leaves_year_untouched():
    token, family_id = _seed_member()

    created = client.post(
        "/birthdays",
        json={"family_id": family_id, "person_name": "Opa", "month": 3, "day": 11, "year": 1940},
        headers=auth(token),
    ).json()

    resp = client.patch(
        f"/birthdays/{created['id']}",
        json={"person_name": "Grandpa"},
        headers=auth(token),
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

    created = client.post(
        "/contacts",
        json={"family_id": family_id, "full_name": "Alice", "birthday_month": 4, "birthday_day": 14},
        headers=auth(token),
    )
    assert created.status_code == 200, created.text
    contact_id = created.json()["id"]

    before = client.get(
        "/birthdays", params={"family_id": family_id}, headers=auth(token),
    ).json()
    assert len(before) == 1
    synced_id = before[0]["id"]
    assert before[0]["contact_id"] == contact_id

    rename = client.patch(
        f"/contacts/{contact_id}",
        json={"full_name": "Alice Smith"},
        headers=auth(token),
    )
    assert rename.status_code == 200, rename.text

    after = client.get(
        "/birthdays", params={"family_id": family_id}, headers=auth(token),
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

    created = client.post(
        "/contacts",
        json={"family_id": family_id, "full_name": "Alice", "birthday_month": 4, "birthday_day": 14},
        headers=auth(token),
    )
    assert created.status_code == 200, created.text
    contact_id = created.json()["id"]

    before = client.get(
        "/birthdays", params={"family_id": family_id}, headers=auth(token),
    ).json()
    assert len(before) == 1
    synced_id = before[0]["id"]
    assert before[0]["contact_id"] == contact_id
    assert (before[0]["month"], before[0]["day"]) == (4, 14)

    patch = client.patch(
        f"/contacts/{contact_id}",
        json={"birthday_month": 12, "birthday_day": 25},
        headers=auth(token),
    )
    assert patch.status_code == 200, patch.text

    after = client.get(
        "/birthdays", params={"family_id": family_id}, headers=auth(token),
    ).json()
    assert len(after) == 1, f"expected exactly one synced row, got {after}"
    assert after[0]["id"] == synced_id
    assert after[0]["contact_id"] == contact_id
    assert (after[0]["month"], after[0]["day"]) == (12, 25)
    assert after[0]["person_name"] == "Alice"


def test_manual_birthday_survives_matching_contact_create_and_delete():
    """A birthday added on its own becomes a contact; another contact with
    the same name and date is a different person and leaves it alone."""
    token, family_id = _seed_member(scopes="birthdays:read,birthdays:write,contacts:write")

    manual = client.post(
        "/birthdays",
        json={"family_id": family_id, "person_name": "Alice", "month": 4, "day": 14, "year": 1980},
        headers=auth(token),
    ).json()
    manual_id = manual["id"]
    manual_contact = manual["contact_id"]
    assert manual_contact is not None

    contact = client.post(
        "/contacts",
        json={"family_id": family_id, "full_name": "Alice", "birthday_month": 4, "birthday_day": 14},
        headers=auth(token),
    ).json()
    contact_id = contact["id"]

    rows = client.get(
        "/birthdays", params={"family_id": family_id}, headers=auth(token),
    ).json()
    by_id = {r["id"]: r for r in rows}
    assert manual_id in by_id
    assert by_id[manual_id]["contact_id"] == manual_contact
    assert by_id[manual_id]["year"] == 1980
    synced = [r for r in rows if r["contact_id"] == contact_id]
    assert len(synced) == 1
    assert synced[0]["id"] != manual_id

    delete = client.delete(
        f"/contacts/{contact_id}", headers=auth(token),
    )
    assert delete.status_code == 200, delete.text

    remaining = client.get(
        "/birthdays", params={"family_id": family_id}, headers=auth(token),
    ).json()
    assert [r["id"] for r in remaining] == [manual_id]
    assert remaining[0]["year"] == 1980


def test_two_contacts_same_name_each_own_a_birthday_row():
    token, family_id = _seed_member(scopes="birthdays:read,birthdays:write,contacts:write")

    a = client.post(
        "/contacts",
        json={"family_id": family_id, "full_name": "Max", "birthday_month": 9, "birthday_day": 3},
        headers=auth(token),
    ).json()
    b = client.post(
        "/contacts",
        json={"family_id": family_id, "full_name": "Max", "birthday_month": 9, "birthday_day": 3},
        headers=auth(token),
    ).json()
    assert a["id"] != b["id"]

    rows = client.get(
        "/birthdays", params={"family_id": family_id}, headers=auth(token),
    ).json()
    assert {r["contact_id"] for r in rows} == {a["id"], b["id"]}
    assert len(rows) == 2


def test_deleting_one_duplicate_name_contact_only_removes_its_own_row():
    token, family_id = _seed_member(scopes="birthdays:read,birthdays:write,contacts:write")

    a = client.post(
        "/contacts",
        json={"family_id": family_id, "full_name": "Max", "birthday_month": 9, "birthday_day": 3},
        headers=auth(token),
    ).json()
    b = client.post(
        "/contacts",
        json={"family_id": family_id, "full_name": "Max", "birthday_month": 9, "birthday_day": 3},
        headers=auth(token),
    ).json()

    client.delete(f"/contacts/{a['id']}", headers=auth(token))

    remaining = client.get(
        "/birthdays", params={"family_id": family_id}, headers=auth(token),
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
