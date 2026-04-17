"""Normalize meal plan ingredients and enforce one meal per family/date/slot.

Revision ID: 0022
Revises: 0021
Create Date: 2026-04-17

This migration is defensive against any data created under 0021 alone
(either in local dev snapshots or a pre-release deploy):

1. Converts legacy list[str] ingredient payloads into the new structured
   list[{"name": str, "amount": null, "unit": null}] shape.
2. Collapses duplicate (family_id, plan_date, slot) rows by keeping the
   row with the most recent ``updated_at`` (ties broken by highest id).
3. Adds the UNIQUE constraint so future writes cannot reintroduce the
   duplicates.

The downgrade reverses step 3 only; the normalization is forward-only.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0022"
down_revision: Union[str, None] = "0021"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

CONSTRAINT_NAME = "uq_meal_plans_family_date_slot"

_meal_plans = sa.table(
    "meal_plans",
    sa.column("id", sa.Integer),
    sa.column("family_id", sa.Integer),
    sa.column("plan_date", sa.Date),
    sa.column("slot", sa.String),
    sa.column("ingredients", sa.JSON),
    sa.column("updated_at", sa.DateTime),
)


def _constraint_exists(bind: sa.engine.Connection) -> bool:
    insp = sa.inspect(bind)
    if "meal_plans" not in insp.get_table_names():
        return False
    for c in insp.get_unique_constraints("meal_plans"):
        if c.get("name") == CONSTRAINT_NAME:
            return True
    return False


def _normalize_legacy_ingredients(bind: sa.engine.Connection) -> None:
    """Rewrite any row whose ingredients list contains bare strings.

    The router only reads the new structured shape; legacy rows would
    silently disappear from responses and shopping pushes otherwise.
    """
    rows = bind.execute(sa.select(_meal_plans.c.id, _meal_plans.c.ingredients)).fetchall()
    for row_id, ingredients in rows:
        if not ingredients:
            continue
        if not any(isinstance(entry, str) for entry in ingredients):
            continue
        normalized: list[dict] = []
        seen: set[str] = set()
        for entry in ingredients:
            if isinstance(entry, str):
                name = entry.strip()
                if not name:
                    continue
                key = name.lower()
                if key in seen:
                    continue
                seen.add(key)
                normalized.append({"name": name, "amount": None, "unit": None})
            elif isinstance(entry, dict) and isinstance(entry.get("name"), str):
                key = entry["name"].strip().lower()
                if not key or key in seen:
                    continue
                seen.add(key)
                normalized.append(entry)
        bind.execute(
            sa.update(_meal_plans)
            .where(_meal_plans.c.id == row_id)
            .values(ingredients=normalized)
        )


def _dedupe_duplicate_slots(bind: sa.engine.Connection) -> None:
    """Delete older rows that share (family_id, plan_date, slot).

    Keeping the row with the most recent ``updated_at`` (ties broken by
    highest id) is the least-surprising default if a database somehow
    captured two writers racing on the same cell before the constraint
    existed.
    """
    dup_groups = bind.execute(
        sa.select(
            _meal_plans.c.family_id,
            _meal_plans.c.plan_date,
            _meal_plans.c.slot,
        )
        .group_by(
            _meal_plans.c.family_id,
            _meal_plans.c.plan_date,
            _meal_plans.c.slot,
        )
        .having(sa.func.count() > 1)
    ).fetchall()
    for family_id, plan_date, slot in dup_groups:
        winner = bind.execute(
            sa.select(_meal_plans.c.id)
            .where(
                _meal_plans.c.family_id == family_id,
                _meal_plans.c.plan_date == plan_date,
                _meal_plans.c.slot == slot,
            )
            .order_by(_meal_plans.c.updated_at.desc(), _meal_plans.c.id.desc())
            .limit(1)
        ).scalar()
        bind.execute(
            sa.delete(_meal_plans).where(
                _meal_plans.c.family_id == family_id,
                _meal_plans.c.plan_date == plan_date,
                _meal_plans.c.slot == slot,
                _meal_plans.c.id != winner,
            )
        )


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if "meal_plans" not in insp.get_table_names():
        return

    _normalize_legacy_ingredients(bind)
    _dedupe_duplicate_slots(bind)

    if _constraint_exists(bind):
        return
    with op.batch_alter_table("meal_plans") as batch:
        batch.create_unique_constraint(
            CONSTRAINT_NAME,
            ["family_id", "plan_date", "slot"],
        )


def downgrade() -> None:
    bind = op.get_bind()
    if not _constraint_exists(bind):
        return
    with op.batch_alter_table("meal_plans") as batch:
        batch.drop_constraint(CONSTRAINT_NAME, type_="unique")
