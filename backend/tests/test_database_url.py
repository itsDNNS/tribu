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
from alembic.runtime.environment import EnvironmentContext
from sqlalchemy.engine import make_url

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
    with pytest.raises(_EngineCreated):
        command.upgrade(_alembic_config(monkeypatch, BARE_POSTGRES_URL), "head")
    assert drivers == ["psycopg2"]


def _alembic_config(monkeypatch, database_url):
    monkeypatch.setenv("DATABASE_URL", database_url)
    monkeypatch.syspath_prepend(str(BACKEND_DIR))
    # No ini file: env.py then skips fileConfig, which would disable the app
    # loggers that later tests assert on.
    config = Config()
    config.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    return config


# Percent-encoded user, password and query values must survive Alembic's
# ini-style interpolation of sqlalchemy.url unchanged.
ENCODED_POSTGRES_URL = (
    "postgresql://tri%3Abu:p%40ss%25w%3Ard@127.0.0.1:1/tribu"
    "?sslmode=disable&application_name=tribu%20migrate"
)


def _assert_encoded_url_parts(url):
    assert url.drivername == "postgresql+psycopg2"
    assert url.username == "tri:bu"
    assert url.password == "p@ss%w:rd"
    assert url.database == "tribu"
    assert dict(url.query) == {"sslmode": "disable", "application_name": "tribu migrate"}


def test_alembic_online_keeps_percent_encoded_url(monkeypatch):
    urls = []
    real_engine_from_config = sqlalchemy.engine_from_config

    def _record(*args, **kwargs):
        urls.append(real_engine_from_config(*args, **kwargs).url)
        raise _EngineCreated

    monkeypatch.setattr(sqlalchemy, "engine_from_config", _record)
    with pytest.raises(_EngineCreated):
        command.upgrade(_alembic_config(monkeypatch, ENCODED_POSTGRES_URL), "head")
    assert len(urls) == 1
    _assert_encoded_url_parts(urls[0])


class _Configured(Exception):
    pass


def test_alembic_offline_keeps_percent_encoded_url(monkeypatch):
    urls = []

    def _record(self, *args, **kwargs):
        urls.append(kwargs["url"])
        raise _Configured

    monkeypatch.setattr(EnvironmentContext, "configure", _record)
    with pytest.raises(_Configured):
        command.upgrade(_alembic_config(monkeypatch, ENCODED_POSTGRES_URL), "head", sql=True)
    assert urls == [normalize_database_url(ENCODED_POSTGRES_URL)]
    _assert_encoded_url_parts(make_url(urls[0]))


def test_endpoint_budget_engine_uses_psycopg2_for_bare_postgresql_url(monkeypatch):
    from tests import test_endpoint_budgets

    monkeypatch.setenv("TRIBU_BUDGET_DATABASE_URL", BARE_POSTGRES_URL)
    assert test_endpoint_budgets._engine().dialect.driver == "psycopg2"
