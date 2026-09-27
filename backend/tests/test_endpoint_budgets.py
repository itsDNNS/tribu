"""Size, query and memory budgets for the heaviest endpoints (issue #495).

Uses a realistic family (phone-sized avatars, school timetables, years of
recurring events, 29 February birthdays). Set TRIBU_BUDGET_DATABASE_URL to run
against PostgreSQL, as CI does.
"""

from __future__ import annotations

import calendar
import os
import tempfile
import time as time_module
import tracemalloc
from dataclasses import dataclass
from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

import app.modules.dashboard_router as dashboard_router
import app.modules.display_router as display_router
from app.core.clock import local_today
from app.database import Base, get_db
from app.main import app
from tests.realistic_family import seed_realistic_family

MB = 1024 * 1024


def _engine():
    url = os.getenv("TRIBU_BUDGET_DATABASE_URL")
    if url:
        return create_engine(url)
    fd, path = tempfile.mkstemp(prefix="tribu-budgets-", suffix=".db")
    os.close(fd)
    return create_engine(f"sqlite:///{path}", connect_args={"check_same_thread": False})


engine = _engine()
TestSession = sessionmaker(bind=engine)
client = TestClient(app)


def _common_year_today() -> date:
    # Leap-day birthdays only broke in common years; pin one so the check never skips.
    today = local_today()
    return today if not calendar.isleap(today.year) else date(today.year - 1, today.month, min(today.day, 28))


@pytest.fixture(scope="module")
def family():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)

    def _override():
        db = TestSession()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _override
    db = TestSession()
    seeded = seed_realistic_family(db)
    db.close()
    headers = {"Authorization": f"Bearer {seeded.admin_token}"}
    display = client.post(f"/families/{seeded.family_id}/display-devices", json={"name": "Kitchen"}, headers=headers)
    assert display.status_code == 200, display.text
    yield seeded, headers, {"Authorization": f"Bearer {display.json()['token']}"}
    app.dependency_overrides.pop(get_db, None)
    Base.metadata.drop_all(bind=engine)


@pytest.fixture(autouse=True)
def common_year(monkeypatch):
    today = _common_year_today()
    monkeypatch.setattr(dashboard_router, "local_today", lambda: today)
    monkeypatch.setattr(display_router, "local_today", lambda: today)


@dataclass
class Measurement:
    status: int
    size: int
    statements: int
    peak: int
    seconds: float


def _measure(path: str, headers: dict) -> Measurement:
    statements: list[str] = []

    def record(conn, cursor, statement, parameters, context, executemany):
        statements.append(statement)

    event.listen(engine, "before_cursor_execute", record)
    tracemalloc.start()
    started = time_module.perf_counter()
    try:
        resp = client.get(path, headers=headers)
    finally:
        seconds = time_module.perf_counter() - started
        _, peak = tracemalloc.get_traced_memory()
        tracemalloc.stop()
        event.remove(engine, "before_cursor_execute", record)
    assert resp.status_code == 200, resp.text[:500]
    return Measurement(resp.status_code, len(resp.content), len(statements), peak, seconds)


# path template, headers key, max response bytes, max statements, max peak memory
BUDGETS = {
    "display dashboard": ("/display/dashboard", "display", 200_000, 80, 60 * MB),
    "dashboard summary": ("/dashboard/summary?family_id={family_id}", "user", 250_000, 60, 60 * MB),
    "members": ("/families/{family_id}/members", "user", 100_000, 20, 40 * MB),
    "school timetables": ("/school-timetables?family_id={family_id}", "user", 100_000, 20, 40 * MB),
    "own profile": ("/auth/me", "user", 150_000, 20, 40 * MB),
}


@pytest.mark.parametrize("name", list(BUDGETS))
def test_heavy_endpoint_stays_within_budget(family, name):
    seeded, user_headers, display_headers = family
    template, who, max_bytes, max_statements, max_peak = BUDGETS[name]
    path = template.format(family_id=seeded.family_id)
    result = _measure(path, display_headers if who == "display" else user_headers)

    print(f"{name}: {result.size} bytes, {result.statements} statements, peak {result.peak / MB:.1f} MB, {result.seconds:.2f}s")
    assert result.size <= max_bytes, f"{name} returned {result.size} bytes"
    assert result.statements <= max_statements, f"{name} ran {result.statements} statements"
    assert result.peak <= max_peak, f"{name} peaked at {result.peak / MB:.1f} MB"
    assert result.seconds <= 10, f"{name} took {result.seconds:.1f}s"
