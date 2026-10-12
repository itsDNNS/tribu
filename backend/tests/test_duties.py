"""Weekly duties: default people per weekday, exceptions per date, created tasks."""

from __future__ import annotations

import hashlib
from datetime import date, datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401 - ensure all models are registered before create_all
from app.core import duties as duties_core
from app.database import Base, get_db
from app.main import app
from app.models import DutyException, Family, Membership, PersonalAccessToken, Task, User
from app.modules import duties_router
from app.security import PAT_PREFIX, hash_password

engine = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
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


class Clock:
    def __init__(self, monkeypatch):
        self.now = datetime(2026, 12, 7, 8, 0)  # a Monday
        monkeypatch.setattr(duties_core, "local_wall_now", lambda _now=None: self.now)
        monkeypatch.setattr(duties_router, "local_today", lambda: self.now.date())


@pytest.fixture
def clock(monkeypatch):
    return Clock(monkeypatch)


client = TestClient(app)


def _token(db, user: User, name: str) -> str:
    plain = f"{PAT_PREFIX}duties-{name}"
    lookup = hashlib.sha256(plain.encode()).hexdigest()
    db.add(PersonalAccessToken(
        user_id=user.id, name=f"duties-{name}", token_hash=lookup, token_lookup=lookup,
        scopes="tasks:read,tasks:write,families:write,profile:write",
    ))
    return plain


@pytest.fixture
def family():
    db = TestSession()
    try:
        home = Family(name="Home")
        other = Family(name="Neighbours")
        users = {
            name: User(email=f"{name}@example.com", password_hash=hash_password("Password123"), display_name=name)
            for name in ("anna", "ben", "kid", "stranger")
        }
        db.add_all([home, other, *users.values()])
        db.flush()
        db.add_all([
            Membership(user_id=users["anna"].id, family_id=home.id, role="admin", is_adult=True),
            Membership(user_id=users["ben"].id, family_id=home.id, role="member", is_adult=True),
            Membership(user_id=users["kid"].id, family_id=home.id, role="member", is_adult=False),
            Membership(user_id=users["stranger"].id, family_id=other.id, role="admin", is_adult=True),
        ])
        result = {
            "family_id": home.id,
            "anna": users["anna"].id,
            "ben": users["ben"].id,
            "kid": users["kid"].id,
            "stranger": users["stranger"].id,
            "anna_token": _token(db, users["anna"], "anna"),
            "ben_token": _token(db, users["ben"], "ben"),
            "kid_token": _token(db, users["kid"], "kid"),
            "stranger_token": _token(db, users["stranger"], "stranger"),
        }
        db.commit()
        return result
    finally:
        db.close()


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _create_pickup(family, **overrides) -> dict:
    """Pick up the kids at 15:30: Anna on Monday and Tuesday, Ben Wednesday to Friday."""
    payload = {
        "family_id": family["family_id"],
        "title": "Pick up the kids",
        "due_time": "15:30",
        "slots": [
            {"weekday": 0, "assigned_to_user_id": family["anna"]},
            {"weekday": 1, "assigned_to_user_id": family["anna"]},
            {"weekday": 2, "assigned_to_user_id": family["ben"]},
            {"weekday": 3, "assigned_to_user_id": family["ben"]},
            {"weekday": 4, "assigned_to_user_id": family["ben"]},
        ],
        **overrides,
    }
    resp = client.post("/duties", headers=_auth(family["anna_token"]), json=payload)
    assert resp.status_code == 200, resp.text
    return resp.json()


def _duty_tasks(duty_id: int) -> dict[date, Task]:
    db = TestSession()
    try:
        return {task.duty_date: task for task in db.query(Task).filter(Task.duty_id == duty_id)}
    finally:
        db.close()


def _run_job() -> int:
    db = TestSession()
    try:
        return duties_core.sync_all_duties(db)
    finally:
        db.close()


def test_creating_a_duty_creates_assigned_tasks_for_the_coming_week(clock, family):
    duty = _create_pickup(family)

    tasks = _duty_tasks(duty["id"])
    assert {day: task.assigned_to_user_id for day, task in tasks.items()} == {
        date(2026, 12, 7): family["anna"],
        date(2026, 12, 8): family["anna"],
        date(2026, 12, 9): family["ben"],
        date(2026, 12, 10): family["ben"],
        date(2026, 12, 11): family["ben"],
    }
    monday = tasks[date(2026, 12, 7)]
    assert monday.title == "Pick up the kids"
    assert monday.due_date == datetime(2026, 12, 7, 15, 30)
    assert monday.due_is_date is False

    listed = client.get(f"/tasks?family_id={family['family_id']}", headers=_auth(family["anna_token"])).json()["items"]
    assert {item["duty_date"] for item in listed} == {d.isoformat() for d in tasks}
    assert {item["duty_id"] for item in listed} == {duty["id"]}

    assert _run_job() == 0, "a second run must not create the same dates again"


def test_a_change_months_ahead_applies_once_and_leaves_the_pattern(clock, family):
    duty = _create_pickup(family)
    trip_tuesday = date(2026, 12, 22)

    resp = client.put(
        f"/duties/{duty['id']}/exceptions/{trip_tuesday}",
        headers=_auth(family["anna_token"]),
        json={"assigned_to_user_id": family["ben"]},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["exceptions"] == [{"date": "2026-12-22", "assigned_to_user_id": family["ben"], "skipped": False}]
    assert trip_tuesday not in _duty_tasks(duty["id"]), "dates beyond the coming week get no task yet"

    week = client.get(
        f"/duties/week?family_id={family['family_id']}&start=2026-12-21", headers=_auth(family["anna_token"]),
    ).json()
    tuesday = next(occ for occ in week if occ["date"] == "2026-12-22")
    assert tuesday["assigned_to_user_id"] == family["ben"]
    assert tuesday["default_assigned_to_user_id"] == family["anna"]
    assert tuesday["is_exception"] is True
    assert tuesday["task_id"] is None

    clock.now = datetime(2026, 12, 21, 7, 0)
    _run_job()
    assert _duty_tasks(duty["id"])[trip_tuesday].assigned_to_user_id == family["ben"]

    clock.now = datetime(2026, 12, 28, 7, 0)
    _run_job()
    assert _duty_tasks(duty["id"])[date(2026, 12, 29)].assigned_to_user_id == family["anna"], "a one-off change never carries over"


def test_reassigning_a_duty_task_is_kept_for_that_date_only(clock, family):
    duty = _create_pickup(family)
    tuesday = _duty_tasks(duty["id"])[date(2026, 12, 8)]

    resp = client.patch(f"/tasks/{tuesday.id}", headers=_auth(family["anna_token"]), json={"assigned_to_user_id": family["ben"]})
    assert resp.status_code == 200, resp.text

    # Editing the duty rewrites its open tasks; the reassignment survives as an exception.
    resp = client.patch(f"/duties/{duty['id']}", headers=_auth(family["anna_token"]), json={"title": "Fetch the kids"})
    assert resp.status_code == 200, resp.text
    tasks = _duty_tasks(duty["id"])
    assert tasks[date(2026, 12, 8)].assigned_to_user_id == family["ben"]
    assert tasks[date(2026, 12, 8)].title == "Fetch the kids"
    assert tasks[date(2026, 12, 7)].assigned_to_user_id == family["anna"]

    # Giving it back to the default person leaves no exception behind.
    client.patch(f"/tasks/{tuesday.id}", headers=_auth(family["anna_token"]), json={"assigned_to_user_id": family["anna"]})
    db = TestSession()
    try:
        assert db.query(DutyException).count() == 0
    finally:
        db.close()


def test_deleting_a_duty_task_skips_its_date(clock, family):
    duty = _create_pickup(family)
    wednesday = _duty_tasks(duty["id"])[date(2026, 12, 9)]

    assert client.delete(f"/tasks/{wednesday.id}", headers=_auth(family["anna_token"])).status_code == 200
    _run_job()

    assert date(2026, 12, 9) not in _duty_tasks(duty["id"])
    week = client.get(
        f"/duties/week?family_id={family['family_id']}&start=2026-12-07", headers=_auth(family["anna_token"]),
    ).json()
    assert next(occ for occ in week if occ["date"] == "2026-12-09")["skipped"] is True

    # Undoing the change brings the task back.
    resp = client.delete(f"/duties/{duty['id']}/exceptions/2026-12-09", headers=_auth(family["anna_token"]))
    assert resp.status_code == 200
    assert _duty_tasks(duty["id"])[date(2026, 12, 9)].assigned_to_user_id == family["ben"]


def test_changing_the_pattern_updates_open_tasks_but_never_done_ones(clock, family):
    duty = _create_pickup(family)
    monday = _duty_tasks(duty["id"])[date(2026, 12, 7)]
    client.patch(f"/tasks/{monday.id}", headers=_auth(family["anna_token"]), json={"status": "done"})

    resp = client.patch(
        f"/duties/{duty['id']}",
        headers=_auth(family["anna_token"]),
        json={
            "due_time": "16:00",
            "slots": [
                {"weekday": 0, "assigned_to_user_id": family["ben"]},
                {"weekday": 1, "assigned_to_user_id": family["ben"]},
                {"weekday": 2, "assigned_to_user_id": family["ben"]},
                {"weekday": 3, "assigned_to_user_id": family["anna"]},
            ],
        },
    )
    assert resp.status_code == 200, resp.text

    tasks = _duty_tasks(duty["id"])
    assert tasks[date(2026, 12, 7)].status == "done"
    assert tasks[date(2026, 12, 7)].assigned_to_user_id == family["anna"]
    assert tasks[date(2026, 12, 7)].due_date == datetime(2026, 12, 7, 15, 30)
    assert tasks[date(2026, 12, 8)].assigned_to_user_id == family["ben"]
    assert tasks[date(2026, 12, 8)].due_date == datetime(2026, 12, 8, 16, 0)
    assert tasks[date(2026, 12, 10)].assigned_to_user_id == family["anna"]
    assert date(2026, 12, 11) not in tasks, "Friday left the pattern, so its open task goes"


def test_deleting_a_duty_keeps_done_and_overdue_tasks(clock, family):
    duty = _create_pickup(family)
    tasks = _duty_tasks(duty["id"])
    client.patch(f"/tasks/{tasks[date(2026, 12, 7)].id}", headers=_auth(family["anna_token"]), json={"status": "done"})

    clock.now = datetime(2026, 12, 9, 8, 0)
    assert client.delete(f"/duties/{duty['id']}", headers=_auth(family["anna_token"])).status_code == 200

    db = TestSession()
    try:
        remaining = sorted((task.duty_date, task.status, task.duty_id) for task in db.query(Task))
        # Monday is done and Tuesday still waits to be done; Wednesday on goes with the duty.
        assert remaining == [(date(2026, 12, 7), "done", None), (date(2026, 12, 8), "open", None)]
    finally:
        db.close()


def test_a_timed_date_that_already_passed_today_gets_no_task(clock, family):
    clock.now = datetime(2026, 12, 7, 16, 0)
    duty = _create_pickup(family)
    assert date(2026, 12, 7) not in _duty_tasks(duty["id"])

    whole_day = _create_pickup(family, title="Water the plants", due_time=None)
    task = _duty_tasks(whole_day["id"])[date(2026, 12, 7)]
    assert task.due_is_date is True


def test_only_adults_change_duties_and_input_is_checked(clock, family):
    duty = _create_pickup(family)
    kid = _auth(family["kid_token"])
    anna = _auth(family["anna_token"])

    assert client.get(f"/duties?family_id={family['family_id']}", headers=kid).status_code == 200
    assert client.patch(f"/duties/{duty['id']}", headers=kid, json={"title": "Mine"}).status_code == 403
    assert client.put(f"/duties/{duty['id']}/exceptions/2026-12-08", headers=kid, json={}).status_code == 403

    saturday = client.put(f"/duties/{duty['id']}/exceptions/2026-12-12", headers=anna, json={})
    assert saturday.status_code == 400
    assert saturday.json()["detail"]["code"] == "INVALID_DUTY_DATE"
    assert client.put(f"/duties/{duty['id']}/exceptions/2026-12-01", headers=anna, json={}).status_code == 400

    outsider = client.put(
        f"/duties/{duty['id']}/exceptions/2026-12-08", headers=anna, json={"assigned_to_user_id": family["stranger"]},
    )
    assert outsider.status_code == 400
    assert outsider.json()["detail"]["code"] == "ASSIGNEE_NOT_FAMILY_MEMBER"

    twice = client.post("/duties", headers=anna, json={
        "family_id": family["family_id"], "title": "Bins", "slots": [{"weekday": 0}, {"weekday": 0}],
    })
    assert twice.status_code == 422


def test_a_change_only_rewrites_what_changed(clock, family):
    duty = _create_pickup(family)
    anna = _auth(family["anna_token"])
    tasks = _duty_tasks(duty["id"])
    client.patch(f"/tasks/{tasks[date(2026, 12, 8)].id}", headers=anna, json={"due_date": "2026-12-08T17:00:00"})
    client.patch(f"/tasks/{tasks[date(2026, 12, 9)].id}", headers=anna, json={"title": "Pick up the kids and Max"})

    client.patch(f"/duties/{duty['id']}", headers=anna, json={"title": "Fetch the kids"})
    client.put(f"/duties/{duty['id']}/exceptions/2026-12-10", headers=anna, json={"assigned_to_user_id": family["anna"]})
    _run_job()
    tasks = _duty_tasks(duty["id"])
    assert tasks[date(2026, 12, 8)].due_date == datetime(2026, 12, 8, 17, 0), "a new title keeps a moved task where it is"
    assert tasks[date(2026, 12, 8)].title == "Fetch the kids"
    assert tasks[date(2026, 12, 10)].assigned_to_user_id == family["anna"]
    assert tasks[date(2026, 12, 10)].title == "Fetch the kids"

    client.patch(f"/duties/{duty['id']}", headers=anna, json={"due_time": "16:00"})
    assert _duty_tasks(duty["id"])[date(2026, 12, 8)].due_date == datetime(2026, 12, 8, 16, 0), "a new time applies to every open date"


def test_the_job_leaves_existing_tasks_alone(clock, family):
    duty = _create_pickup(family)
    wednesday = _duty_tasks(duty["id"])[date(2026, 12, 9)]
    client.patch(f"/tasks/{wednesday.id}", headers=_auth(family["anna_token"]), json={"title": "Bring the cake too"})

    _run_job()
    assert _duty_tasks(duty["id"])[date(2026, 12, 9)].title == "Bring the cake too"


def test_tasks_reach_exactly_seven_days_ahead(clock, family):
    duty = _create_pickup(family, slots=[
        {"weekday": 6, "assigned_to_user_id": family["anna"]},
        {"weekday": 0, "assigned_to_user_id": family["ben"]},
    ])
    assert sorted(_duty_tasks(duty["id"])) == [date(2026, 12, 7), date(2026, 12, 13)]

    clock.now = datetime(2026, 12, 8, 0, 5)
    _run_job()
    assert sorted(_duty_tasks(duty["id"])) == [date(2026, 12, 7), date(2026, 12, 13), date(2026, 12, 14)]


def test_the_week_shows_who_did_a_done_task(clock, family):
    duty = _create_pickup(family)
    anna = _auth(family["anna_token"])
    monday = _duty_tasks(duty["id"])[date(2026, 12, 7)]
    client.patch(f"/tasks/{monday.id}", headers=anna, json={"status": "done"})
    slots = [{"weekday": day, "assigned_to_user_id": family["ben"]} for day in range(5)]
    client.patch(f"/duties/{duty['id']}", headers=anna, json={"slots": slots})

    week = client.get(f"/duties/week?family_id={family['family_id']}&start=2026-12-07", headers=anna).json()
    first = week[0]
    assert (first["date"], first["assigned_to_user_id"], first["task_status"]) == ("2026-12-07", family["anna"], "done")
    assert first["default_assigned_to_user_id"] == family["ben"]

    before = client.get(f"/duties/week?family_id={family['family_id']}&start=2026-01-05", headers=anna)
    assert before.json() == [], "dates before the duty existed are not part of it"


def test_choosing_the_default_person_for_a_date_is_no_exception(clock, family):
    duty = _create_pickup(family)
    anna = _auth(family["anna_token"])
    client.put(f"/duties/{duty['id']}/exceptions/2026-12-22", headers=anna, json={"assigned_to_user_id": family["ben"]})

    resp = client.put(f"/duties/{duty['id']}/exceptions/2026-12-22", headers=anna, json={"assigned_to_user_id": family["anna"]})
    assert resp.json()["exceptions"] == []


def _keep_ben_in_another_family(family) -> None:
    """Without another membership Ben's account goes, and its foreign keys clear him anyway."""
    db = TestSession()
    try:
        other = db.query(Membership).filter(Membership.user_id == family["stranger"]).one().family_id
        db.add(Membership(user_id=family["ben"], family_id=other, role="member", is_adult=True))
        db.commit()
    finally:
        db.close()


def test_a_member_who_leaves_drops_out_of_duties(clock, family):
    duty = _create_pickup(family)
    anna = _auth(family["anna_token"])
    client.put(f"/duties/{duty['id']}/exceptions/2026-12-22", headers=anna, json={"assigned_to_user_id": family["ben"]})
    _keep_ben_in_another_family(family)

    removed = client.delete(f"/families/{family['family_id']}/members/{family['ben']}", headers=anna)
    assert removed.json()["user_deleted"] is False

    listed = client.get(f"/duties?family_id={family['family_id']}", headers=anna).json()[0]
    assert {slot["assigned_to_user_id"] for slot in listed["slots"] if slot["weekday"] >= 2} == {None}
    assert listed["exceptions"][0]["assigned_to_user_id"] is None
    tasks = _duty_tasks(duty["id"])
    assert tasks[date(2026, 12, 9)].assigned_to_user_id is None
    assert tasks[date(2026, 12, 7)].assigned_to_user_id == family["anna"]


def test_other_families_cannot_see_or_change_duties(clock, family):
    duty = _create_pickup(family)
    stranger = _auth(family["stranger_token"])
    fid = family["family_id"]

    assert client.get(f"/duties?family_id={fid}", headers=stranger).status_code == 403
    assert client.get(f"/duties/week?family_id={fid}&start=2026-12-07", headers=stranger).status_code == 403
    assert client.patch(f"/duties/{duty['id']}", headers=stranger, json={"title": "Mine"}).status_code == 403
    assert client.put(f"/duties/{duty['id']}/exceptions/2026-12-08", headers=stranger, json={}).status_code == 403
    assert client.delete(f"/duties/{duty['id']}", headers=stranger).status_code == 403
    assert client.post("/duties", headers=stranger, json={
        "family_id": fid, "title": "Bins", "slots": [{"weekday": 0}],
    }).status_code == 403


def test_dates_far_away_are_refused(clock, family):
    duty = _create_pickup(family)
    anna = _auth(family["anna_token"])

    assert client.get(f"/duties/week?family_id={family['family_id']}&start=9999-12-27", headers=anna).status_code == 400
    assert client.put(f"/duties/{duty['id']}/exceptions/2029-03-05", headers=anna, json={}).status_code == 400


def test_changing_a_past_duty_task_leaves_no_exception(clock, family):
    duty = _create_pickup(family)
    monday = _duty_tasks(duty["id"])[date(2026, 12, 7)]

    clock.now = datetime(2026, 12, 9, 8, 0)
    client.delete(f"/tasks/{monday.id}", headers=_auth(family["anna_token"]))

    db = TestSession()
    try:
        assert db.query(DutyException).count() == 0
    finally:
        db.close()


def test_leaving_the_family_drops_out_of_duties(clock, family):
    duty = _create_pickup(family)
    _keep_ben_in_another_family(family)

    left = client.post("/auth/me/leave-family", headers=_auth(family["ben_token"]), json={"family_id": family["family_id"]})
    assert left.status_code == 200, left.text

    listed = client.get(f"/duties?family_id={family['family_id']}", headers=_auth(family["anna_token"])).json()[0]
    assert {slot["assigned_to_user_id"] for slot in listed["slots"] if slot["weekday"] >= 2} == {None}
    assert _duty_tasks(duty["id"])[date(2026, 12, 9)].assigned_to_user_id is None


def _create_alternating(family) -> dict:
    """Pick up the kids on Monday: Anna in weeks A, Ben in weeks B; this week (from Dec 7) is A."""
    return _create_pickup(family, alternate_from="2026-12-07", slots=[
        {"weekday": 0, "assigned_to_user_id": family["anna"], "alternate_assigned_to_user_id": family["ben"]},
    ])


def test_alternating_weeks_take_turns(clock, family):
    duty = _create_alternating(family)
    anna = _auth(family["anna_token"])
    assert _duty_tasks(duty["id"])[date(2026, 12, 7)].assigned_to_user_id == family["anna"]

    week = lambda start: client.get(f"/duties/week?family_id={family['family_id']}&start={start}", headers=anna).json()
    assert [occ["assigned_to_user_id"] for occ in week("2026-12-14")] == [family["ben"]]
    assert [occ["assigned_to_user_id"] for occ in week("2026-12-21")] == [family["anna"]]

    clock.now = datetime(2026, 12, 14, 7, 0)
    _run_job()
    assert _duty_tasks(duty["id"])[date(2026, 12, 14)].assigned_to_user_id == family["ben"]

    # Ben on Dec 28 (week B) is the usual person there, so no exception; Anna is one.
    resp = client.put(f"/duties/{duty['id']}/exceptions/2026-12-28", headers=anna, json={"assigned_to_user_id": family["ben"]})
    assert resp.json()["exceptions"] == []
    resp = client.put(f"/duties/{duty['id']}/exceptions/2026-12-28", headers=anna, json={"assigned_to_user_id": family["anna"]})
    assert resp.json()["exceptions"] == [{"date": "2026-12-28", "assigned_to_user_id": family["anna"], "skipped": False}]


def test_turning_the_weeks_around_reassigns_open_tasks(clock, family):
    duty = _create_alternating(family)
    anna = _auth(family["anna_token"])

    resp = client.patch(f"/duties/{duty['id']}", headers=anna, json={"alternate_from": "2026-11-30"})
    assert resp.status_code == 200, resp.text
    assert resp.json()["alternate_from"] == "2026-11-30"
    assert _duty_tasks(duty["id"])[date(2026, 12, 7)].assigned_to_user_id == family["ben"]

    resp = client.patch(f"/duties/{duty['id']}", headers=anna, json={"alternate_from": None})
    assert resp.json()["alternate_from"] is None
    assert _duty_tasks(duty["id"])[date(2026, 12, 7)].assigned_to_user_id == family["anna"]

    assert client.patch(f"/duties/{duty['id']}", headers=anna, json={"alternate_from": "2026-12-08"}).status_code == 422


def test_reassigning_a_week_b_task_to_its_usual_person_leaves_no_exception(clock, family):
    duty = _create_alternating(family)
    clock.now = datetime(2026, 12, 14, 7, 0)
    _run_job()
    monday = _duty_tasks(duty["id"])[date(2026, 12, 14)]
    anna = _auth(family["anna_token"])

    client.patch(f"/tasks/{monday.id}", headers=anna, json={"assigned_to_user_id": family["anna"]})
    client.patch(f"/tasks/{monday.id}", headers=anna, json={"assigned_to_user_id": family["ben"]})
    db = TestSession()
    try:
        assert db.query(DutyException).count() == 0
    finally:
        db.close()


def test_a_member_who_leaves_drops_out_of_alternate_weeks(clock, family):
    duty = _create_alternating(family)
    _keep_ben_in_another_family(family)
    client.delete(f"/families/{family['family_id']}/members/{family['ben']}", headers=_auth(family["anna_token"]))

    listed = client.get(f"/duties?family_id={family['family_id']}", headers=_auth(family["anna_token"])).json()
    assert listed[0]["slots"][0]["alternate_assigned_to_user_id"] is None
    assert listed[0]["slots"][0]["assigned_to_user_id"] == family["anna"]
