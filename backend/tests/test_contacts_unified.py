"""Contacts carry birthdays, and the same person is not kept twice."""
import hashlib

import pytest
import vobject
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from app.core.contact_duplicates import normalize_name, normalize_phone
from app.database import Base, get_db
from app.main import app
from app.models import Contact, Family, FamilyBirthday, Membership, PersonalAccessToken, User
from app.security import PAT_PREFIX, hash_password

engine = create_engine("sqlite:///./test-contacts-unified.db", connect_args={"check_same_thread": False})
TestSession = sessionmaker(bind=engine, autoflush=False)


@event.listens_for(engine, "connect")
def _foreign_keys(dbapi_conn, _):
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


@pytest.fixture
def api():
    db = TestSession()
    user = User(email="c@example.com", password_hash=hash_password("p"), display_name="C")
    db.add(user)
    db.flush()
    family = Family(name="Contacts Family")
    db.add(family)
    db.flush()
    db.add(Membership(user_id=user.id, family_id=family.id, role="admin", is_adult=True))
    plain = f"{PAT_PREFIX}contacts-rw"
    db.add(PersonalAccessToken(
        user_id=user.id,
        name="pat",
        token_hash=hashlib.sha256(plain.encode()).hexdigest(),
        token_lookup=hashlib.sha256(plain.encode()).hexdigest(),
        scopes="contacts:read,contacts:write,birthdays:read,birthdays:write",
    ))
    db.commit()
    family_id = family.id
    db.close()
    client = TestClient(app)
    client.headers["Authorization"] = f"Bearer {plain}"
    return client, family_id


def _contact(client, family_id, **fields):
    resp = client.post("/contacts", json={"family_id": family_id, **fields})
    assert resp.status_code == 200, resp.text
    return resp.json()


def test_normalization():
    assert normalize_phone("0170 1234567") == normalize_phone("+49 (170) 123-4567")
    assert normalize_name("Weber, Sophie") == normalize_name("sophie  WEBER")
    assert normalize_name("Jürgen Groß") == normalize_name("Jurgen Gross")


def test_a_contact_keeps_its_year_of_birth(api):
    client, family_id = api
    contact = _contact(client, family_id, full_name="Helga Müller", birthday_month=10, birthday_day=2, birthday_year=1948)
    assert contact["birthday_year"] == 1948
    [birthday] = client.get("/birthdays", params={"family_id": family_id}).json()
    assert (birthday["contact_id"], birthday["year"]) == (contact["id"], 1948)
    bad = client.patch(f"/contacts/{contact['id']}", json={"birthday_year": 1700})
    assert bad.status_code == 400
    cleared = client.patch(f"/contacts/{contact['id']}", json={"birthday_month": None, "birthday_day": None}).json()
    assert cleared["birthday_year"] is None
    assert client.get("/birthdays", params={"family_id": family_id}).json() == []


def test_the_birthdays_api_works_on_contacts(api):
    client, family_id = api
    birthday = client.post("/birthdays", json={"family_id": family_id, "person_name": "Opa Karl", "month": 10, "day": 6, "year": 1940}).json()
    [contact] = client.get("/contacts", params={"family_id": family_id}).json()
    assert contact["full_name"] == "Opa Karl" and contact["birthday_year"] == 1940
    assert birthday["contact_id"] == contact["id"]
    client.patch(f"/birthdays/{birthday['id']}", json={"day": 7})
    assert client.get("/contacts", params={"family_id": family_id}).json()[0]["birthday_day"] == 7
    assert client.delete(f"/birthdays/{birthday['id']}").status_code == 204
    [contact] = client.get("/contacts", params={"family_id": family_id}).json()
    assert contact["birthday_month"] is None


def test_duplicates_are_found_by_email_phone_and_name(api):
    client, family_id = api
    a = _contact(client, family_id, full_name="Sophie Weber", phone="0170 1234567")
    b = _contact(client, family_id, full_name="Dr. S. Weber", phone="+49 170 1234567")
    c = _contact(client, family_id, full_name="Weber, Sophie", email="sophie@example.com")
    _contact(client, family_id, full_name="Tom Becker", email="tom@example.com")
    groups = client.get("/contacts/duplicates", params={"family_id": family_id}).json()
    assert groups == [{"contact_ids": [a["id"], b["id"], c["id"]], "reasons": ["name", "phone"]}]

    client.post("/contacts/duplicates/dismiss", json={"family_id": family_id, "contact_ids": [a["id"], b["id"], c["id"]]})
    assert client.get("/contacts/duplicates", params={"family_id": family_id}).json() == []


def test_merging_keeps_everything_once(api):
    client, family_id = api
    keep = _contact(client, family_id, full_name="Sophie Weber", phone="0170 1234567")
    other = _contact(client, family_id, full_name="Sophie Weber", email="sophie@example.com", phone="+49 30 99887766", birthday_month=7, birthday_day=7, birthday_year=1990)
    merged = client.post("/contacts/merge", json={"family_id": family_id, "keep_id": keep["id"], "merge_ids": [other["id"]]})
    assert merged.status_code == 200, merged.text
    body = merged.json()
    assert body["email"] == "sophie@example.com"
    assert body["phone_values"] == ["0170 1234567", "+49 30 99887766"]
    assert (body["birthday_month"], body["birthday_day"], body["birthday_year"]) == (7, 7, 1990)
    contacts = client.get("/contacts", params={"family_id": family_id}).json()
    assert [c["id"] for c in contacts] == [keep["id"]]
    [birthday] = client.get("/birthdays", params={"family_id": family_id}).json()
    assert birthday["contact_id"] == keep["id"]

    db = TestSession()
    card = vobject.readOne(db.get(Contact, keep["id"]).raw_vcard)
    db.close()
    assert sorted(t.value for t in card.contents["tel"]) == ["+49 30 99887766", "0170 1234567"]


def test_merging_other_families_contacts_is_refused(api):
    client, family_id = api
    keep = _contact(client, family_id, full_name="Anna")
    db = TestSession()
    stranger_family = Family(name="Other")
    db.add(stranger_family)
    db.flush()
    stranger = Contact(family_id=stranger_family.id, full_name="Anna")
    db.add(stranger)
    db.commit()
    stranger_id = stranger.id
    db.close()
    resp = client.post("/contacts/merge", json={"family_id": family_id, "keep_id": keep["id"], "merge_ids": [stranger_id]})
    assert resp.status_code == 404


def test_csv_import_completes_known_people(api):
    client, family_id = api
    _contact(client, family_id, full_name="Sophie Weber", phone="0170 1234567")
    csv_text = (
        "full_name,email,phone,birthday_month,birthday_day,birthday_year\n"
        "Sophie Weber,sophie@example.com,+49 170 1234567,7,7,1990\n"
        "Tom Becker,tom@example.com,,3,14,\n"
    )
    result = client.post("/contacts/import-csv", json={"family_id": family_id, "csv_text": csv_text}).json()
    assert (result["created"], result["merged"]) == (1, 1)
    contacts = {c["full_name"]: c for c in client.get("/contacts", params={"family_id": family_id}).json()}
    assert contacts["Sophie Weber"]["email"] == "sophie@example.com"
    assert contacts["Sophie Weber"]["birthday_year"] == 1990
    assert len(contacts) == 2
