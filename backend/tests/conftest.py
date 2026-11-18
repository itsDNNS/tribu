"""Fixtures shared by the backend tests.

Modules opt in, usually with ``pytestmark = pytest.mark.usefixtures("app_db")``.
Tests that need a real database of their own (PostgreSQL, alembic
migrations) keep their own setup.
"""

from __future__ import annotations

import os
import tempfile

import pytest

from tests.support import TestSession, engine, foreign_keys_enabled, freeze_scheduler_in_utc, sqlite_engine


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


@pytest.fixture(scope="module")
def production_db():
    """Tables in the production database (``DATABASE_URL``) for one module.

    For code that opens ``app.database.SessionLocal`` itself, such as the
    DAV auth and storage plugins; seed it with ``SessionLocal()`` too.
    """
    from app.database import Base, engine as production_engine

    Base.metadata.create_all(bind=production_engine)
    yield
    Base.metadata.drop_all(bind=production_engine)


@pytest.fixture(scope="module")
def dav_app(production_db):
    """The app with its Radicale mount on ``production_db`` and a temporary
    DAV storage folder, set before ``app.main`` is first imported."""
    with tempfile.TemporaryDirectory(prefix="tribu-dav-test-") as folder:
        os.environ["DAV_STORAGE_FOLDER"] = folder
        from app.main import app

        try:
            yield app
        finally:
            os.environ.pop("DAV_STORAGE_FOLDER", None)


@pytest.fixture
def oidc_db(app_db):
    """``app_db``, and the OIDC discovery cache is emptied after the test."""
    from app.core import oidc as oidc_core

    yield
    oidc_core.invalidate_discovery_cache()
