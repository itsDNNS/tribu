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


def test_store_links_migration_creates_table_and_downgrades(tmp_path, monkeypatch) -> None:
    db_path = tmp_path / "store-links.db"
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{db_path}")
    monkeypatch.syspath_prepend(str(BACKEND_DIR))
    command.upgrade(config, "0055_task_vtodo")

    with sqlite3.connect(db_path) as conn:
        conn.execute("INSERT INTO families (id, name) VALUES (1, 'One'), (2, 'Two')")
        conn.commit()

    command.upgrade(config, "0056_store_links")
    expanded_key = "\u03b9\u0308\u0301" * 80
    with sqlite3.connect(db_path) as conn:
        conn.execute(
            "INSERT INTO shopping_store_links (family_id, name, normalized_name, url_template) VALUES (?, ?, ?, ?)",
            (1, "Amazon", "amazon", "https://example.com/?q={query}"),
        )
        with pytest.raises(sqlite3.IntegrityError):
            conn.execute(
                "INSERT INTO shopping_store_links (family_id, name, normalized_name, url_template) VALUES (?, ?, ?, ?)",
                (1, "AMAZON", "amazon", "https://example.com/?q={query}"),
            )
        conn.execute(
            "INSERT INTO shopping_store_links (family_id, name, normalized_name, url_template) VALUES (?, ?, ?, ?)",
            (2, "Amazon", "amazon", "https://example.com/?q={query}"),
        )
        conn.execute(
            "INSERT INTO shopping_store_links (family_id, name, normalized_name, url_template) VALUES (?, ?, ?, ?)",
            (1, "Long key", expanded_key, "https://example.com/?q={query}"),
        )
        assert conn.execute(
            "SELECT normalized_name FROM shopping_store_links WHERE name = 'Long key'"
        ).fetchone()[0] == expanded_key
        with pytest.raises(sqlite3.IntegrityError):
            conn.execute(
                "INSERT INTO shopping_store_links (family_id, name, normalized_name, url_template) VALUES (?, ?, ?, ?)",
                (1, "Long key two", expanded_key, "https://example.com/?q={query}"),
            )

    command.downgrade(config, "0055_task_vtodo")
    with sqlite3.connect(db_path) as conn:
        tables = {row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}
    assert "shopping_store_links" not in tables


def test_task_vtodo_migration_backfills_constraints_and_downgrades(tmp_path, monkeypatch) -> None:
    db_path = tmp_path / "task-vtodo.db"
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{db_path}")
    monkeypatch.syspath_prepend(str(BACKEND_DIR))
    command.upgrade(config, "0054_product_preferences")

    with sqlite3.connect(db_path) as conn:
        conn.execute("INSERT INTO families (id, name) VALUES (1, 'One'), (2, 'Two')")
        conn.execute(
            """
            INSERT INTO tasks
                (id, family_id, title, status, priority, created_at, completed_at, token_require_confirmation)
            VALUES
                (1, 1, 'Created', 'open', 'normal', '2026-01-01 10:00:00', NULL, 1),
                (2, 1, 'Completed', 'done', 'normal', '2026-01-01 10:00:00', '2026-01-02 11:00:00', 1)
            """
        )
        conn.commit()

    command.upgrade(config, "0055_task_vtodo")
    with sqlite3.connect(db_path) as conn:
        rows = conn.execute(
            "SELECT id, updated_at, due_is_date, vtodo_uid, dav_href, raw_vtodo FROM tasks ORDER BY id"
        ).fetchall()
        assert rows[0][1].startswith("2026-01-01 10:00:00")
        assert rows[1][1].startswith("2026-01-02 11:00:00")
        assert [row[2] for row in rows] == [0, 0]
        assert all(row[3:] == (None, None, None) for row in rows)

        conn.execute("UPDATE tasks SET vtodo_uid = 'same', dav_href = 'same.ics' WHERE id = 1")
        conn.execute(
            """
            INSERT INTO tasks
                (id, family_id, title, status, priority, created_at, vtodo_uid, dav_href, token_require_confirmation)
            VALUES (3, 2, 'Other family', 'open', 'normal', CURRENT_TIMESTAMP, 'same', 'same.ics', 1)
            """
        )
        with pytest.raises(sqlite3.IntegrityError):
            conn.execute(
                """
                INSERT INTO tasks
                    (id, family_id, title, status, priority, created_at, vtodo_uid, dav_href, token_require_confirmation)
                VALUES (4, 1, 'Duplicate', 'open', 'normal', CURRENT_TIMESTAMP, 'same', 'other.ics', 1)
                """
            )
        conn.rollback()

    command.downgrade(config, "0054_product_preferences")
    with sqlite3.connect(db_path) as conn:
        columns = {row[1] for row in conn.execute("PRAGMA table_info(tasks)")}
    assert {"updated_at", "vtodo_uid", "dav_href", "raw_vtodo", "due_is_date"}.isdisjoint(columns)


def test_shopping_visual_migration_upgrades_populated_rows_and_persists_details(tmp_path, monkeypatch):
    import json
    db_path = tmp_path / "shopping-0057.db"
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{db_path}")
    command.upgrade(config, "0056_store_links")
    with sqlite3.connect(db_path) as conn:
        conn.execute("INSERT INTO families (id, name) VALUES (1, 'Family')")
        conn.execute("INSERT INTO shopping_lists (id, family_id, name) VALUES (1, 1, 'Weekly')")
        conn.execute("INSERT INTO shopping_items (id, list_id, name, spec, category, checked, checked_at) VALUES (1, 1, 'Milk', '2 l', 'Dairy', 1, '2026-09-20 12:00:00')")
    command.upgrade(config, "head")
    with sqlite3.connect(db_path) as conn:
        assert conn.execute("SELECT icon, category_order FROM shopping_lists").fetchone() == ("cart", None)
        assert conn.execute("SELECT priority, archived, notes, photo, checked, spec, category FROM shopping_items").fetchone() == ("normal", 0, None, None, 1, "2 l", "Dairy")
        # Old clients can still insert without knowing the new fields.
        conn.execute("INSERT INTO shopping_lists (id, family_id, name) VALUES (2, 1, 'New')")
        conn.execute("INSERT INTO shopping_items (id, list_id, name, checked) VALUES (2, 2, 'Bread', 0)")
        conn.execute("UPDATE shopping_lists SET icon='heart', category_order=? WHERE id=1", (json.dumps(["Dairy", "Bakery"]),))
        conn.execute("UPDATE shopping_items SET priority='urgent', archived=1, notes='Brand', photo='data:image/png;base64,iVBORw0KGgo=' WHERE id=1")
    # Reopen the connection to verify persisted data, not session defaults.
    with sqlite3.connect(db_path) as conn:
        assert conn.execute("SELECT icon, category_order FROM shopping_lists WHERE id=2").fetchone() == ("cart", None)
        assert conn.execute("SELECT priority, archived FROM shopping_items WHERE id=2").fetchone() == ("normal", 0)
        assert conn.execute("SELECT icon, category_order FROM shopping_lists WHERE id=1").fetchone() == ("heart", '["Dairy", "Bakery"]')
        assert conn.execute("SELECT priority, archived, notes, photo, checked_at FROM shopping_items WHERE id=1").fetchone() == ("urgent", 1, "Brand", "data:image/png;base64,iVBORw0KGgo=", "2026-09-20 12:00:00")
        assert conn.execute("SELECT version_num FROM alembic_version").fetchone()[0] == "0057_shopping_visual_details"
    command.downgrade(config, "0056_store_links")
    with sqlite3.connect(db_path) as conn:
        assert conn.execute("SELECT name, spec, checked FROM shopping_items WHERE id=1").fetchone() == ("Milk", "2 l", 1)
        columns = {row[1] for row in conn.execute("PRAGMA table_info(shopping_items)")}
        assert {"notes", "photo", "archived", "priority"}.isdisjoint(columns)


def test_shopping_model_defaults_match_migration_for_legacy_inserts():
    from sqlalchemy import create_engine, text
    from sqlalchemy.orm import Session
    from app.database import Base
    from app.models import ShoppingItem
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    with engine.begin() as conn:
        conn.execute(text("INSERT INTO shopping_items (list_id, name, checked, position) VALUES (1, 'Legacy', 0, 0)"))
    with Session(engine) as db:
        item = db.query(ShoppingItem).one()
        assert item.archived is False
        assert item.priority == "normal"
        assert item.notes is None and item.photo is None
    engine.dispose()
