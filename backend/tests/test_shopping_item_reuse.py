"""Regression tests for shopping item reuse and name normalization."""

import hashlib

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from app.core.utils import utcnow
from app.database import Base, get_db
from app.main import app
from app.models import Family, Membership, PersonalAccessToken, ShoppingItem, ShoppingList, User
from app.security import PAT_PREFIX, hash_password


engine = create_engine(
    "sqlite:///./test-shopping-item-reuse.db",
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
    Base.metadata.drop_all(bind=engine)
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


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _seed_owner() -> tuple[str, int, int]:
    db = TestSession()
    user = User(
        email="shopping-reuse-owner@example.com",
        password_hash=hash_password("Password1"),
        display_name="Shopping Owner",
    )
    db.add(user)
    db.flush()
    family = Family(name="Shopping Reuse Family")
    db.add(family)
    db.flush()
    db.add(Membership(user_id=user.id, family_id=family.id, role="admin", is_adult=True))
    shopping_list = ShoppingList(family_id=family.id, name="Groceries", created_by_user_id=user.id)
    db.add(shopping_list)
    plain = f"{PAT_PREFIX}shopping-reuse-owner"
    fingerprint = hashlib.sha256(plain.encode()).hexdigest()
    db.add(PersonalAccessToken(
        user_id=user.id,
        name="shopping-reuse-pat",
        token_hash=fingerprint,
        token_lookup=fingerprint,
        scopes="shopping:read,shopping:write",
    ))
    db.commit()
    list_id = shopping_list.id
    family_id = family.id
    db.close()
    return plain, family_id, list_id


def test_add_item_reactivates_checked_match_without_creating_duplicate():
    token, _family_id, list_id = _seed_owner()
    db = TestSession()
    checked_item = ShoppingItem(
        list_id=list_id,
        name="Milk",
        spec=None,
        checked=True,
        checked_at=utcnow(),
    )
    db.add(checked_item)
    db.commit()
    existing_id = checked_item.id
    db.close()

    response = client.post(
        f"/shopping/lists/{list_id}/items",
        json={"name": "  milk  "},
        headers=_auth(token),
    )

    assert response.status_code == 200, response.json()
    assert response.json()["id"] == existing_id
    assert response.json()["name"] == "Milk"
    assert response.json()["checked"] is False
    assert response.json()["checked_at"] is None

    items = client.get(f"/shopping/lists/{list_id}/items", headers=_auth(token))
    assert items.status_code == 200
    assert [(item["id"], item["name"], item["checked"]) for item in items.json()] == [
        (existing_id, "Milk", False),
    ]


def test_add_item_keeps_separate_rows_when_details_differ_and_capitalizes_names():
    token, _family_id, list_id = _seed_owner()
    db = TestSession()
    checked_item = ShoppingItem(
        list_id=list_id,
        name="Milk",
        spec="1 L",
        checked=True,
        checked_at=utcnow(),
    )
    db.add(checked_item)
    db.commit()
    existing_id = checked_item.id
    db.close()

    response = client.post(
        f"/shopping/lists/{list_id}/items",
        json={"name": "milk", "spec": "2 L"},
        headers=_auth(token),
    )

    assert response.status_code == 200, response.json()
    assert response.json()["id"] != existing_id
    assert response.json()["name"] == "Milk"
    assert response.json()["spec"] == "2 L"
    assert response.json()["checked"] is False

    items = client.get(f"/shopping/lists/{list_id}/items", headers=_auth(token))
    assert items.status_code == 200
    assert [(item["name"], item["spec"], item["checked"]) for item in items.json()] == [
        ("Milk", "2 L", False),
        ("Milk", "1 L", True),
    ]


def test_update_item_capitalizes_name():
    token, _family_id, list_id = _seed_owner()
    created = client.post(
        f"/shopping/lists/{list_id}/items",
        json={"name": "bread"},
        headers=_auth(token),
    )
    assert created.status_code == 200, created.json()

    updated = client.patch(
        f"/shopping/items/{created.json()['id']}",
        json={"name": "butter"},
        headers=_auth(token),
    )

    assert updated.status_code == 200, updated.json()
    assert updated.json()["name"] == "Butter"


def test_blank_after_trim_names_are_rejected():
    token, _family_id, list_id = _seed_owner()

    created = client.post(
        f"/shopping/lists/{list_id}/items",
        json={"name": "   "},
        headers=_auth(token),
    )
    assert created.status_code == 422

    valid = client.post(
        f"/shopping/lists/{list_id}/items",
        json={"name": "bread"},
        headers=_auth(token),
    )
    assert valid.status_code == 200, valid.json()

    updated = client.patch(
        f"/shopping/items/{valid.json()['id']}",
        json={"name": "   "},
        headers=_auth(token),
    )
    assert updated.status_code == 422
