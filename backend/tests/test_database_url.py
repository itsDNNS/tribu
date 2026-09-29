"""Bare postgresql:// URLs keep using the installed psycopg2 driver.

SQLAlchemy 2.1 made psycopg (v3) the default for postgresql://, which Tribu
does not ship. Existing DATABASE_URL settings must keep working.
"""

import os
import subprocess
import sys
from pathlib import Path

import pytest
import sqlalchemy
from alembic import command
from alembic.config import Config

from app.database import normalize_database_url

BACKEND_DIR = Path(__file__).resolve().parents[1]
BARE_POSTGRES_URL = "postgresql://tribu:tribu@127.0.0.1:1/tribu"


@pytest.mark.parametrize(
    ("url", "expected"),
    [
        (BARE_POSTGRES_URL, "postgresql+psycopg2://tribu:tribu@127.0.0.1:1/tribu"),
        ("postgresql://tribu:p%40ss@db/tribu?sslmode=require", "postgresql+psycopg2://tribu:p%40ss@db/tribu?sslmode=require"),
        ("postgresql+psycopg2://tribu@db/tribu", "postgresql+psycopg2://tribu@db/tribu"),
        ("postgresql+psycopg://tribu@db/tribu", "postgresql+psycopg://tribu@db/tribu"),
        ("sqlite:////data/tribu.db", "sqlite:////data/tribu.db"),
        ("sqlite://", "sqlite://"),
    ],
)
def test_normalize_database_url(url, expected):
    assert normalize_database_url(url) == expected


def test_app_engine_uses_psycopg2_for_bare_postgresql_url():
    env = {**os.environ, "DATABASE_URL": BARE_POSTGRES_URL, "PYTHONPATH": str(BACKEND_DIR)}
    result = subprocess.run(
        [sys.executable, "-c", "from app.database import engine; print(engine.dialect.driver)"],
        capture_output=True, text=True, env=env, cwd=BACKEND_DIR, timeout=60,
    )
    assert result.returncode == 0, result.stderr
    assert result.stdout.strip() == "psycopg2"


class _EngineCreated(Exception):
    pass


def test_alembic_uses_psycopg2_for_bare_postgresql_url(monkeypatch):
    drivers = []
    real_engine_from_config = sqlalchemy.engine_from_config

    def _record(*args, **kwargs):
        drivers.append(real_engine_from_config(*args, **kwargs).dialect.driver)
        raise _EngineCreated

    monkeypatch.setattr(sqlalchemy, "engine_from_config", _record)
    monkeypatch.setenv("DATABASE_URL", BARE_POSTGRES_URL)
    monkeypatch.syspath_prepend(str(BACKEND_DIR))
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_DIR / "alembic"))

    with pytest.raises(_EngineCreated):
        command.upgrade(config, "head")
    assert drivers == ["psycopg2"]


def test_endpoint_budget_engine_uses_psycopg2_for_bare_postgresql_url(monkeypatch):
    from tests import test_endpoint_budgets

    monkeypatch.setenv("TRIBU_BUDGET_DATABASE_URL", BARE_POSTGRES_URL)
    assert test_endpoint_budgets._engine().dialect.driver == "psycopg2"
