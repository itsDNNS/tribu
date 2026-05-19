import hashlib

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from app.database import Base, get_db
from app.main import app
from app.models import Family, Membership, PersonalAccessToken, ShoppingItem, ShoppingList, User
from app.security import PAT_PREFIX, hash_password


engine = create_engine(
    "sqlite:///./test-search.db",
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


def _seed_shopping_search() -> tuple[str, int]:
    db = TestSession()
    user = User(
        email="search-owner@example.com",
        password_hash=hash_password("Password1"),
        display_name="Search Owner",
    )
    db.add(user)
    db.flush()
    family = Family(name="Search Family")
    db.add(family)
    db.flush()
    db.add(Membership(user_id=user.id, family_id=family.id, role="admin", is_adult=True))
    shopping_list = ShoppingList(family_id=family.id, name="Drogerie", created_by_user_id=user.id)
    db.add(shopping_list)
    db.flush()
    db.add(ShoppingItem(list_id=shopping_list.id, name="Zahnpasta", checked=False, added_by_user_id=user.id))
    plain = f"{PAT_PREFIX}search-owner"
    fingerprint = hashlib.sha256(plain.encode()).hexdigest()
    db.add(PersonalAccessToken(
        user_id=user.id,
        name="search-pat",
        token_hash=fingerprint,
        token_lookup=fingerprint,
        scopes="families:read",
    ))
    db.commit()
    family_id = family.id
    db.close()
    return plain, family_id


def test_shopping_search_result_includes_list_name_for_mobile_context():
    token, family_id = _seed_shopping_search()

    response = client.get(
        "/search",
        params={"family_id": family_id, "q": "Zahn"},
        headers=_auth(token),
    )

    assert response.status_code == 200, response.text
    item = response.json()["shopping"][0]
    assert item["name"] == "Zahnpasta"
    assert item["list_name"] == "Drogerie"
