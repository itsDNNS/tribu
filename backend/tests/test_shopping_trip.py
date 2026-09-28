"""Who is out shopping with a list (Tribu 2.0, L4)."""

import hashlib
from datetime import timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app
from app.models import Family, Membership, PersonalAccessToken, ShoppingItem, ShoppingList, User
from app.modules import shopping_router
from app.security import PAT_PREFIX, hash_password

engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
TestSession = sessionmaker(bind=engine)


@event.listens_for(engine, "connect")
def _set_sqlite_pragma(dbapi_conn, _):
    cursor = dbapi_conn.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


@pytest.fixture(autouse=True)
def setup_db(monkeypatch):
    Base.metadata.create_all(bind=engine)
    events = []
    monkeypatch.setattr(shopping_router, "broadcast_shopping_event", lambda *args: events.append(args))

    def _override():
        db = TestSession()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _override
    yield events
    app.dependency_overrides.pop(get_db, None)
    Base.metadata.drop_all(bind=engine)


client = TestClient(app)


def _member(suffix: str, name: str, family_id: int | None = None, adult: bool = True) -> tuple[dict, int, int]:
    with TestSession() as db:
        user = User(email=f"trip-{suffix}@example.com", password_hash=hash_password("Password1"), display_name=name)
        db.add(user)
        db.flush()
        if family_id is None:
            family = Family(name="Trip family")
            db.add(family)
            db.flush()
            family_id = family.id
        db.add(Membership(user_id=user.id, family_id=family_id, role="admin" if adult else "member", is_adult=adult))
        plain = f"{PAT_PREFIX}trip-{suffix}"
        lookup = hashlib.sha256(plain.encode()).hexdigest()
        db.add(PersonalAccessToken(user_id=user.id, name="trip", token_hash=lookup, token_lookup=lookup,
                                   scopes="shopping:read,shopping:write"))
        db.commit()
        return {"Authorization": f"Bearer {plain}"}, family_id, user.id


def _list(family_id: int) -> int:
    with TestSession() as db:
        sl = ShoppingList(family_id=family_id, name="Weekly")
        db.add(sl)
        db.flush()
        db.add(ShoppingItem(list_id=sl.id, name="Milk", checked=True, position=0))
        db.commit()
        return sl.id


def test_the_family_sees_who_is_shopping_until_they_are_done(setup_db):
    anna, family_id, anna_id = _member("anna", "Anna Braun")
    dennis, _, _ = _member("dennis", "Dennis", family_id)
    list_id = _list(family_id)

    started = client.post(f"/shopping/lists/{list_id}/trip", json={"active": True}, headers=anna)
    assert started.status_code == 200, started.json()
    assert started.json()["shopper"]["display_name"] == "Anna Braun"

    lists = client.get(f"/shopping/lists?family_id={family_id}", headers=dennis).json()
    assert lists[0]["shopper"]["user_id"] == anna_id
    # Everyone watching the family or the list hears about it.
    assert [(scope, name) for scope, _, name, _ in setup_db] == [("family", "shopper_changed"), ("list", "shopper_changed")]

    # Someone else ending "their" trip changes nothing.
    client.post(f"/shopping/lists/{list_id}/trip", json={"active": False}, headers=dennis)
    assert client.get(f"/shopping/lists?family_id={family_id}", headers=dennis).json()[0]["shopper"]["user_id"] == anna_id

    # Finishing the trip ends it.
    assert client.post(f"/shopping/lists/{list_id}/complete", headers=anna).status_code == 200
    assert client.get(f"/shopping/lists?family_id={family_id}", headers=dennis).json()[0]["shopper"] is None
    ended = [payload for _, _, name, payload in setup_db if name == "shopper_changed"][-1]
    assert ended == {"list_id": list_id, "shopper": None}


def test_a_forgotten_trip_stops_counting(monkeypatch):
    anna, family_id, _ = _member("anna", "Anna")
    list_id = _list(family_id)
    client.post(f"/shopping/lists/{list_id}/trip", json={"active": True}, headers=anna)
    later = shopping_router.utcnow() + timedelta(hours=4)
    monkeypatch.setattr(shopping_router, "utcnow", lambda: later)
    assert client.get(f"/shopping/lists?family_id={family_id}", headers=anna).json()[0]["shopper"] is None


def test_children_can_shop_and_strangers_cannot():
    child, family_id, _ = _member("kid", "Lena", adult=False)
    stranger, _, _ = _member("stranger", "Eve")
    list_id = _list(family_id)
    assert client.post(f"/shopping/lists/{list_id}/trip", json={"active": True}, headers=child).status_code == 200
    assert client.post(f"/shopping/lists/{list_id}/trip", json={"active": True}, headers=stranger).status_code == 403
