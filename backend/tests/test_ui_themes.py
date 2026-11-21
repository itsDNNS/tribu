"""The app themes come from one list, frontend/design/tokens.json: the backend
accepts exactly the themes in its generated copy, app/ui_themes.json."""
import json

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.modules.nav_router import KNOWN_UI_THEMES
from tests.conftest import REPO_ROOT
from tests.support import TestSession, add_member

pytestmark = pytest.mark.usefixtures("app_db")


def _token_themes():
    tokens = json.loads((REPO_ROOT / "frontend" / "design" / "tokens.json").read_text())
    return [(key, entry["colorScheme"]) for key, entry in tokens["themes"].items()]


def test_the_backend_copy_matches_the_token_file():
    copy = json.loads((REPO_ROOT / "backend" / "app" / "ui_themes.json").read_text())
    # Stale? Run `npm run tokens:generate` in frontend/.
    assert [(theme["key"], theme["colorScheme"]) for theme in copy["themes"]] == _token_themes()
    assert KNOWN_UI_THEMES == {key for key, _ in _token_themes()}


@pytest.fixture
def client():
    with TestSession() as db:
        member = add_member(db, "anna@example.com", scopes="profile:read,profile:write")
        db.commit()
    client = TestClient(app)
    client.headers.update(member.headers)
    return client


def test_every_theme_in_the_list_can_be_saved(client):
    for key, _ in _token_themes():
        resp = client.put("/nav/ui-preferences", json={"theme": key})
        assert resp.status_code == 200, resp.text
        assert resp.json()["theme"] == key
    assert sorted(client.get("/nav/ui-preferences").json()["available_themes"]) == sorted(key for key, _ in _token_themes())


def test_a_theme_that_is_not_in_the_list_is_refused(client):
    resp = client.put("/nav/ui-preferences", json={"theme": "not-a-theme"})
    assert resp.status_code == 422
