"""Quality-of-life coverage for recipe favorites, recents, and scaling metadata."""

from datetime import datetime
from pathlib import Path
import sys

import pytest

sys.path.append(str(Path(__file__).parent))
from app.database import Base, get_db  # noqa: E402
from app.main import app  # noqa: E402
from test_recipes import (  # noqa: E402
    TestSession,
    _auth,
    _create_recipe,
    _seed_member,
    _seed_shopping_list,
    client,
    engine,
)


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


def test_favorite_recipes_are_returned_first_and_can_be_toggled():
    token, family_id = _seed_member("*", "qol-favorite")
    weeknight = _create_recipe(token, family_id, title="Weeknight pasta")
    favorite = _create_recipe(token, family_id, title="Apple pancakes")

    patch = client.patch(
        f"/recipes/{favorite['id']}",
        json={"is_favorite": True},
        headers=_auth(token),
    )

    assert patch.status_code == 200, patch.json()
    assert patch.json()["is_favorite"] is True

    listed = client.get(f"/recipes?family_id={family_id}", headers=_auth(token))
    assert listed.status_code == 200
    data = listed.json()
    assert [recipe["title"] for recipe in data[:2]] == ["Apple pancakes", "Weeknight pasta"]
    assert data[0]["is_favorite"] is True
    assert data[1]["is_favorite"] is False


def test_add_to_shopping_marks_recipe_recently_used():
    token, family_id = _seed_member("*", "qol-recent")
    recipe = _create_recipe(token, family_id, title="Pancakes")
    list_id = _seed_shopping_list(family_id)

    before = datetime.utcnow()
    resp = client.post(
        f"/recipes/{recipe['id']}/add-to-shopping",
        json={"shopping_list_id": list_id, "ingredient_names": ["Flour"]},
        headers=_auth(token),
    )

    assert resp.status_code == 200, resp.json()
    fetched = client.get(f"/recipes/{recipe['id']}", headers=_auth(token))
    assert fetched.status_code == 200
    used_at = datetime.fromisoformat(fetched.json()["last_used_at"].replace("Z", "+00:00"))
    assert used_at >= before
