"""Backend process runs, crash detection and the admin system status (issue #494)."""

import hashlib
import os
import tempfile
from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core import process_health
from app.database import Base, get_db
from app.main import app
from app.models import Family, Membership, Notification, PersonalAccessToken, ProcessRun, User
from app.security import PAT_PREFIX, hash_password

_DB_FD, _DB_PATH = tempfile.mkstemp(prefix="tribu-process-health-", suffix=".db")
os.close(_DB_FD)
engine = create_engine(f"sqlite:///{_DB_PATH}", connect_args={"check_same_thread": False})
TestSession = sessionmaker(bind=engine)
client = TestClient(app)
NOW = datetime(2026, 9, 27, 12, 0)


@pytest.fixture()
def db():
    Base.metadata.create_all(bind=engine)
    session = TestSession()
    yield session
    session.close()
    app.dependency_overrides.pop(get_db, None)
    Base.metadata.drop_all(bind=engine)


def _seed_users(db):
    family = Family(name="Health family")
    db.add(family)
    db.flush()
    tokens = []
    for name in ("owner", "other"):
        user = User(email=f"{name}@example.com", password_hash=hash_password("pw"), display_name=name.title())
        db.add(user)
        db.flush()
        db.add(Membership(user_id=user.id, family_id=family.id, role="admin", is_adult=True))
        plain = f"{PAT_PREFIX}health-{name}"
        lookup = hashlib.sha256(plain.encode()).hexdigest()
        db.add(PersonalAccessToken(user_id=user.id, name="pat", token_hash=lookup, token_lookup=lookup, scopes="*"))
        tokens.append(plain)
    db.commit()
    return tokens


def _dead_run(db, minutes_ago: int) -> ProcessRun:
    seen = NOW - timedelta(minutes=minutes_ago)
    run = ProcessRun(host="old", pid=1, version="v1", started_at=seen - timedelta(minutes=2), last_seen_at=seen)
    db.add(run)
    db.commit()
    return run


def test_clean_shutdown_is_not_a_crash(db):
    run_id = process_health.record_start(db, now=NOW - timedelta(minutes=10))
    process_health.record_stop(db, run_id, now=NOW - timedelta(minutes=9))
    current = process_health.record_start(db, now=NOW)

    assert process_health.heartbeat(db, current, now=NOW) == 0
    assert db.get(ProcessRun, run_id).crashed is False


def test_run_without_heartbeat_is_marked_as_crashed(db):
    killed = _dead_run(db, minutes_ago=5)
    fresh = _dead_run(db, minutes_ago=1)  # another process that is still alive
    current = process_health.record_start(db, now=NOW)

    assert process_health.heartbeat(db, current, now=NOW) == 1
    db.expire_all()
    assert db.get(ProcessRun, killed.id).crashed is True
    assert db.get(ProcessRun, killed.id).stopped_at == killed.last_seen_at
    assert db.get(ProcessRun, fresh.id).crashed is False
    assert db.get(ProcessRun, current).last_seen_at == NOW


def test_repeated_crashes_notify_the_instance_admin_once(db):
    _seed_users(db)
    for minutes in (50, 30, 10):
        _dead_run(db, minutes_ago=minutes)
    current = process_health.record_start(db, now=NOW)

    process_health.heartbeat(db, current, now=NOW)
    notes = db.query(Notification).all()
    assert [(n.user_id, n.type, n.title, n.body) for n in notes] == [
        (1, "system", "Tribu restarted unexpectedly", "The server stopped unexpectedly 3 times in the last hour."),
    ]

    # More crashes shortly after do not repeat the alert.
    for minutes in (8, 6):
        _dead_run(db, minutes_ago=minutes)
    process_health.heartbeat(db, current, now=NOW + timedelta(minutes=1))
    assert db.query(Notification).count() == 1


def test_a_single_crash_does_not_alert(db):
    _seed_users(db)
    _dead_run(db, minutes_ago=5)
    process_health.heartbeat(db, process_health.record_start(db, now=NOW), now=NOW)
    assert db.query(Notification).count() == 0


def test_old_runs_are_pruned(db):
    old = ProcessRun(host="h", pid=1, started_at=NOW - timedelta(days=40), last_seen_at=NOW - timedelta(days=40),
                     stopped_at=NOW - timedelta(days=40))
    db.add(old)
    db.commit()
    process_health.heartbeat(db, process_health.record_start(db, now=NOW), now=NOW)
    assert db.query(ProcessRun).count() == 1


def test_status_is_for_the_instance_admin(db, monkeypatch):
    from app.core.clock import utcnow

    owner, other = _seed_users(db)
    seen = utcnow() - timedelta(minutes=5)
    db.add(ProcessRun(host="old", pid=1, version="v1", started_at=seen - timedelta(minutes=2), last_seen_at=seen))
    db.commit()
    run_id = process_health.record_start(db)
    process_health.heartbeat(db, run_id)

    def _override():
        session = TestSession()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = _override
    monkeypatch.setattr(process_health, "current_run_id", lambda: run_id)

    denied = client.get("/admin/system/status", headers={"Authorization": f"Bearer {other}"})
    assert denied.status_code == 403
    resp = client.get("/admin/system/status", headers={"Authorization": f"Bearer {owner}"})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["crashes_last_day"] == 1 and body["crashes_last_week"] == 1
    assert body["recent_crashes"][0]["version"] == "v1"
    assert body["started_at"] is not None
    assert set(body) >= {"version", "rss_bytes", "limit_bytes"}


def test_memory_usage_reads_cgroup_limits(monkeypatch, tmp_path):
    status = tmp_path / "status"
    status.write_text("Name:\tpython\nVmRSS:\t  2048 kB\n")
    limit = tmp_path / "memory.max"
    limit.write_text("1073741824\n")
    real_path = process_health.Path

    def fake_path(value):
        mapping = {"/proc/self/status": status, "/sys/fs/cgroup/memory.max": limit}
        return real_path(mapping.get(value, tmp_path / "missing"))

    monkeypatch.setattr(process_health, "Path", fake_path)
    assert process_health.memory_usage() == {"rss_bytes": 2048 * 1024, "limit_bytes": 1073741824}
