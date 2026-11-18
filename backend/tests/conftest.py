"""Fixtures shared by the backend tests.

Modules opt in, usually with ``pytestmark = pytest.mark.usefixtures("app_db")``.
Tests that need a real database of their own (PostgreSQL, alembic
migrations) keep their own setup.
"""

from __future__ import annotations


import pytest

from tests.support import TestSession, engine, freeze_scheduler_in_utc


@pytest.fixture
def app_db():
    """Fresh tables in the shared in-memory database, served to the app via ``get_db``."""
    from app.database import Base, get_db
    from app.main import app

    Base.metadata.create_all(bind=engine)

    def _session():
        with TestSession() as db:
            yield db

    app.dependency_overrides[get_db] = _session
    yield
    app.dependency_overrides.pop(get_db, None)
    Base.metadata.drop_all(bind=engine)


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
def oidc_db(app_db):
    """``app_db``, and the OIDC discovery cache is emptied after the test."""
    from app.core import oidc as oidc_core

    yield
    oidc_core.invalidate_discovery_cache()
