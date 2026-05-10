"""Alembic migration metadata contracts."""

from __future__ import annotations

import ast
from pathlib import Path


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
