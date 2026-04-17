"""Meal planning module.

Lets families capture what they plan to eat on each day across three
fixed slots (morning, noon, evening). Available to all family members,
including children. Ingredients are free text; a dedicated endpoint
exposes the distinct previously-used ingredient names to drive frontend
autocomplete. Ingredients can be pushed as items onto an existing
shopping list without converting the meal entry itself.
"""
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.deps import current_user, ensure_family_membership
from app.core.errors import (
    INVALID_MEAL_RANGE,
    INVALID_MEAL_SLOT,
    MEAL_PLAN_NOT_FOUND,
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
    MealPlanAddToShoppingRequest,
    MealPlanAddToShoppingResponse,
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


def _sanitize_ingredients(raw: Optional[list[str]]) -> list[str]:
    """Strip whitespace, drop empties and duplicates (case-insensitive),
    preserve first-seen order. Keeps user-entered casing on the winner.
    """
    if not raw:
        return []
    seen: set[str] = set()
    cleaned: list[str] = []
    for item in raw:
        if not isinstance(item, str):
            continue
        stripped = item.strip()
        if not stripped:
            continue
        key = stripped.lower()
        if key in seen:
            continue
        seen.add(key)
        cleaned.append(stripped)
    return cleaned


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
    return (
        db.query(MealPlan)
        .filter(
            MealPlan.family_id == family_id,
            MealPlan.plan_date >= start,
            MealPlan.plan_date <= end,
        )
        .order_by(MealPlan.plan_date.asc(), MealPlan.slot.asc(), MealPlan.id.asc())
        .all()
    )


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
        if not ingredients:
            continue
        for item in ingredients:
            if not isinstance(item, str):
                continue
            stripped = item.strip()
            if not stripped:
                continue
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
    description="Create an entry for one meal slot on one date. Scope: `meal_plans:write`.",
)
def create_meal_plan(
    payload: MealPlanCreate,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("meal_plans:write"),
):
    ensure_family_membership(db, user.id, payload.family_id)
    _validate_slot(payload.slot)
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
    db.commit()
    db.refresh(plan)
    return plan


@router.patch(
    "/{plan_id}",
    response_model=MealPlanResponse,
    summary="Update a meal plan entry",
    description="Partially update a meal plan entry. Scope: `meal_plans:write`.",
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
    for key, value in fields.items():
        setattr(plan, key, value)
    db.commit()
    db.refresh(plan)
    return plan


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
    "/{plan_id}/add-to-shopping",
    response_model=MealPlanAddToShoppingResponse,
    summary="Push meal ingredients onto a shopping list",
    description=(
        "Append each ingredient of the meal as a new item on the given shopping "
        "list. Ingredients the shopping list already has are still appended (the "
        "shopping list itself has no uniqueness constraint). Scope: "
        "`meal_plans:write`."
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

    source = payload.ingredients if payload.ingredients is not None else (plan.ingredients or [])
    cleaned = _sanitize_ingredients(source)
    created: list[ShoppingItem] = []
    for name in cleaned:
        item = ShoppingItem(
            list_id=shopping_list.id,
            name=name,
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
