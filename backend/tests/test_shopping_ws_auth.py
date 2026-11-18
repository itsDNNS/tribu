import pytest
from fastapi import WebSocketDisconnect
from fastapi.testclient import TestClient

from app.main import app
from app.security import create_access_token
from tests.support import seed_member, seed_shopping_list


pytestmark = pytest.mark.usefixtures("app_db")

client = TestClient(app)


def _seed_shopping_list() -> tuple[int, str, int]:
    """An onboarded adult without a PAT and a list. Returns (user_id, email, list_id)."""
    email = "shopping-ws@example.com"
    member = seed_member(
        email, scopes=None, display_name="Shopping WS", user_fields={"has_completed_onboarding": True},
    )
    return member.user_id, email, seed_shopping_list(member.family_id)


def test_shopping_ws_accepts_native_bearer_header():
    user_id, email, list_id = _seed_shopping_list()
    token = create_access_token(user_id=user_id, email=email)

    with client.websocket_connect(
        f"/ws/shopping/{list_id}",
        headers={"Authorization": f"Bearer {token}"},
    ) as ws:
        ws.send_json({"type": "ping"})
        assert ws.receive_json() == {"type": "pong"}


def _cookie_ws_messages(list_id, token, sec_fetch_site):
    with client.websocket_connect(
        f"/ws/shopping/{list_id}",
        headers={"Cookie": f"tribu_token={token}", "Sec-Fetch-Site": sec_fetch_site, "Sec-Fetch-Mode": "websocket"},
    ) as ws:
        ws.send_json({"type": "ping"})
        return ws.receive_json()


def test_shopping_ws_rejects_cookie_handshake_from_another_site():
    user_id, email, list_id = _seed_shopping_list()
    token = create_access_token(user_id=user_id, email=email)

    assert _cookie_ws_messages(list_id, token, "same-origin") == {"type": "pong"}
    with pytest.raises(WebSocketDisconnect) as closed:
        _cookie_ws_messages(list_id, token, "same-site")
    assert closed.value.code == 4001
