"""Lightweight family recipe library.

Recipes are reusable family-owned records. Their ingredients share the
meal-plan ingredient shape so planning a meal from a recipe is a direct
copy operation, and pushing recipe ingredients to shopping lists can use
the same item formatting as meal plans.
"""
from collections.abc import Mapping
from typing import Optional, TypeAlias, TypedDict

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.deps import current_user, ensure_family_membership
from app.core.errors import (
    RECIPE_INGREDIENT_NOT_IN_RECIPE,
    RECIPE_NOT_FOUND,
    SHOPPING_LIST_NOT_FOUND,
    error_detail,
)
from app.core.scopes import require_scope
from app.core.ws_broadcast import broadcast_item_added
from app.database import get_db
from app.models import Membership, Recipe, ShoppingItem, ShoppingList, User
from app.schemas import (
    AUTH_RESPONSES,
    IngredientItem,
    NOT_FOUND_RESPONSE,
    RecipeAddToShoppingRequest,
    RecipeAddToShoppingResponse,
    RecipeCreate,
    RecipeResponse,
    RecipeUpdate,
    ShoppingItemResponse,
)

router = APIRouter(prefix="/recipes", tags=["recipes"], responses={**AUTH_RESPONSES})

IngredientFieldValue: TypeAlias = str | int | float | None
RawIngredient: TypeAlias = str | IngredientItem | Mapping[str, IngredientFieldValue]


class NormalizedIngredient(TypedDict):
    name: str
    amount: float | None
    unit: str | None


def _normalize_amount(value: IngredientFieldValue) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    return None


def _normalize_unit(value: IngredientFieldValue) -> str | None:
    if not isinstance(value, str):
        return None
    stripped = value.strip()
    return stripped or None


def _normalize_stored_ingredients(raw: Optional[list[RawIngredient]]) -> list[NormalizedIngredient]:
    if not raw:
        return []
    normalized: list[NormalizedIngredient] = []
    for entry in raw:
        if isinstance(entry, str):
            stripped = entry.strip()
            if stripped:
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


def _sanitize_ingredients(raw: Optional[list[RawIngredient]]) -> list[NormalizedIngredient]:
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
        cleaned.append({
            "name": name,
            "amount": amount,
            "unit": _normalize_unit(unit),
        })
    return cleaned


def _sanitize_tags(raw: Optional[list[str]]) -> list[str]:
    if not raw:
        return []
    seen: set[str] = set()
    cleaned: list[str] = []
    for tag in raw:
        if not isinstance(tag, str):
            continue
        stripped = tag.strip()
        if not stripped:
            continue
        key = stripped.lower()
        if key in seen:
            continue
        seen.add(key)
        cleaned.append(stripped[:40])
    return cleaned[:20]


def _clean_text(value: Optional[str]) -> str | None:
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None


def _format_spec(amount: Optional[float], unit: Optional[str]) -> Optional[str]:
    parts: list[str] = []
    if amount is not None:
        if float(amount) == int(amount):
            parts.append(str(int(amount)))
        else:
            parts.append(f"{amount:g}")
    if unit:
        parts.append(unit)
    return " ".join(parts) if parts else None


def _serialize(recipe: Recipe) -> RecipeResponse:
    return RecipeResponse.model_validate({
        "id": recipe.id,
        "family_id": recipe.family_id,
        "title": recipe.title,
        "description": recipe.description,
        "source_url": recipe.source_url,
        "servings": recipe.servings,
        "tags": recipe.tags or [],
        "ingredients": _normalize_stored_ingredients(recipe.ingredients),
        "instructions": recipe.instructions,
        "created_by_user_id": recipe.created_by_user_id,
        "created_at": recipe.created_at,
        "updated_at": recipe.updated_at,
    })


def _load_for_caller(db: Session, user: User, recipe_id: int) -> Recipe:
    recipe = db.query(Recipe).filter(Recipe.id == recipe_id).first()
    if recipe is None:
        raise HTTPException(status_code=404, detail=error_detail(RECIPE_NOT_FOUND))
    membership = db.query(Membership).filter(
        Membership.user_id == user.id,
        Membership.family_id == recipe.family_id,
    ).first()
    if membership is None:
        raise HTTPException(status_code=404, detail=error_detail(RECIPE_NOT_FOUND))
    return recipe


@router.get(
    "",
    response_model=list[RecipeResponse],
    summary="List family recipes",
    description="Return all recipes for a family. Scope: `recipes:read`.",
)
def list_recipes(
    family_id: int,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("recipes:read"),
):
    ensure_family_membership(db, user.id, family_id)
    rows = (
        db.query(Recipe)
        .filter(Recipe.family_id == family_id)
        .order_by(Recipe.title.asc(), Recipe.id.asc())
        .all()
    )
    return [_serialize(recipe) for recipe in rows]


@router.post(
    "",
    response_model=RecipeResponse,
    summary="Create a recipe",
    description="Create a family recipe. Scope: `recipes:write`.",
)
def create_recipe(
    payload: RecipeCreate,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("recipes:write"),
):
    ensure_family_membership(db, user.id, payload.family_id)
    recipe = Recipe(
        family_id=payload.family_id,
        title=payload.title.strip(),
        description=_clean_text(payload.description),
        source_url=_clean_text(payload.source_url),
        servings=payload.servings,
        tags=_sanitize_tags(payload.tags),
        ingredients=_sanitize_ingredients(payload.ingredients),
        instructions=_clean_text(payload.instructions),
        created_by_user_id=user.id,
    )
    db.add(recipe)
    db.commit()
    db.refresh(recipe)
    return _serialize(recipe)


@router.get(
    "/{recipe_id}",
    response_model=RecipeResponse,
    summary="Get a recipe",
    description="Return one recipe visible to the caller. Scope: `recipes:read`.",
    responses={**NOT_FOUND_RESPONSE},
)
def get_recipe(
    recipe_id: int,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("recipes:read"),
):
    return _serialize(_load_for_caller(db, user, recipe_id))


@router.patch(
    "/{recipe_id}",
    response_model=RecipeResponse,
    summary="Update a recipe",
    description="Partially update a family recipe. Scope: `recipes:write`.",
    responses={**NOT_FOUND_RESPONSE},
)
def update_recipe(
    recipe_id: int,
    payload: RecipeUpdate,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("recipes:write"),
):
    recipe = _load_for_caller(db, user, recipe_id)
    fields = payload.model_dump(exclude_unset=True)
    if "title" in fields:
        if fields["title"] is None:
            fields.pop("title")
        else:
            fields["title"] = fields["title"].strip()
    for key in ("description", "source_url", "instructions"):
        if key in fields:
            fields[key] = _clean_text(fields[key])
    if "tags" in fields:
        fields["tags"] = _sanitize_tags(fields["tags"])
    if "ingredients" in fields:
        fields["ingredients"] = _sanitize_ingredients(fields["ingredients"])

    for key, value in fields.items():
        setattr(recipe, key, value)
    db.commit()
    db.refresh(recipe)
    return _serialize(recipe)


@router.delete(
    "/{recipe_id}",
    summary="Delete a recipe",
    description="Delete one family recipe. Scope: `recipes:write`.",
    responses={**NOT_FOUND_RESPONSE},
)
def delete_recipe(
    recipe_id: int,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("recipes:write"),
):
    recipe = _load_for_caller(db, user, recipe_id)
    db.delete(recipe)
    db.commit()
    return {"status": "deleted", "recipe_id": recipe_id}


@router.post(
    "/{recipe_id}/add-to-shopping",
    response_model=RecipeAddToShoppingResponse,
    summary="Push recipe ingredients onto a shopping list",
    description=(
        "Append recipe ingredients onto the given shopping list. Each "
        "ingredient's amount + unit become the shopping item's spec. "
        "Scope: `recipes:write`."
    ),
    responses={**NOT_FOUND_RESPONSE},
)
def add_recipe_ingredients_to_shopping(
    recipe_id: int,
    payload: RecipeAddToShoppingRequest,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("recipes:write"),
):
    recipe = _load_for_caller(db, user, recipe_id)
    shopping_list = db.query(ShoppingList).filter(ShoppingList.id == payload.shopping_list_id).first()
    if shopping_list is None or shopping_list.family_id != recipe.family_id:
        raise HTTPException(status_code=404, detail=error_detail(SHOPPING_LIST_NOT_FOUND))

    recipe_ingredients = _normalize_stored_ingredients(recipe.ingredients)
    by_name: dict[str, NormalizedIngredient] = {
        entry["name"].strip().lower(): entry for entry in recipe_ingredients
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
                    detail=error_detail(RECIPE_INGREDIENT_NOT_IN_RECIPE, name=name.strip()),
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
    return RecipeAddToShoppingResponse(added_count=len(created))
