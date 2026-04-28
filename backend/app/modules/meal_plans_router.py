"""Meal planning module.

Lets families capture what they plan to eat on each day across three
fixed slots (morning, noon, evening). Available to all family members,
including children. Ingredients are structured (name plus optional
amount and unit) and free text. A dedicated endpoint exposes the
distinct previously-used ingredient names for frontend autocomplete.
A push-to-shopping endpoint turns selected ingredients into shopping
items, formatted as "{amount} {unit}" in the item's spec column.
"""
from collections.abc import Mapping
from datetime import date
from typing import Optional, TypeAlias, TypedDict

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.deps import current_user, ensure_family_membership
from app.core.errors import (
    INVALID_MEAL_RANGE,
    INVALID_MEAL_SLOT,
    MEAL_INGREDIENT_NOT_IN_PLAN,
    MEAL_PLAN_NOT_FOUND,
    MEAL_SLOT_TAKEN,
    SHOPPING_LIST_NOT_FOUND,
    error_detail,
)
from app.core.scopes import require_scope
from app.core.ws_broadcast import broadcast_item_added
from app.database import get_db
from app.models import MealPlan, Membership, ShoppingItem, ShoppingList, User
from app.schemas import (
    AUTH_RESPONSES,
    MEAL_SLOTS,
    IngredientItem,
    MealPlanAddToShoppingRequest,
    MealPlanAddToShoppingResponse,
    MealPlanWeekAddToShoppingRequest,
    MealPlanCreate,
    MealPlanIngredientsResponse,
    MealPlanResponse,
    MealPlanUpdate,
    NOT_FOUND_RESPONSE,
    ShoppingItemResponse,
)

router = APIRouter(prefix="/meal-plans", tags=["meal_plans"], responses={**AUTH_RESPONSES})

VALID_SLOTS = set(MEAL_SLOTS)

MAX_RANGE_DAYS = 370

IngredientFieldValue: TypeAlias = str | int | float | None
RawIngredient: TypeAlias = str | IngredientItem | Mapping[str, IngredientFieldValue]


class NormalizedIngredient(TypedDict):
    name: str
    amount: float | None
    unit: str | None


def _validate_slot(slot: Optional[str]) -> None:
    if slot is None:
        return
    if slot not in VALID_SLOTS:
        raise HTTPException(status_code=400, detail=error_detail(INVALID_MEAL_SLOT, slot=slot))


def _load_for_caller(db: Session, user: User, plan_id: int) -> MealPlan:
    """Fetch a meal plan and authorize the caller.

    Callers outside the family see 404 so existence stays private.
    """
    plan = db.query(MealPlan).filter(MealPlan.id == plan_id).first()
    if plan is None:
        raise HTTPException(status_code=404, detail=error_detail(MEAL_PLAN_NOT_FOUND))
    membership = db.query(Membership).filter(
        Membership.user_id == user.id,
        Membership.family_id == plan.family_id,
    ).first()
    if membership is None:
        raise HTTPException(status_code=404, detail=error_detail(MEAL_PLAN_NOT_FOUND))
    return plan


def _normalize_amount(value: IngredientFieldValue) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    return None


def _normalize_unit(value: IngredientFieldValue) -> Optional[str]:
    if not isinstance(value, str):
        return None
    stripped = value.strip()
    return stripped or None


def _normalize_stored_ingredients(raw: Optional[list[RawIngredient]]) -> list[NormalizedIngredient]:
    """Accept legacy list[str] payloads or the new list[dict] shape.

    Always returns a list of ``{"name", "amount", "unit"}`` dicts. This
    runs on read so a DB that has not yet received migration 0022
    (for example during a mid-deploy window) still yields valid
    responses without raising pydantic validation errors for
    ``MealPlanResponse``.
    """
    if not raw:
        return []
    normalized: list[NormalizedIngredient] = []
    for entry in raw:
        if isinstance(entry, str):
            stripped = entry.strip()
            if not stripped:
                continue
            normalized.append({"name": stripped, "amount": None, "unit": None})
        elif isinstance(entry, Mapping):
            name = entry.get("name")
            if not isinstance(name, str) or not name.strip():
                continue
            normalized.append({
                "name": name.strip(),
                "amount": _normalize_amount(entry.get("amount")),
                "unit": _normalize_unit(entry.get("unit")),
            })
    return normalized


def _serialize(plan: MealPlan) -> MealPlanResponse:
    """Serialize a MealPlan while normalizing legacy ingredient rows.

    We cannot go straight through ``MealPlanResponse.model_validate`` on
    a row whose ``ingredients`` column still holds bare strings from an
    earlier release: pydantic would reject them. Build the response dict
    manually with normalized ingredients and then validate.
    """
    return MealPlanResponse.model_validate({
        "id": plan.id,
        "family_id": plan.family_id,
        "plan_date": plan.plan_date,
        "slot": plan.slot,
        "meal_name": plan.meal_name,
        "ingredients": _normalize_stored_ingredients(plan.ingredients),
        "notes": plan.notes,
        "created_by_user_id": plan.created_by_user_id,
        "created_at": plan.created_at,
        "updated_at": plan.updated_at,
    })


def _sanitize_ingredients(raw: Optional[list[RawIngredient]]) -> list[NormalizedIngredient]:
    """Normalize a list of ingredient items.

    Strips whitespace on name and unit, drops empty names, and
    deduplicates by name (case-insensitively). The first entry for a
    given name wins; later entries with the same name are ignored even
    if their amount/unit differ, because the meal list is a set of
    ingredients not a quantity ledger.
    """
    if not raw:
        return []
    seen: set[str] = set()
    cleaned: list[NormalizedIngredient] = []
    for item in raw:
        if isinstance(item, IngredientItem):
            name = item.name
            amount = item.amount
            unit = item.unit
        elif isinstance(item, Mapping):
            name = item.get("name")
            amount = _normalize_amount(item.get("amount"))
            unit = item.get("unit")
        else:
            continue
        if not isinstance(name, str):
            continue
        name = name.strip()
        if not name:
            continue
        key = name.lower()
        if key in seen:
            continue
        seen.add(key)
        unit_clean = _normalize_unit(unit)
        cleaned.append({
            "name": name,
            "amount": amount,
            "unit": unit_clean,
        })
    return cleaned


def _format_spec(amount: Optional[float], unit: Optional[str]) -> Optional[str]:
    """Render an optional amount + unit into a shopping-item spec."""
    parts: list[str] = []
    if amount is not None:
        if float(amount) == int(amount):
            parts.append(str(int(amount)))
        else:
            parts.append(f"{amount:g}")
    if unit:
        parts.append(unit)
    return " ".join(parts) if parts else None


def _aggregation_key(entry: NormalizedIngredient) -> tuple[str, str | None] | None:
    """Return a safe key for combining quantities across meals.

    We only merge rows that have the same ingredient name and the same unit
    shape. Unitless items are mergeable with each other as checklist items;
    rows with an amount but no unit are kept separate because the meaning can
    be ambiguous across recipes.
    """
    name_key = entry["name"].strip().lower()
    amount = entry["amount"]
    unit = entry["unit"]
    if amount is None and unit is None:
        return (name_key, None)
    if amount is not None and unit:
        return (name_key, unit.strip().lower())
    return None


def _aggregate_week_ingredients(plans: list[MealPlan]) -> list[NormalizedIngredient]:
    """Aggregate ingredients from multiple meal-plan rows for one week."""
    aggregated: list[NormalizedIngredient] = []
    index: dict[tuple[str, str | None], int] = {}
    for plan in plans:
        for entry in _normalize_stored_ingredients(plan.ingredients):
            key = _aggregation_key(entry)
            if key is None or key not in index:
                if key is not None:
                    index[key] = len(aggregated)
                aggregated.append(dict(entry))
                continue
            existing = aggregated[index[key]]
            if existing["amount"] is not None and entry["amount"] is not None:
                existing["amount"] += entry["amount"]
    return aggregated


def _slot_taken(db: Session, family_id: int, plan_date: date, slot: str, exclude_id: Optional[int] = None) -> bool:
    query = db.query(MealPlan.id).filter(
        MealPlan.family_id == family_id,
        MealPlan.plan_date == plan_date,
        MealPlan.slot == slot,
    )
    if exclude_id is not None:
        query = query.filter(MealPlan.id != exclude_id)
    return db.query(query.exists()).scalar()


@router.get(
    "",
    response_model=list[MealPlanResponse],
    summary="List meal plan entries in a date range",
    description=(
        "Return all meal plan entries for the family within [start, end] inclusive. "
        "Ordered by date then slot. Scope: `meal_plans:read`."
    ),
)
def list_meal_plans(
    family_id: int,
    start: date = Query(..., description="Inclusive start date"),
    end: date = Query(..., description="Inclusive end date"),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("meal_plans:read"),
):
    ensure_family_membership(db, user.id, family_id)
    if end < start:
        raise HTTPException(status_code=400, detail=error_detail(INVALID_MEAL_RANGE))
    if (end - start).days > MAX_RANGE_DAYS:
        raise HTTPException(status_code=400, detail=error_detail(INVALID_MEAL_RANGE))
    rows = (
        db.query(MealPlan)
        .filter(
            MealPlan.family_id == family_id,
            MealPlan.plan_date >= start,
            MealPlan.plan_date <= end,
        )
        .order_by(MealPlan.plan_date.asc(), MealPlan.slot.asc(), MealPlan.id.asc())
        .all()
    )
    return [_serialize(plan) for plan in rows]


@router.get(
    "/ingredients",
    response_model=MealPlanIngredientsResponse,
    summary="Distinct ingredient names used in the family's meal plans",
    description=(
        "Return the sorted, case-insensitively deduplicated ingredient names the "
        "family has previously entered. Used to drive frontend autocomplete. "
        "Scope: `meal_plans:read`."
    ),
)
def list_ingredients(
    family_id: int,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("meal_plans:read"),
):
    ensure_family_membership(db, user.id, family_id)
    rows = db.query(MealPlan.ingredients).filter(MealPlan.family_id == family_id).all()
    seen: set[str] = set()
    unique: list[str] = []
    for (ingredients,) in rows:
        for entry in _normalize_stored_ingredients(ingredients):
            stripped = entry["name"].strip()
            key = stripped.lower()
            if key in seen:
                continue
            seen.add(key)
            unique.append(stripped)
    unique.sort(key=str.lower)
    return MealPlanIngredientsResponse(items=unique)


@router.post(
    "",
    response_model=MealPlanResponse,
    summary="Create a meal plan entry",
    description=(
        "Create an entry for one meal slot on one date. A family may only have "
        "one meal per (date, slot) cell; conflicts return 409. "
        "Scope: `meal_plans:write`."
    ),
)
def create_meal_plan(
    payload: MealPlanCreate,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("meal_plans:write"),
):
    ensure_family_membership(db, user.id, payload.family_id)
    _validate_slot(payload.slot)
    if _slot_taken(db, payload.family_id, payload.plan_date, payload.slot):
        raise HTTPException(status_code=409, detail=error_detail(MEAL_SLOT_TAKEN))
    plan = MealPlan(
        family_id=payload.family_id,
        plan_date=payload.plan_date,
        slot=payload.slot,
        meal_name=payload.meal_name.strip(),
        ingredients=_sanitize_ingredients(payload.ingredients),
        notes=payload.notes,
        created_by_user_id=user.id,
    )
    db.add(plan)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail=error_detail(MEAL_SLOT_TAKEN))
    db.refresh(plan)
    return _serialize(plan)


@router.patch(
    "/{plan_id}",
    response_model=MealPlanResponse,
    summary="Update a meal plan entry",
    description=(
        "Partially update a meal plan entry. Moving the entry onto a slot "
        "already taken by another row returns 409. Scope: `meal_plans:write`."
    ),
    responses={**NOT_FOUND_RESPONSE},
)
def update_meal_plan(
    plan_id: int,
    payload: MealPlanUpdate,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("meal_plans:write"),
):
    plan = _load_for_caller(db, user, plan_id)
    fields = payload.model_dump(exclude_unset=True)
    if "slot" in fields:
        _validate_slot(fields["slot"])
    if "meal_name" in fields and fields["meal_name"] is not None:
        fields["meal_name"] = fields["meal_name"].strip()
    if "ingredients" in fields:
        fields["ingredients"] = _sanitize_ingredients(fields["ingredients"])

    next_date = fields.get("plan_date", plan.plan_date)
    next_slot = fields.get("slot", plan.slot)
    if (next_date != plan.plan_date or next_slot != plan.slot) and _slot_taken(
        db, plan.family_id, next_date, next_slot, exclude_id=plan.id
    ):
        raise HTTPException(status_code=409, detail=error_detail(MEAL_SLOT_TAKEN))

    for key, value in fields.items():
        setattr(plan, key, value)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail=error_detail(MEAL_SLOT_TAKEN))
    db.refresh(plan)
    return _serialize(plan)


@router.delete(
    "/{plan_id}",
    summary="Delete a meal plan entry",
    description="Permanently delete one meal plan entry. Scope: `meal_plans:write`.",
    responses={**NOT_FOUND_RESPONSE},
)
def delete_meal_plan(
    plan_id: int,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("meal_plans:write"),
):
    plan = _load_for_caller(db, user, plan_id)
    db.delete(plan)
    db.commit()
    return {"status": "deleted", "meal_plan_id": plan_id}


@router.post(
    "/week/add-to-shopping",
    response_model=MealPlanAddToShoppingResponse,
    summary="Push a week's meal ingredients onto a shopping list",
    description=(
        "Collect all meal-plan ingredients for the selected family week and "
        "append them to the target shopping list. Compatible duplicates are "
        "merged by ingredient name and unit. Scope: `meal_plans:write`."
    ),
    responses={**NOT_FOUND_RESPONSE},
)
def add_week_ingredients_to_shopping(
    payload: MealPlanWeekAddToShoppingRequest,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("meal_plans:write"),
):
    ensure_family_membership(db, user.id, payload.family_id)
    shopping_list = db.query(ShoppingList).filter(ShoppingList.id == payload.shopping_list_id).first()
    if shopping_list is None or shopping_list.family_id != payload.family_id:
        raise HTTPException(status_code=404, detail=error_detail(SHOPPING_LIST_NOT_FOUND))

    week_end = date.fromordinal(payload.week_start.toordinal() + 6)
    plans = (
        db.query(MealPlan)
        .filter(
            MealPlan.family_id == payload.family_id,
            MealPlan.plan_date >= payload.week_start,
            MealPlan.plan_date <= week_end,
        )
        .order_by(MealPlan.plan_date, MealPlan.slot, MealPlan.id)
        .all()
    )

    created: list[ShoppingItem] = []
    for entry in _aggregate_week_ingredients(plans):
        item = ShoppingItem(
            list_id=shopping_list.id,
            name=entry["name"].strip(),
            spec=_format_spec(entry["amount"], entry["unit"]),
            added_by_user_id=user.id,
        )
        db.add(item)
        created.append(item)
    db.commit()
    for item in created:
        db.refresh(item)
        broadcast_item_added(
            shopping_list.id,
            ShoppingItemResponse.model_validate(item).model_dump(mode="json"),
        )
    return MealPlanAddToShoppingResponse(added_count=len(created))


@router.post(
    "/{plan_id}/add-to-shopping",
    response_model=MealPlanAddToShoppingResponse,
    summary="Push meal ingredients onto a shopping list",
    description=(
        "Append the meal's ingredients onto the given shopping list. Each "
        "ingredient's amount + unit become the shopping item's spec. Names "
        "in ingredient_names must match existing ingredient names on the "
        "meal (case-insensitive); unknown names are rejected with 400 to "
        "prevent using this endpoint as a shortcut around the shopping:write "
        "scope. Scope: `meal_plans:write`."
    ),
    responses={**NOT_FOUND_RESPONSE},
)
def add_ingredients_to_shopping(
    plan_id: int,
    payload: MealPlanAddToShoppingRequest,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("meal_plans:write"),
):
    plan = _load_for_caller(db, user, plan_id)
    shopping_list = db.query(ShoppingList).filter(ShoppingList.id == payload.shopping_list_id).first()
    if shopping_list is None or shopping_list.family_id != plan.family_id:
        raise HTTPException(status_code=404, detail=error_detail(SHOPPING_LIST_NOT_FOUND))

    meal_ingredients = _normalize_stored_ingredients(plan.ingredients)
    by_name: dict[str, NormalizedIngredient] = {
        entry["name"].strip().lower(): entry for entry in meal_ingredients
    }

    if payload.ingredient_names is None:
        selected = list(by_name.values())
    else:
        selected = []
        seen_keys: set[str] = set()
        for name in payload.ingredient_names:
            if not isinstance(name, str):
                continue
            key = name.strip().lower()
            if not key or key in seen_keys:
                continue
            seen_keys.add(key)
            match = by_name.get(key)
            if match is None:
                raise HTTPException(
                    status_code=400,
                    detail=error_detail(MEAL_INGREDIENT_NOT_IN_PLAN, name=name.strip()),
                )
            selected.append(match)

    created: list[ShoppingItem] = []
    for entry in selected:
        item = ShoppingItem(
            list_id=shopping_list.id,
            name=entry["name"].strip(),
            spec=_format_spec(entry["amount"], entry["unit"]),
            added_by_user_id=user.id,
        )
        db.add(item)
        created.append(item)
    db.commit()
    for item in created:
        db.refresh(item)
        broadcast_item_added(
            shopping_list.id,
            ShoppingItemResponse.model_validate(item).model_dump(mode="json"),
        )
    return MealPlanAddToShoppingResponse(added_count=len(created))
