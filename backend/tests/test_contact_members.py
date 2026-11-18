"""A contact can be a family member: the phone's "Hannelore Müller" is
Hannelore in Tribu. Members' own birthdays are in the birthday list too."""
from datetime import date

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models import FamilyBirthday
from tests.support import TestSession, add_member, post_contact

pytestmark = pytest.mark.usefixtures("app_db")


@pytest.fixture
def api():
    """Dennis (adult, with the token) and Hannelore, a member without a
    birthday yet."""
    with TestSession() as db:
        dennis = add_member(
            db, "dennis@example.com", family_name="Braun", display_name="Dennis Braun",
            scopes="contacts:read,contacts:write,birthdays:read,birthdays:write,families:read,families:write,dashboard:read",
            date_of_birth=date(1985, 10, 5),
        )
        hannelore = add_member(
            db, "hanne@example.com", scopes=None, family_id=dennis.family_id, role="member", display_name="Hannelore",
        )
        db.commit()
    ids = {"family": dennis.family_id, "dennis": dennis.user_id, "hannelore": hannelore.user_id}
    client = TestClient(app)
    client.headers.update(dennis.headers)
    return client, ids


def _set_birthdate(client, ids, who, value):
    resp = client.patch(f"/families/{ids['family']}/members/{ids[who]}/birthdate", json={"date_of_birth": value})
    assert resp.status_code == 200, resp.text


def _suggestions(client, family_id):
    return [g for g in client.get("/contacts/duplicates", params={"family_id": family_id}).json() if g.get("member_user_id")]


def test_members_birthdays_are_in_the_birthday_list(api):
    client, ids = api
    birthdays = client.get("/birthdays", params={"family_id": ids["family"]}).json()
    assert birthdays == []  # the fixture wrote Dennis' birthday straight to the database

    _set_birthdate(client, ids, "hannelore", "1950-03-14")
    [row] = client.get("/birthdays", params={"family_id": ids["family"]}).json()
    assert (row["person_name"], row["month"], row["day"], row["year"]) == ("Hannelore", 3, 14, 1950)
    assert row["member_user_id"] == ids["hannelore"]
    # It follows the profile, not the birthdays API.
    assert client.patch(f"/birthdays/{row['id']}", json={"day": 15}).json()["detail"]["code"] == "BIRTHDAY_FROM_PROFILE"
    assert client.delete(f"/birthdays/{row['id']}").status_code == 400

    _set_birthdate(client, ids, "hannelore", None)
    assert client.get("/birthdays", params={"family_id": ids["family"]}).json() == []


def test_a_first_name_alone_is_not_enough(api):
    client, ids = api
    _set_birthdate(client, ids, "hannelore", "1950-03-14")
    post_contact(client, ids["family"], full_name="Hannelore Schmidt", birthday_month=5, birthday_day=1)
    assert _suggestions(client, ids["family"]) == []


def test_first_name_and_birthday_suggest_the_member(api):
    client, ids = api
    _set_birthdate(client, ids, "hannelore", "1950-03-14")
    phone = post_contact(client, ids["family"], full_name="Müller, Hannelore", birthday_month=3, birthday_day=14)
    assert _suggestions(client, ids["family"]) == [
        {"contact_ids": [phone["id"]], "member_user_id": ids["hannelore"], "reasons": ["birthday", "first_name"]},
    ]


def test_email_or_the_whole_name_suggest_the_member(api):
    client, ids = api
    by_email = post_contact(client, ids["family"], full_name="Oma", email="HANNE@example.com")
    by_name = post_contact(client, ids["family"], full_name="Braun Dennis")
    found = {(g["contact_ids"][0], g["member_user_id"]): g["reasons"] for g in _suggestions(client, ids["family"])}
    assert found == {(by_email["id"], ids["hannelore"]): ["email"], (by_name["id"], ids["dennis"]): ["name"]}


def test_linking_makes_one_person_with_one_birthday(api):
    client, ids = api
    phone = post_contact(
        client, ids["family"], full_name="Hannelore Müller", phone="0170 5550000",
        birthday_month=3, birthday_day=14, birthday_year=1950,
    )
    assert [b["contact_id"] for b in client.get("/birthdays", params={"family_id": ids["family"]}).json()] == [phone["id"]]

    linked = client.post(f"/contacts/{phone['id']}/member", json={"family_id": ids["family"], "member_user_id": ids["hannelore"]})
    assert linked.status_code == 200, linked.text
    assert linked.json()["member_user_id"] == ids["hannelore"]
    # The member takes the contact's birthday, and the person shows once.
    members = client.get(f"/families/{ids['family']}/members").json()
    assert next(m for m in members if m["user_id"] == ids["hannelore"])["date_of_birth"] == "1950-03-14"
    [row] = client.get("/birthdays", params={"family_id": ids["family"]}).json()
    assert (row["member_user_id"], row["contact_id"]) == (ids["hannelore"], None)
    assert _suggestions(client, ids["family"]) == []

    # Unlinked, the contact has its own birthday again.
    client.post(f"/contacts/{phone['id']}/member", json={"family_id": ids["family"], "member_user_id": None})
    rows = client.get("/birthdays", params={"family_id": ids["family"]}).json()
    assert sorted((r["contact_id"] or 0, r["member_user_id"] or 0) for r in rows) == sorted(
        [(phone["id"], 0), (0, ids["hannelore"])],
    )


def test_different_people_are_not_suggested_again(api):
    client, ids = api
    _set_birthdate(client, ids, "hannelore", "1950-03-14")
    other = post_contact(client, ids["family"], full_name="Hannelore Maier", birthday_month=3, birthday_day=14)
    assert len(_suggestions(client, ids["family"])) == 1
    resp = client.post("/contacts/duplicates/dismiss", json={
        "family_id": ids["family"], "contact_ids": [other["id"]], "member_user_id": ids["hannelore"],
    })
    assert resp.status_code == 200, resp.text
    assert _suggestions(client, ids["family"]) == []


def test_a_member_who_leaves_hands_the_birthday_back_to_the_contact(api):
    client, ids = api
    phone = post_contact(client, ids["family"], full_name="Hannelore Müller", birthday_month=3, birthday_day=14, birthday_year=1950)
    client.post(f"/contacts/{phone['id']}/member", json={"family_id": ids["family"], "member_user_id": ids["hannelore"]})
    assert client.delete(f"/families/{ids['family']}/members/{ids['hannelore']}").status_code == 200
    [contact] = client.get("/contacts", params={"family_id": ids["family"]}).json()
    assert contact["member_user_id"] is None
    [row] = client.get("/birthdays", params={"family_id": ids["family"]}).json()
    assert row["contact_id"] == phone["id"]

    with TestSession() as db:
        assert db.query(FamilyBirthday).filter(FamilyBirthday.member_user_id.isnot(None)).count() == 0
