"""Sync tokens name snapshots of what a DAV collection served."""

import pytest

from app.database import Base, SessionLocal, engine
from app.dav import sync_snapshots
from app.dav.sync_snapshots import SYNC_TOKEN_PREFIX, sync_changes
from app.models import DavSyncSnapshot


@pytest.fixture(autouse=True)
def tables():
    Base.metadata.create_all(bind=engine)
    yield
    db = SessionLocal()
    db.query(DavSyncSnapshot).delete()
    db.commit()
    db.close()


def test_changes_since_a_token():
    token, hrefs = sync_changes("cal:1", {"a.ics": '"1"', "b.ics": '"1"'})
    assert token.startswith(SYNC_TOKEN_PREFIX) and sorted(hrefs) == ["a.ics", "b.ics"]
    _, changed = sync_changes("cal:1", {"a.ics": '"2"', "c.ics": '"1"'}, token)
    assert sorted(changed) == ["a.ics", "b.ics", "c.ics"]


def test_the_same_state_gives_the_same_token_and_no_changes():
    token, _ = sync_changes("cal:1", {"a.ics": '"1"'})
    again, changed = sync_changes("cal:1", {"a.ics": '"1"'}, token)
    assert again == token and changed == []


def test_tokens_belong_to_their_collection():
    token, _ = sync_changes("cal:1", {"a.ics": '"1"'})
    with pytest.raises(ValueError):
        sync_changes("book:1", {"a.vcf": '"1"'}, token)


def test_old_snapshots_are_dropped(monkeypatch):
    monkeypatch.setattr(sync_snapshots, "KEEP_SNAPSHOTS", 2)
    first, _ = sync_changes("cal:2", {"a.ics": '"1"'})
    for version in range(2, 5):
        sync_changes("cal:2", {"a.ics": f'"{version}"'})
    with pytest.raises(ValueError):
        sync_changes("cal:2", {"a.ics": '"9"'}, first)
    db = SessionLocal()
    assert db.query(DavSyncSnapshot).filter(DavSyncSnapshot.collection_key == "cal:2").count() == 2
    db.close()
