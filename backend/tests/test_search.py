import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models import ShoppingItem
from tests.support import TestSession, auth, seed_member, seed_shopping_list


pytestmark = pytest.mark.usefixtures("app_db")

client = TestClient(app)


def _seed_shopping_search() -> tuple[str, int]:
    """A "Drogerie" list with an open and an archived "Zahn..." item. Returns (token, family_id)."""
    member = seed_member("search-owner@example.com", scopes="families:read", display_name="Search Owner")
    list_id = seed_shopping_list(member.family_id, "Drogerie", user_id=member.user_id)
    with TestSession() as db:
        db.add(ShoppingItem(list_id=list_id, name="Zahnpasta", checked=False, added_by_user_id=member.user_id))
        db.add(ShoppingItem(list_id=list_id, name="Zahn history", checked=True, archived=True, added_by_user_id=member.user_id))
        db.commit()
    return member.token, member.family_id


def test_shopping_search_result_includes_list_name_for_mobile_context():
    token, family_id = _seed_shopping_search()

    response = client.get(
        "/search",
        params={"family_id": family_id, "q": "Zahn"},
        headers=auth(token),
    )

    assert response.status_code == 200, response.text
    assert len(response.json()["shopping"]) == 1
    item = response.json()["shopping"][0]
    assert item["name"] == "Zahnpasta"
    assert item["list_name"] == "Drogerie"
