"""Pieces that let several backend workers run side by side (issue #494)."""

import json

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core import scheduler as scheduler_module
from app.core import scheduler_leader, ws_broadcast
from app.core.rate_limits import limiter_storage_options
from app.database import Base
from app.models import SystemSetting


def test_only_one_holder_gets_the_scheduler_lock(tmp_path):
    path = str(tmp_path / "scheduler.lock")
    first, second = scheduler_leader.FileLock(path), scheduler_leader.FileLock(path)

    assert first.acquire() is True
    assert second.acquire() is False
    first.release()
    assert second.acquire() is True
    second.release()


def test_leader_starts_and_stops_the_scheduler_once(tmp_path):
    calls = []
    path = str(tmp_path / "scheduler.lock")
    leader = scheduler_leader.SchedulerLeader(lambda: calls.append("start"), lambda: calls.append("stop"), path=path)
    follower = scheduler_leader.SchedulerLeader(lambda: calls.append("follower"), lambda: None, path=path)

    assert leader.try_lead() is True
    assert leader.try_lead() is True
    assert follower.try_lead() is False
    leader.stop()
    assert calls == ["start", "stop"]
    # Once the leader is gone, a waiting process takes over.
    assert follower.try_lead() is True
    assert calls == ["start", "stop", "follower"]
    follower.stop()


def test_failed_start_hands_the_lock_back(tmp_path):
    path = str(tmp_path / "scheduler.lock")

    def boom():
        raise RuntimeError("scheduler broke")

    broken = scheduler_leader.SchedulerLeader(boom, lambda: None, path=path)
    assert broken.try_lead() is False
    assert scheduler_leader.FileLock(path).acquire() is True


def test_backup_schedule_is_applied_when_it_changes(tmp_path, monkeypatch):
    engine = create_engine(f"sqlite:///{tmp_path / 'settings.db'}")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    monkeypatch.setattr(scheduler_module, "SessionLocal", Session)
    monkeypatch.setattr(scheduler_module, "_applied_backup_schedule", None)
    applied = []
    monkeypatch.setattr(scheduler_module, "configure_backup_schedule", lambda *args: applied.append(args))

    assert scheduler_module.sync_backup_schedule("db", "/backups") is True
    assert scheduler_module.sync_backup_schedule("db", "/backups") is False
    with Session() as db:
        db.add_all([SystemSetting(key="backup_schedule", value="daily"), SystemSetting(key="backup_retention", value="3")])
        db.commit()
    assert scheduler_module.sync_backup_schedule("db", "/backups") is True
    assert applied == [("off", "db", "/backups", 7), ("daily", "db", "/backups", 3)]


class FakeValkey:
    def __init__(self, fail=False):
        self.fail = fail
        self.published = []

    def publish(self, channel, message):
        if self.fail:
            raise ConnectionError("gone")
        self.published.append((channel, json.loads(message)))


@pytest.fixture
def local_deliveries(monkeypatch):
    fired = []
    monkeypatch.setattr(ws_broadcast, "_fire", lambda factory: fired.append(factory))
    return fired


def test_events_go_through_valkey_when_the_relay_runs(monkeypatch, local_deliveries):
    from app.core import cache

    valkey = FakeValkey()
    monkeypatch.setattr(cache, "_get_client", lambda: valkey)
    monkeypatch.setattr(ws_broadcast, "_relay_ready", True)

    ws_broadcast.broadcast_shopping_event("list", 5, "item_added", {"item": {"id": 1}})

    assert valkey.published == [(ws_broadcast.CHANNEL, {"scope": "list", "id": 5, "event": {"type": "item_added", "item": {"id": 1}}})]
    assert local_deliveries == []


def test_events_stay_local_without_the_relay(monkeypatch, local_deliveries):
    from app.core import cache

    for ready, valkey in ((False, FakeValkey()), (True, FakeValkey(fail=True))):
        monkeypatch.setattr(cache, "_get_client", lambda valkey=valkey: valkey)
        monkeypatch.setattr(ws_broadcast, "_relay_ready", ready)
        ws_broadcast.broadcast_shopping_event("family", 7, "list_created", {})
    assert len(local_deliveries) == 2


def test_rate_limits_share_valkey_when_configured(monkeypatch):
    monkeypatch.delenv("REDIS_URL", raising=False)
    assert limiter_storage_options() == {}
    monkeypatch.setenv("REDIS_URL", "redis://valkey:6379/0")
    assert limiter_storage_options() == {"storage_uri": "redis://valkey:6379/0", "in_memory_fallback_enabled": True}
