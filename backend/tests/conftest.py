"""Fixtures shared by the backend tests.

Modules opt in, usually with ``pytestmark = pytest.mark.usefixtures("app_db")``.
Tests that need a real database of their own (PostgreSQL, alembic
migrations) keep their own setup.
"""

from __future__ import annotations

import os
import re
import tempfile
from pathlib import Path

import pytest
from sqlalchemy import func, select
from sqlalchemy.engine import make_url

from tests.support import TestSession, engine, foreign_keys_enabled, freeze_scheduler_in_utc, sqlite_engine

REPO_ROOT = Path(__file__).resolve().parents[2]

# The Radicale mount reads its storage folder when ``app.main`` is first
# imported, which happens while test modules are collected. Radicale keeps
# nothing there (DAV data lives in the database), so a throwaway folder does,
# unless the run configures one.
if not os.environ.get("DAV_STORAGE_FOLDER"):
    _dav_storage = tempfile.TemporaryDirectory(prefix="tribu-dav-test-")
    os.environ["DAV_STORAGE_FOLDER"] = _dav_storage.name


@pytest.fixture
def app_db():
    """Fresh tables in the shared in-memory database, served to the app via ``get_db``."""
    from app.database import Base, get_db
    from app.main import app

    if not foreign_keys_enabled():
        with engine.connect() as conn:
            conn.exec_driver_sql("PRAGMA foreign_keys=ON")
    Base.metadata.create_all(bind=engine)

    def _session():
        with TestSession() as db:
            yield db

    app.dependency_overrides[get_db] = _session
    yield
    app.dependency_overrides.pop(get_db, None)
    leaked = not foreign_keys_enabled()
    if leaked:
        with engine.connect() as conn:
            conn.exec_driver_sql("PRAGMA foreign_keys=ON")
    Base.metadata.drop_all(bind=engine)
    assert not leaked, "the test left PRAGMA foreign_keys off on the shared connection"


@pytest.fixture
def file_db(app_db, tmp_path):
    """``app_db`` on a SQLite file, so that every session has its own
    connection: for tests about what concurrent writers see."""
    from app.database import Base

    file_engine = sqlite_engine(f"sqlite:///{tmp_path / 'app.db'}")
    Base.metadata.create_all(bind=file_engine)
    TestSession.configure(bind=file_engine)
    yield
    TestSession.configure(bind=engine)
    file_engine.dispose()


@pytest.fixture
def scheduler_db(app_db, monkeypatch):
    """``app_db``, also used by the scheduler's own sessions."""
    from app.core import scheduler as scheduler_module

    monkeypatch.setattr(scheduler_module, "SessionLocal", TestSession)


@pytest.fixture
def berlin_tz(monkeypatch):
    """The app's local time zone is Europe/Berlin."""
    from app.core.clock import app_timezone

    monkeypatch.setenv("TZ", "Europe/Berlin")
    app_timezone.cache_clear()
    yield
    app_timezone.cache_clear()


@pytest.fixture
def reminder_db(scheduler_db, monkeypatch):
    """``scheduler_db`` for the event reminder tests: the scheduler's clock
    stands at ``reminder_support.NOW`` and local time equals UTC."""
    from tests.reminder_support import NOW

    freeze_scheduler_in_utc(monkeypatch, NOW)


@pytest.fixture
def destinations(monkeypatch):
    """Records what would go to the family's notification destinations."""
    from app.core import scheduler as scheduler_module

    calls: list[dict] = []
    monkeypatch.setattr(scheduler_module, "dispatch_family_notification", lambda **kwargs: calls.append(kwargs))
    return calls


@pytest.fixture
def shopping_broadcasts(monkeypatch):
    """Records the shopping router's WebSocket broadcasts (their positional arguments) instead of sending them."""
    from app.modules import shopping_router

    events: list[tuple] = []
    monkeypatch.setattr(shopping_router, "broadcast_shopping_event", lambda *args, **kwargs: events.append(args))
    return events


def _is_test_database(url: str) -> bool:
    """Whether ``url`` names a database the tests may write to and clean up:
    an in-memory SQLite, a SQLite file in the repository or the temp folder,
    or any database whose name has a word starting with "test"."""
    parsed = make_url(url)
    name = parsed.database or ""
    if re.search(r"(?<![a-z])test", Path(name).name.lower()):
        return True
    if parsed.get_backend_name() != "sqlite":
        return False
    if name in ("", ":memory:"):
        return True
    path = Path(name).resolve()
    return any(path.is_relative_to(root) for root in (REPO_ROOT, Path(tempfile.gettempdir()).resolve()))


@pytest.fixture(scope="module")
def production_db():
    """The tables of the production database (``DATABASE_URL``), for code
    that opens ``app.database.SessionLocal`` itself, such as the DAV auth and
    storage plugins; seed it with ``SessionLocal()`` too.

    Refuses anything but a test database, and never drops tables: use
    ``production_rows`` to remove what a test adds.
    """
    from app.database import DATABASE_URL, Base, engine as production_engine

    if not _is_test_database(DATABASE_URL):
        pytest.fail(f"DATABASE_URL={make_url(DATABASE_URL)!r} is not a test database; refusing to write to it", pytrace=False)
    Base.metadata.create_all(bind=production_engine)


@pytest.fixture
def production_rows(production_db):
    """Deletes the rows the test adds to ``production_db``, and only those:
    rows with an id above the highest one at the start of the test, and in
    tables keyed otherwise, rows whose key was not there yet."""
    from app.database import Base, engine as production_engine

    tables = [table for table in Base.metadata.sorted_tables if len(table.primary_key.columns) == 1]
    with production_engine.connect() as conn:
        before = {}
        for table in tables:
            (key,) = table.primary_key.columns
            if key.name == "id":
                before[table] = conn.execute(select(func.max(key))).scalar() or 0
            else:
                before[table] = set(conn.execute(select(key)).scalars())
    yield
    with production_engine.begin() as conn:
        for table in reversed(tables):
            (key,) = table.primary_key.columns
            added = key > before[table] if key.name == "id" else key.not_in(before[table])
            conn.execute(table.delete().where(added))


@pytest.fixture(scope="module")
def dav_app(production_db):
    """The app, whose Radicale mount works on ``production_db``."""
    from app.main import app

    return app


@pytest.fixture
def oidc_db(app_db):
    """``app_db``, and the OIDC discovery cache is emptied after the test."""
    from app.core import oidc as oidc_core

    yield
    oidc_core.invalidate_discovery_cache()


@pytest.fixture
def checkpw_calls(monkeypatch):
    """Records every bcrypt check, to prove a login did the full password work."""
    from app import security

    calls = []
    real_checkpw = security.bcrypt.checkpw
    monkeypatch.setattr(security.bcrypt, "checkpw", lambda *args: calls.append(args) or real_checkpw(*args))
    return calls


@pytest.fixture
def reset_rate_limits():
    """Lets each test sign in as often as it needs."""
    from app.main import limiter as app_limiter
    from app.modules.mfa_router import limiter as mfa_limiter

    app_limiter.reset()
    mfa_limiter.reset()
