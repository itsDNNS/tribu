"""Alembic migration metadata contracts."""

from __future__ import annotations

import ast
import logging
import sqlite3
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory

BACKEND_DIR = Path(__file__).resolve().parents[1]
VERSIONS_DIR = Path(__file__).resolve().parents[1] / "alembic" / "versions"
MAX_ALEMBIC_VERSION_LENGTH = 32


@pytest.fixture(autouse=True)
def _restore_logger_disabled_state():
    """Keep Alembic's fileConfig from leaking disabled loggers to later tests."""
    disabled_before = {
        name: logger.disabled
        for name, logger in logging.root.manager.loggerDict.items()
        if isinstance(logger, logging.Logger)
    }
    yield
    for name, logger in logging.root.manager.loggerDict.items():
        if isinstance(logger, logging.Logger):
            logger.disabled = disabled_before.get(name, False)


def _literal_assignment(module: ast.Module, name: str) -> str:
    for node in module.body:
        if isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name) and node.target.id == name:
            value = ast.literal_eval(node.value)
            assert isinstance(value, str)
            return value
        if isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name) and target.id == name:
                    value = ast.literal_eval(node.value)
                    assert isinstance(value, str)
                    return value
    raise AssertionError(f"Missing {name!r} assignment")


def test_alembic_revision_ids_fit_version_table_column() -> None:
    revisions: dict[str, Path] = {}
    for path in sorted(VERSIONS_DIR.glob("*.py")):
        module = ast.parse(path.read_text(), filename=str(path))
        revision = _literal_assignment(module, "revision")
        assert len(revision) <= MAX_ALEMBIC_VERSION_LENGTH, (
            f"{path.name} revision {revision!r} exceeds alembic_version.version_num "
            f"limit of {MAX_ALEMBIC_VERSION_LENGTH} characters"
        )
        assert revision not in revisions, f"Duplicate Alembic revision {revision!r} in {path} and {revisions[revision]}"
        revisions[revision] = path


def test_alembic_upgrades_fresh_sqlite_database(tmp_path, monkeypatch) -> None:
    db_path = tmp_path / "native-smoke.db"
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{db_path}")
    monkeypatch.syspath_prepend(str(BACKEND_DIR))

    command.upgrade(config, "head")

    head = ScriptDirectory.from_config(config).get_current_head()
    with sqlite3.connect(db_path) as conn:
        version = conn.execute("SELECT version_num FROM alembic_version").fetchone()[0]
    assert version == head


def test_product_preferences_migration_backfills_latest_and_downgrades(tmp_path, monkeypatch) -> None:
    db_path = tmp_path / "product-preferences.db"
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{db_path}")
    monkeypatch.syspath_prepend(str(BACKEND_DIR))
    command.upgrade(config, "0053_ui_preferences")

    with sqlite3.connect(db_path) as conn:
        conn.execute("INSERT INTO families (id, name) VALUES (1, 'One'), (2, 'Two')")
        conn.execute("INSERT INTO shopping_lists (id, family_id, name) VALUES (1, 1, 'A'), (2, 2, 'B')")
        conn.execute(
            """
            INSERT INTO shopping_items (id, list_id, name, category, checked, position, created_at)
            VALUES
                (1, 1, 'Straße', 'Old', 0, 0, '2026-01-01 10:00:00'),
                (2, 1, 'STRASSE', 'Newest by id', 0, 1, '2026-01-02 10:00:00'),
                (3, 1, ' strasse ', 'Latest', 0, 2, '2026-01-02 10:00:00'),
                (4, 2, 'Straße', 'Other family', 0, 0, '2026-01-03 10:00:00'),
                (5, 1, 'Ignored', '   ', 0, 3, '2026-01-04 10:00:00')
            """
        )
        conn.commit()

    command.upgrade(config, "0054_product_preferences")
    with sqlite3.connect(db_path) as conn:
        preferences = conn.execute(
            "SELECT family_id, normalized_name, category FROM family_product_preferences ORDER BY family_id"
        ).fetchall()
    assert preferences == [(1, "strasse", "Latest"), (2, "strasse", "Other family")]

    command.downgrade(config, "0053_ui_preferences")
    with sqlite3.connect(db_path) as conn:
        tables = {row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}
    assert "family_product_preferences" not in tables
