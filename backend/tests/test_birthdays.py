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
from app.database import Base, get_db
from app.main import app
from app.models import Family, FamilyBirthday, Membership, PersonalAccessToken, User
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


def test_contact_rename_preserves_existing_birthday_row_and_year():
    token, family_id = _seed_member(scopes="birthdays:write,contacts:write")
    client = TestClient(app)

    created_birthday = client.post(
        "/birthdays",
        json={"family_id": family_id, "person_name": "Alice", "month": 4, "day": 14, "year": 1980},
        headers=_auth_headers(token),
    )
    assert created_birthday.status_code == 200, created_birthday.text
    birthday_id = created_birthday.json()["id"]

    created_contact = client.post(
        "/contacts",
        json={"family_id": family_id, "full_name": "Alice", "birthday_month": 4, "birthday_day": 14},
        headers=_auth_headers(token),
    )
    assert created_contact.status_code == 200, created_contact.text
    contact_id = created_contact.json()["id"]

    renamed_contact = client.patch(
        f"/contacts/{contact_id}",
        json={"full_name": "Alice Smith"},
        headers=_auth_headers(token),
    )
    assert renamed_contact.status_code == 200, renamed_contact.text

    db = TestSession()
    try:
        birthdays = (
            db.query(FamilyBirthday)
            .filter(FamilyBirthday.family_id == family_id)
            .order_by(FamilyBirthday.id.asc())
            .all()
        )
        assert len(birthdays) == 1
        assert birthdays[0].id == birthday_id
        assert birthdays[0].person_name == "Alice Smith"
        assert birthdays[0].month == 4
        assert birthdays[0].day == 14
        assert birthdays[0].year == 1980
    finally:
        db.close()
