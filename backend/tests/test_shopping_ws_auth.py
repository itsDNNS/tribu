import pytest
from fastapi import WebSocketDisconnect
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from app.database import Base, get_db
from app.main import app
from app.models import Family, Membership, ShoppingList, User
from app.security import create_access_token, hash_password


engine = create_engine(
    "sqlite:///./test-shopping-ws-auth.db",
    connect_args={"check_same_thread": False},
)
TestSession = sessionmaker(bind=engine)


@event.listens_for(engine, "connect")
def _set_sqlite_pragma(dbapi_conn, _):
    cursor = dbapi_conn.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


def setup_function():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)

    def _override():
        db = TestSession()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _override


def teardown_function():
    app.dependency_overrides.pop(get_db, None)
    Base.metadata.drop_all(bind=engine)


client = TestClient(app)


def _seed_shopping_list():
    db = TestSession()
    try:
        user = User(
            email="shopping-ws@example.com",
            password_hash=hash_password("Secure1Pass"),
            display_name="Shopping WS",
            has_completed_onboarding=True,
        )
        db.add(user)
        db.flush()
        family = Family(name="Shopping Family")
        db.add(family)
        db.flush()
        db.add(Membership(user_id=user.id, family_id=family.id, role="admin", is_adult=True))
        shopping_list = ShoppingList(family_id=family.id, name="Groceries")
        db.add(shopping_list)
        db.commit()
        return user.id, user.email, shopping_list.id
    finally:
        db.close()


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
