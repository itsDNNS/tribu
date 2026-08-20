"""Focused contracts for backend-authoritative shopping reuse."""

from pathlib import Path
from unittest.mock import MagicMock

import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import sessionmaker

from app.core.shopping_domain import (
    add_or_merge_shopping_item,
    normalize_product_name,
    parse_quantity,
    remember_category,
    specs_are_compatible,
)
from app.database import Base
from app.models import Family, FamilyProductPreference, ShoppingItem, ShoppingList, User


@pytest.mark.parametrize(
    ("left", "right", "compatible"),
    [
        (None, "", True),
        (None, "organic", True),
        (" Organic ", "organic", True),
        ("organic", "ripe", False),
        ("2 L", "1 l", True),
        ("2 L", "1 kg", False),
        ("2", "1,5", True),
        ("2", "organic", False),
        ("0,5 kg", "1.25 KG", True),
    ],
)
def test_detail_compatibility_truth_table(left, right, compatible):
    assert specs_are_compatible(left, right) is compatible


def test_quantity_parser_rejects_adversarial_whitespace_suffix():
    assert parse_quantity("9" + (" " * 200) + ".") is None


def test_product_name_uses_trimmed_unicode_casefold():
    assert normalize_product_name("  Straße ") == normalize_product_name("STRASSE") == "strasse"


def test_add_merge_restore_quantity_and_family_category_preference(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'domain.db'}")

    @event.listens_for(engine, "connect")
    def _foreign_keys(dbapi_connection, _record):
        dbapi_connection.execute("PRAGMA foreign_keys=ON")

    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    db = Session()
    original_user = User(email="first@example.com", password_hash="hash", display_name="First")
    other_user = User(email="other@example.com", password_hash="hash", display_name="Other")
    first_family = Family(name="First")
    second_family = Family(name="Second")
    db.add_all([original_user, other_user, first_family, second_family])
    db.flush()
    first_list = ShoppingList(family_id=first_family.id, name="Groceries")
    second_list = ShoppingList(family_id=second_family.id, name="Groceries")
    db.add_all([first_list, second_list])
    db.flush()

    created = add_or_merge_shopping_item(
        db,
        shopping_list=first_list,
        name="  milk  ",
        spec="2 L",
        category=" Dairy ",
        added_by_user_id=original_user.id,
    )
    assert created.action == "created"
    assert (created.item.name, created.item.spec, created.item.category) == ("Milk", "2 L", "Dairy")
    checked_variant = ShoppingItem(
        list_id=first_list.id,
        name="Milk",
        spec="1 L",
        checked=True,
        position=1,
    )
    db.add(checked_variant)
    db.flush()

    merged = add_or_merge_shopping_item(
        db,
        shopping_list=first_list,
        name="MILK",
        spec="1 l",
        added_by_user_id=other_user.id,
    )
    assert merged.action == "merged"
    assert merged.item.id == created.item.id
    assert merged.item.spec == "3 L"
    assert merged.item.category == "Dairy"
    assert merged.item.added_by_user_id == original_user.id
    assert checked_variant.checked is True

    merged.item.checked = True
    restored = add_or_merge_shopping_item(
        db,
        shopping_list=first_list,
        name="milk",
        spec="0,5 l",
    )
    assert restored.action == "restored"
    assert restored.item.spec == "0.5 l"
    assert restored.item.checked is False

    isolated = add_or_merge_shopping_item(db, shopping_list=second_list, name="milk")
    assert isolated.action == "created"
    assert isolated.item.category is None

    bare = add_or_merge_shopping_item(db, shopping_list=first_list, name="Eggs", spec="2")
    bare_merged = add_or_merge_shopping_item(db, shopping_list=first_list, name="eggs", spec="1")
    assert bare_merged.item.id == bare.item.id
    assert bare_merged.item.spec == "3"

    decimal = add_or_merge_shopping_item(db, shopping_list=first_list, name="Sugar", spec="1,25 kg")
    decimal_merged = add_or_merge_shopping_item(db, shopping_list=first_list, name="sugar", spec="0.75 KG")
    assert decimal_merged.item.id == decimal.item.id
    assert decimal_merged.item.spec == "2 kg"

    blank = add_or_merge_shopping_item(db, shopping_list=first_list, name="Apples")
    filled = add_or_merge_shopping_item(db, shopping_list=first_list, name="apples", spec=" Organic ")
    equal_text = add_or_merge_shopping_item(db, shopping_list=first_list, name="APPLES", spec="organic")
    unequal_text = add_or_merge_shopping_item(db, shopping_list=first_list, name="Apples", spec="ripe")
    assert filled.item.id == equal_text.item.id == blank.item.id
    assert equal_text.item.spec == "Organic"
    assert unequal_text.action == "created"
    assert unequal_text.item.id != blank.item.id

    explicit = add_or_merge_shopping_item(
        db,
        shopping_list=first_list,
        name="milk",
        spec="1 kg",
        category="Chilled",
    )
    assert explicit.action == "created"
    assert explicit.item.category == "Chilled"
    assert db.query(FamilyProductPreference).filter_by(
        family_id=first_family.id,
        normalized_name=normalize_product_name("Milk"),
    ).one().category == "Chilled"


def test_category_upsert_recovers_unique_race_inside_savepoint():
    db = MagicMock()
    query = db.query.return_value.filter.return_value
    winner = FamilyProductPreference(family_id=1, normalized_name="milk", category="Old")
    query.first.return_value = None
    query.one.return_value = winner
    db.flush.side_effect = [IntegrityError("insert", {}, Exception("unique")), None]

    result = remember_category(db, family_id=1, name="Milk", category="Dairy")

    assert result is winner
    assert winner.category == "Dairy"
    db.begin_nested.assert_called_once_with()
    db.rollback.assert_not_called()


def test_shopping_item_construction_is_centralized():
    modules = Path(__file__).resolve().parents[1] / "app" / "modules"
    offenders = [
        path.name
        for path in modules.glob("*.py")
        if "ShoppingItem(" in path.read_text()
    ]
    assert offenders == []
