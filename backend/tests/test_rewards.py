"""Rewards around goals: stars without setup, personal and family goals,
praise with or without stars, and wishes that are approved and given."""
import hashlib

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from app.database import Base, get_db
from app.main import app
from app.models import Family, Membership, Notification, PersonalAccessToken, User
from app.security import PAT_PREFIX, hash_password

engine = create_engine("sqlite:///./test-rewards.db", connect_args={"check_same_thread": False})
TestSession = sessionmaker(bind=engine, autoflush=False)

SCOPES = "rewards:read,rewards:write,tasks:read,tasks:write"


@event.listens_for(engine, "connect")
def _foreign_keys(dbapi_conn, _):
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


@pytest.fixture
def family():
    """A parent, a second parent and a child, each with their own client."""
    db = TestSession()
    fam = Family(name="Star Family")
    db.add(fam)
    db.flush()
    clients = {}
    ids = {}
    for key, name, adult in (("mum", "Anna Weber", True), ("dad", "Dennis Weber", True), ("kid", "Lena Weber", False)):
        user = User(email=f"{key}@example.com", password_hash=hash_password("p"), display_name=name)
        db.add(user)
        db.flush()
        db.add(Membership(user_id=user.id, family_id=fam.id, role="admin" if adult else "member", is_adult=adult))
        plain = f"{PAT_PREFIX}rewards-{key}"
        db.add(PersonalAccessToken(
            user_id=user.id, name="pat",
            token_hash=hashlib.sha256(plain.encode()).hexdigest(),
            token_lookup=hashlib.sha256(plain.encode()).hexdigest(),
            scopes=SCOPES,
        ))
        ids[key] = user.id
        client = TestClient(app)
        client.headers["Authorization"] = f"Bearer {plain}"
        clients[key] = client
    db.commit()
    family_id = fam.id
    db.close()
    return clients, ids, family_id


def _currency(client, family_id):
    resp = client.get("/rewards/currency", params={"family_id": family_id})
    assert resp.status_code == 200, resp.text
    return resp.json()


def _wish(client, family_id, name, cost, kind="personal"):
    currency = _currency(client, family_id)
    resp = client.post("/rewards/catalog", json={
        "family_id": family_id, "currency_id": currency["id"], "name": name, "cost": cost, "icon": "film", "kind": kind,
    })
    assert resp.status_code == 201, resp.text
    return resp.json()


def _praise(client, family_id, to_user_id, message, amount=0):
    return client.post("/rewards/praise", json={
        "family_id": family_id, "to_user_id": to_user_id, "message": message, "amount": amount,
    })


def _balance(client, family_id, user_id):
    resp = client.get("/rewards/balances", params={"family_id": family_id})
    assert resp.status_code == 200, resp.text
    return next(item for item in resp.json()["balances"] if item["user_id"] == user_id)


def test_stars_exist_without_setup(family):
    clients, ids, family_id = family
    # Even a child's first look finds the family's stars, named by the reader.
    currency = _currency(clients["kid"], family_id)
    assert currency["name"] == "" and currency["icon"] == "star"
    assert _currency(clients["mum"], family_id)["id"] == currency["id"]
    assert _balance(clients["mum"], family_id, ids["kid"])["balance"] == 0


def test_praise_without_stars_from_anyone(family):
    clients, ids, family_id = family
    resp = _praise(clients["kid"], family_id, ids["mum"], "Thanks for the pancakes")
    assert resp.status_code == 201, resp.text
    assert resp.json()["amount"] == 0
    # A child cannot attach stars, and nobody praises themselves.
    assert _praise(clients["kid"], family_id, ids["dad"], "Great", amount=2).status_code == 403
    assert _praise(clients["mum"], family_id, ids["mum"], "Me").status_code == 400
    feed = clients["dad"].get("/rewards/praise", params={"family_id": family_id}).json()
    assert [item["message"] for item in feed] == ["Thanks for the pancakes"]
    assert _balance(clients["mum"], family_id, ids["mum"])["balance"] == 0

    db = TestSession()
    note = db.query(Notification).filter(Notification.user_id == ids["mum"], Notification.type == "praise").one()
    assert note.title == "Praise from Lena"
    assert note.body == "Thanks for the pancakes"
    db.close()


def test_praise_with_stars_and_taking_it_back(family):
    clients, ids, family_id = family
    resp = _praise(clients["mum"], family_id, ids["kid"], "Tidied up without asking", amount=3)
    assert resp.status_code == 201, resp.text
    assert _balance(clients["dad"], family_id, ids["kid"])["balance"] == 3
    # Parents collect too: one parent can thank the other with stars.
    assert _praise(clients["dad"], family_id, ids["mum"], "Took the night shift", amount=2).status_code == 201
    assert _balance(clients["dad"], family_id, ids["mum"])["balance"] == 2

    assert clients["kid"].delete(f"/rewards/praise/{resp.json()['id']}").status_code == 403
    assert clients["dad"].delete(f"/rewards/praise/{resp.json()['id']}").status_code == 200
    assert _balance(clients["mum"], family_id, ids["kid"])["balance"] == 0


def test_personal_goal_redeem_approve_and_give(family):
    clients, ids, family_id = family
    cinema = _wish(clients["mum"], family_id, "Cinema", 5)
    _praise(clients["mum"], family_id, ids["kid"], "Homework", amount=6)

    resp = clients["kid"].put("/rewards/goal", json={"family_id": family_id, "reward_id": cinema["id"]})
    assert resp.status_code == 200, resp.text
    assert resp.json()["goal_reward_id"] == cinema["id"]
    assert _balance(clients["mum"], family_id, ids["kid"])["goal_reward_id"] == cinema["id"]

    redeem = clients["kid"].post("/rewards/transactions/redeem", json={"family_id": family_id, "reward_id": cinema["id"]})
    assert redeem.status_code == 201, redeem.text
    txn = redeem.json()
    assert txn["status"] == "pending" and txn["note"] == "Cinema"

    db = TestSession()
    asks = db.query(Notification).filter(Notification.type == "reward_request").all()
    assert sorted(n.user_id for n in asks) == sorted([ids["mum"], ids["dad"]])
    assert asks[0].title == "Cinema" and asks[0].body == "Lena would like to redeem this"
    db.close()

    # Not given before it is approved.
    assert clients["mum"].patch(f"/rewards/transactions/{txn['id']}/fulfill").status_code == 400
    assert clients["mum"].patch(f"/rewards/transactions/{txn['id']}/confirm").status_code == 200
    # The wish came true, so the goal is free for the next one.
    kid = _balance(clients["mum"], family_id, ids["kid"])
    assert kid["balance"] == 1 and kid["goal_reward_id"] is None
    assert clients["kid"].patch(f"/rewards/transactions/{txn['id']}/fulfill").status_code == 403
    given = clients["dad"].patch(f"/rewards/transactions/{txn['id']}/fulfill")
    assert given.status_code == 200 and given.json()["fulfilled_at"]


def test_only_personal_wishes_can_be_goals_or_bought(family):
    clients, ids, family_id = family
    trip = _wish(clients["mum"], family_id, "Zoo trip", 10, kind="family")
    assert clients["kid"].put("/rewards/goal", json={"family_id": family_id, "reward_id": trip["id"]}).status_code == 400
    assert clients["kid"].post(
        "/rewards/transactions/redeem", json={"family_id": family_id, "reward_id": trip["id"]},
    ).status_code == 400
    assert clients["kid"].put("/rewards/goal", json={"family_id": family_id, "reward_id": None}).status_code == 200


def test_family_goal_everyone_puts_in(family):
    clients, ids, family_id = family
    trip = _wish(clients["mum"], family_id, "Zoo trip", 10, kind="family")
    assert trip["kind"] == "family" and trip["progress"] == 0
    _praise(clients["mum"], family_id, ids["kid"], "Garden", amount=4)
    _praise(clients["mum"], family_id, ids["dad"], "Cooked", amount=9)

    resp = clients["kid"].post(f"/rewards/goals/{trip['id']}/give", json={"family_id": family_id, "amount": 3})
    assert resp.status_code == 200, resp.text
    assert resp.json()["progress"] == 3
    # More than one has is refused; more than the goal needs is capped.
    assert clients["kid"].post(
        f"/rewards/goals/{trip['id']}/give", json={"family_id": family_id, "amount": 5},
    ).status_code == 400
    resp = clients["dad"].post(f"/rewards/goals/{trip['id']}/give", json={"family_id": family_id, "amount": 9})
    assert resp.json()["progress"] == 10
    assert sorted((c["user_id"], c["amount"]) for c in resp.json()["contributions"]) == sorted(
        [(ids["kid"], 3), (ids["dad"], 7)],
    )
    assert _balance(clients["mum"], family_id, ids["dad"])["balance"] == 2
    assert clients["kid"].post(
        f"/rewards/goals/{trip['id']}/give", json={"family_id": family_id, "amount": 1},
    ).status_code == 400

    assert clients["kid"].post(f"/rewards/goals/{trip['id']}/achieve", params={"family_id": family_id}).status_code == 403
    done = clients["mum"].post(f"/rewards/goals/{trip['id']}/achieve", params={"family_id": family_id})
    assert done.status_code == 200, done.text
    assert done.json()["achieved_at"] and done.json()["is_active"] is False
    catalog = clients["kid"].get("/rewards/catalog", params={"family_id": family_id}).json()
    assert catalog[0]["progress"] == 10


def test_family_goal_is_celebrated_only_when_full(family):
    clients, ids, family_id = family
    trip = _wish(clients["mum"], family_id, "Pizza night", 10, kind="family")
    assert clients["mum"].post(
        f"/rewards/goals/{trip['id']}/achieve", params={"family_id": family_id},
    ).status_code == 400


def test_praise_presets_can_be_plain_thanks(family):
    clients, ids, family_id = family
    currency = _currency(clients["mum"], family_id)
    resp = clients["mum"].post("/rewards/rules", json={
        "family_id": family_id, "currency_id": currency["id"], "name": "Helped without asking", "amount": 0,
    })
    assert resp.status_code == 201, resp.text
    assert resp.json()["amount"] == 0


def test_done_task_brings_stars_without_any_setup(family):
    clients, ids, family_id = family
    task = clients["mum"].post("/tasks", json={
        "family_id": family_id, "title": "Feed the cat", "assigned_to_user_id": ids["kid"],
        "token_reward_amount": 2, "token_require_confirmation": False,
    })
    assert task.status_code == 200, task.text
    done = clients["kid"].patch(f"/tasks/{task.json()['id']}", json={"status": "done"})
    assert done.status_code == 200, done.text
    assert _balance(clients["mum"], family_id, ids["kid"])["balance"] == 2

