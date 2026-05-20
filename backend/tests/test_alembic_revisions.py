"""Alembic migration metadata contracts."""

from __future__ import annotations

import ast
import sqlite3
from pathlib import Path

from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory

BACKEND_DIR = Path(__file__).resolve().parents[1]
VERSIONS_DIR = Path(__file__).resolve().parents[1] / "alembic" / "versions"
MAX_ALEMBIC_VERSION_LENGTH = 32


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
