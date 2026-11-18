"""Who is out shopping with a list (Tribu 2.0, L4)."""

from datetime import timedelta

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models import ShoppingItem
from app.modules import shopping_router
from tests.support import TestSession, seed_member, seed_shopping_list


pytestmark = pytest.mark.usefixtures("app_db", "shopping_broadcasts")

client = TestClient(app)


def _member(suffix: str, name: str, family_id: int | None = None, adult: bool = True) -> tuple[dict, int, int]:
    member = seed_member(
        f"trip-{suffix}@example.com",
        scopes="shopping:read,shopping:write",
        family_id=family_id,
        is_adult=adult,
        display_name=name,
    )
    return member.headers, member.family_id, member.user_id


def _list(family_id: int) -> int:
    """A "Weekly" list with one checked item."""
    list_id = seed_shopping_list(family_id, "Weekly")
    with TestSession() as db:
        db.add(ShoppingItem(list_id=list_id, name="Milk", checked=True, position=0))
        db.commit()
    return list_id


def test_the_family_sees_who_is_shopping_until_they_are_done(shopping_broadcasts):
    anna, family_id, anna_id = _member("anna", "Anna Braun")
    dennis, _, _ = _member("dennis", "Dennis", family_id)
    list_id = _list(family_id)

    started = client.post(f"/shopping/lists/{list_id}/trip", json={"active": True}, headers=anna)
    assert started.status_code == 200, started.json()
    assert started.json()["shopper"]["display_name"] == "Anna Braun"

    lists = client.get(f"/shopping/lists?family_id={family_id}", headers=dennis).json()
    assert lists[0]["shopper"]["user_id"] == anna_id
    # Everyone watching the family or the list hears about it.
    assert [(scope, name) for scope, _, name, _ in shopping_broadcasts] == [("family", "shopper_changed"), ("list", "shopper_changed")]

    # Someone else ending "their" trip changes nothing.
    client.post(f"/shopping/lists/{list_id}/trip", json={"active": False}, headers=dennis)
    assert client.get(f"/shopping/lists?family_id={family_id}", headers=dennis).json()[0]["shopper"]["user_id"] == anna_id

    # Finishing the trip ends it.
    assert client.post(f"/shopping/lists/{list_id}/complete", headers=anna).status_code == 200
    assert client.get(f"/shopping/lists?family_id={family_id}", headers=dennis).json()[0]["shopper"] is None
    ended = [payload for _, _, name, payload in shopping_broadcasts if name == "shopper_changed"][-1]
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
