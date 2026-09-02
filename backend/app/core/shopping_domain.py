"""Backend-authoritative shopping domain rules.

This module owns shopping name/detail normalization, store search validation,
and the add/merge/restore state transition. It deliberately does not commit or
dispatch any events; route handlers retain those orchestration responsibilities.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
import re
from typing import Literal
import unicodedata
from urllib.parse import urlsplit

from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.utils import utcnow
from app.models import FamilyProductPreference, ShoppingItem, ShoppingList


ShoppingItemAction = Literal["created", "merged", "restored"]

STORE_LINK_PLACEHOLDER = "{query}"
MAX_STORE_LINKS_PER_FAMILY = 20
MAX_STORE_URL_TEMPLATE_LENGTH = 500
MAX_STORE_NAME_KEY_LENGTH = 240  # casefold expands at most 3 code points per input character


class InvalidStoreUrlTemplate(ValueError):
    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason


class InvalidShoppingItemName(ValueError):
    """Raised when a shopping-item name is empty after trimming."""


@dataclass(frozen=True)
class ParsedQuantity:
    amount: Decimal
    unit: str | None
    display_unit: str | None


@dataclass(frozen=True)
class ShoppingItemTransition:
    item: ShoppingItem
    action: ShoppingItemAction
    previous_spec: str | None = None
    previous_category: str | None = None


_QUANTITY_RE = re.compile(
    r"^(?P<amount>(?:\d+(?:[.,]\d+)?|[.,]\d+))(?:\s*(?P<unit>[^\d\s.,].*))?$"
)


def clean_optional_text(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()
    return cleaned or None


def normalize_item_name(value: str) -> str:
    cleaned = value.strip()
    if not cleaned:
        raise InvalidShoppingItemName("Shopping item name cannot be blank")
    return f"{cleaned[:1].upper()}{cleaned[1:]}"


def normalize_product_name(value: str) -> str:
    """Return the durable family-preference and matching key for a name."""
    return value.strip().casefold()


def normalize_store_name(value: str) -> str:
    """Return the trimmed display name with whitespace runs collapsed."""
    return " ".join(value.split())


def store_name_key(value: str) -> str:
    """Return the family-scoped uniqueness key for a store display name."""
    return normalize_product_name(normalize_store_name(value))


def validate_store_url_template(value: str) -> str:
    """Validate a URL-addressable store search without performing I/O."""
    cleaned = value.strip()
    if not cleaned:
        raise InvalidStoreUrlTemplate("empty")
    if len(cleaned) > MAX_STORE_URL_TEMPLATE_LENGTH:
        raise InvalidStoreUrlTemplate("too_long")
    if any(ch.isspace() or unicodedata.category(ch).startswith("C") for ch in cleaned):
        raise InvalidStoreUrlTemplate("whitespace_or_control")

    placeholder_count = cleaned.count(STORE_LINK_PLACEHOLDER)
    if placeholder_count == 0:
        raise InvalidStoreUrlTemplate("placeholder_missing")
    if placeholder_count > 1:
        raise InvalidStoreUrlTemplate("placeholder_repeated")
    without_placeholder = cleaned.replace(STORE_LINK_PLACEHOLDER, "", 1)
    if "{" in without_placeholder or "}" in without_placeholder:
        raise InvalidStoreUrlTemplate("stray_brace")

    try:
        parsed = urlsplit(cleaned)
        hostname = parsed.hostname
        _ = parsed.port
    except ValueError as exc:
        raise InvalidStoreUrlTemplate("unparseable") from exc
    if parsed.scheme.lower() not in {"http", "https"}:
        raise InvalidStoreUrlTemplate("scheme")
    if not hostname:
        raise InvalidStoreUrlTemplate("host_missing")
    if parsed.username is not None or parsed.password is not None:
        raise InvalidStoreUrlTemplate("credentials")
    if STORE_LINK_PLACEHOLDER in parsed.scheme or STORE_LINK_PLACEHOLDER in parsed.netloc:
        raise InvalidStoreUrlTemplate("placeholder_in_authority")
    return cleaned


def _clean_unit(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = " ".join(value.split())
    return cleaned or None


def parse_quantity(value: str | None) -> ParsedQuantity | None:
    cleaned = clean_optional_text(value)
    if cleaned is None:
        return None
    match = _QUANTITY_RE.fullmatch(cleaned)
    if match is None:
        return None
    try:
        amount = Decimal(match.group("amount").replace(",", "."))
    except InvalidOperation:
        return None
    display_unit = _clean_unit(match.group("unit"))
    return ParsedQuantity(
        amount=amount,
        unit=display_unit.casefold() if display_unit is not None else None,
        display_unit=display_unit,
    )


def _format_decimal(value: Decimal) -> str:
    formatted = format(value, "f")
    if "." in formatted:
        formatted = formatted.rstrip("0").rstrip(".")
    return formatted or "0"


def format_quantity(quantity: ParsedQuantity, *, display_unit: str | None = None) -> str:
    unit = display_unit if display_unit is not None else quantity.display_unit
    amount = _format_decimal(quantity.amount)
    return f"{amount} {unit}" if unit else amount


def normalize_spec(value: str | None) -> str | None:
    cleaned = clean_optional_text(value)
    quantity = parse_quantity(cleaned)
    return format_quantity(quantity) if quantity is not None else cleaned


def specs_are_compatible(left: str | None, right: str | None) -> bool:
    left_clean = clean_optional_text(left)
    right_clean = clean_optional_text(right)
    if left_clean is None or right_clean is None:
        return True

    left_quantity = parse_quantity(left_clean)
    right_quantity = parse_quantity(right_clean)
    if left_quantity is not None or right_quantity is not None:
        return (
            left_quantity is not None
            and right_quantity is not None
            and left_quantity.unit == right_quantity.unit
        )
    return left_clean.casefold() == right_clean.casefold()


def _merged_active_spec(existing: str | None, incoming: str | None) -> str | None:
    existing_clean = clean_optional_text(existing)
    incoming_clean = clean_optional_text(incoming)
    if existing_clean is None:
        return normalize_spec(incoming_clean)
    if incoming_clean is None:
        return existing_clean

    existing_quantity = parse_quantity(existing_clean)
    incoming_quantity = parse_quantity(incoming_clean)
    if existing_quantity is not None and incoming_quantity is not None:
        merged = ParsedQuantity(
            amount=existing_quantity.amount + incoming_quantity.amount,
            unit=existing_quantity.unit,
            display_unit=existing_quantity.display_unit or incoming_quantity.display_unit,
        )
        return format_quantity(merged)
    return existing_clean


def _restored_spec(existing: str | None, incoming: str | None) -> str | None:
    existing_clean = clean_optional_text(existing)
    incoming_clean = clean_optional_text(incoming)
    if incoming_clean is None:
        return existing_clean
    return normalize_spec(incoming_clean)


def remember_category(
    db: Session,
    *,
    family_id: int,
    name: str,
    category: str | None,
) -> FamilyProductPreference | None:
    """Persist an explicit category without poisoning the caller transaction.

    The nested transaction confines a concurrent unique-key insert failure to
    a savepoint.  The winning row is then loaded and updated portably without
    dialect-specific upsert syntax.
    """
    cleaned_category = clean_optional_text(category)
    if cleaned_category is None:
        return None
    normalized_name = normalize_product_name(name)
    preference = db.query(FamilyProductPreference).filter(
        FamilyProductPreference.family_id == family_id,
        FamilyProductPreference.normalized_name == normalized_name,
    ).first()
    if preference is not None:
        preference.category = cleaned_category
        preference.updated_at = utcnow()
        db.flush()
        return preference

    try:
        with db.begin_nested():
            preference = FamilyProductPreference(
                family_id=family_id,
                normalized_name=normalized_name,
                category=cleaned_category,
            )
            db.add(preference)
            db.flush()
    except IntegrityError:
        preference = db.query(FamilyProductPreference).filter(
            FamilyProductPreference.family_id == family_id,
            FamilyProductPreference.normalized_name == normalized_name,
        ).one()
        preference.category = cleaned_category
        preference.updated_at = utcnow()
        db.flush()
    return preference


def resolve_category(
    db: Session,
    *,
    family_id: int,
    name: str,
    category: str | None,
) -> str | None:
    explicit = clean_optional_text(category)
    if explicit is not None:
        remember_category(db, family_id=family_id, name=name, category=explicit)
        return explicit
    preference = db.query(FamilyProductPreference).filter(
        FamilyProductPreference.family_id == family_id,
        FamilyProductPreference.normalized_name == normalize_product_name(name),
    ).first()
    return preference.category if preference is not None else None


def add_or_merge_shopping_item(
    db: Session,
    *,
    shopping_list: ShoppingList,
    name: str,
    spec: str | None = None,
    category: str | None = None,
    added_by_user_id: int | None = None,
    position: int | None = None,
) -> ShoppingItemTransition:
    """Create, merge into an active row, or restore a checked compatible row."""
    display_name = normalize_item_name(name)
    incoming_spec = clean_optional_text(spec)
    resolved_category = resolve_category(
        db,
        family_id=shopping_list.family_id,
        name=display_name,
        category=category,
    )

    candidates = (
        db.query(ShoppingItem)
        .filter(ShoppingItem.list_id == shopping_list.id)
        .order_by(ShoppingItem.checked.asc(), ShoppingItem.position.asc(), ShoppingItem.id.asc())
        .all()
    )
    normalized_name = normalize_product_name(display_name)
    match = next(
        (
            item
            for item in candidates
            if normalize_product_name(item.name) == normalized_name
            and specs_are_compatible(item.spec, incoming_spec)
        ),
        None,
    )
    if match is not None:
        previous_spec = match.spec
        previous_category = match.category
        match.name = display_name
        if match.checked:
            match.spec = _restored_spec(match.spec, incoming_spec)
            match.checked = False
            match.checked_at = None
            action: ShoppingItemAction = "restored"
        else:
            match.spec = _merged_active_spec(match.spec, incoming_spec)
            action = "merged"
        if resolved_category is not None:
            match.category = resolved_category
        db.flush()
        return ShoppingItemTransition(
            item=match,
            action=action,
            previous_spec=previous_spec,
            previous_category=previous_category,
        )

    if position is None:
        max_position = db.query(func.max(ShoppingItem.position)).filter(
            ShoppingItem.list_id == shopping_list.id,
        ).scalar()
        position = (max_position if max_position is not None else -1) + 1
    item = ShoppingItem(
        list_id=shopping_list.id,
        name=display_name,
        spec=normalize_spec(incoming_spec),
        category=resolved_category,
        added_by_user_id=added_by_user_id,
        position=position,
    )
    db.add(item)
    db.flush()
    return ShoppingItemTransition(item=item, action="created")


# Concise aliases for callers/tests that use the domain vocabulary directly.
details_are_compatible = specs_are_compatible
add_or_merge_item = add_or_merge_shopping_item
