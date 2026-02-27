from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.deps import current_user, ensure_adult, ensure_family_membership
from app.core.scopes import require_scope
from app.database import get_db
from app.models import ShoppingItem, ShoppingList, User
from app.core.ws_broadcast import (
    broadcast_item_added,
    broadcast_item_deleted,
    broadcast_item_updated,
    broadcast_items_cleared,
    broadcast_list_created,
    broadcast_list_deleted,
)
from app.schemas import (
    AUTH_RESPONSES,
    NOT_FOUND_RESPONSE,
    ErrorResponse,
    ShoppingItemCreate,
    ShoppingItemResponse,
    ShoppingItemUpdate,
    ShoppingListCreate,
    ShoppingListResponse,
)
from app.core.errors import error_detail, SHOPPING_LIST_NOT_FOUND, SHOPPING_ITEM_NOT_FOUND, ADULT_REQUIRED

router = APIRouter(prefix="/shopping", tags=["shopping"], responses={**AUTH_RESPONSES})


def _list_response(sl: ShoppingList) -> ShoppingListResponse:
    total = len(sl.items)
    checked = sum(1 for i in sl.items if i.checked)
    return ShoppingListResponse(
        id=sl.id,
        family_id=sl.family_id,
        name=sl.name,
        created_by_user_id=sl.created_by_user_id,
        created_at=sl.created_at,
        item_count=total,
        checked_count=checked,
    )


# ── Lists ──────────────────────────────────────────────


@router.get(
    "/lists",
    response_model=list[ShoppingListResponse],
    summary="List shopping lists",
    description="Return all shopping lists for a family with item counts. Scope: `shopping:read`.",
    response_description="List of shopping lists",
)
def get_lists(
    family_id: int,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("shopping:read"),
):
    ensure_family_membership(db, user.id, family_id)
    lists = db.query(ShoppingList).filter(ShoppingList.family_id == family_id).order_by(ShoppingList.created_at).all()
    return [_list_response(sl) for sl in lists]


@router.post(
    "/lists",
    response_model=ShoppingListResponse,
    summary="Create a shopping list",
    description="Create a new shopping list. Broadcasts via WebSocket. Adult only. Scope: `shopping:write`.",
    response_description="The created shopping list",
)
def create_list(
    payload: ShoppingListCreate,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("shopping:write"),
):
    ensure_adult(db, user.id, payload.family_id)
    sl = ShoppingList(
        family_id=payload.family_id,
        name=payload.name,
        created_by_user_id=user.id,
    )
    db.add(sl)
    db.commit()
    db.refresh(sl)
    resp = _list_response(sl)
    broadcast_list_created(sl.family_id, resp.model_dump(mode="json"))
    return resp


@router.delete(
    "/lists/{list_id}",
    summary="Delete a shopping list",
    description="Delete a shopping list and all its items. Broadcasts via WebSocket. Adult only. Scope: `shopping:write`.",
    response_description="Deletion confirmation",
    responses={**NOT_FOUND_RESPONSE},
)
def delete_list(
    list_id: int,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("shopping:write"),
):
    sl = db.query(ShoppingList).filter(ShoppingList.id == list_id).first()
    if not sl:
        raise HTTPException(status_code=404, detail=error_detail(SHOPPING_LIST_NOT_FOUND))
    family_id = sl.family_id
    ensure_adult(db, user.id, family_id)
    db.delete(sl)
    db.commit()
    broadcast_list_deleted(family_id, list_id)
    return {"status": "deleted", "list_id": list_id}


# ── Items ──────────────────────────────────────────────


@router.get(
    "/lists/{list_id}/items",
    response_model=list[ShoppingItemResponse],
    summary="List shopping items",
    description="Return all items in a shopping list, sorted by checked status then creation date. Scope: `shopping:read`.",
    response_description="List of shopping items",
    responses={**NOT_FOUND_RESPONSE},
)
def get_items(
    list_id: int,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("shopping:read"),
):
    sl = db.query(ShoppingList).filter(ShoppingList.id == list_id).first()
    if not sl:
        raise HTTPException(status_code=404, detail=error_detail(SHOPPING_LIST_NOT_FOUND))
    ensure_family_membership(db, user.id, sl.family_id)
    items = (
        db.query(ShoppingItem)
        .filter(ShoppingItem.list_id == list_id)
        .order_by(ShoppingItem.checked, ShoppingItem.created_at)
        .all()
    )
    return items


@router.post(
    "/lists/{list_id}/items",
    response_model=ShoppingItemResponse,
    summary="Add a shopping item",
    description="Add an item to a shopping list. Broadcasts via WebSocket. Adult only. Scope: `shopping:write`.",
    response_description="The created shopping item",
    responses={**NOT_FOUND_RESPONSE},
)
def add_item(
    list_id: int,
    payload: ShoppingItemCreate,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("shopping:write"),
):
    sl = db.query(ShoppingList).filter(ShoppingList.id == list_id).first()
    if not sl:
        raise HTTPException(status_code=404, detail=error_detail(SHOPPING_LIST_NOT_FOUND))
    ensure_adult(db, user.id, sl.family_id)
    item = ShoppingItem(
        list_id=list_id,
        name=payload.name,
        spec=payload.spec,
        added_by_user_id=user.id,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    broadcast_item_added(list_id, ShoppingItemResponse.model_validate(item).model_dump(mode="json"))
    return item


@router.patch(
    "/items/{item_id}",
    response_model=ShoppingItemResponse,
    summary="Update a shopping item",
    description="Update a shopping item's name, spec, or checked state. Children can only toggle checked. Broadcasts via WebSocket. Scope: `shopping:write`.",
    response_description="The updated shopping item",
    responses={**NOT_FOUND_RESPONSE},
)
def update_item(
    item_id: int,
    payload: ShoppingItemUpdate,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("shopping:write"),
):
    item = db.query(ShoppingItem).filter(ShoppingItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail=error_detail(SHOPPING_ITEM_NOT_FOUND))
    sl = db.query(ShoppingList).filter(ShoppingList.id == item.list_id).first()
    membership = ensure_family_membership(db, user.id, sl.family_id)
    if not membership.is_adult:
        fields = payload.model_dump(exclude_unset=True)
        if set(fields.keys()) - {"checked"}:
            raise HTTPException(status_code=403, detail=error_detail(ADULT_REQUIRED))

    if payload.name is not None:
        item.name = payload.name
    if payload.spec is not None:
        item.spec = payload.spec
    if payload.checked is not None:
        item.checked = payload.checked
        item.checked_at = datetime.utcnow() if payload.checked else None

    db.commit()
    db.refresh(item)
    broadcast_item_updated(item.list_id, ShoppingItemResponse.model_validate(item).model_dump(mode="json"))
    return item


@router.delete(
    "/items/{item_id}",
    summary="Delete a shopping item",
    description="Remove an item from its shopping list. Broadcasts via WebSocket. Adult only. Scope: `shopping:write`.",
    response_description="Deletion confirmation",
    responses={**NOT_FOUND_RESPONSE},
)
def delete_item(
    item_id: int,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("shopping:write"),
):
    item = db.query(ShoppingItem).filter(ShoppingItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail=error_detail(SHOPPING_ITEM_NOT_FOUND))
    sl = db.query(ShoppingList).filter(ShoppingList.id == item.list_id).first()
    ensure_adult(db, user.id, sl.family_id)
    list_id = item.list_id
    db.delete(item)
    db.commit()
    broadcast_item_deleted(list_id, item_id)
    return {"status": "deleted", "item_id": item_id}


@router.delete(
    "/lists/{list_id}/checked",
    summary="Clear checked items",
    description="Remove all checked items from a shopping list. Broadcasts via WebSocket. Adult only. Scope: `shopping:write`.",
    response_description="Number of deleted items",
    responses={**NOT_FOUND_RESPONSE},
)
def clear_checked(
    list_id: int,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("shopping:write"),
):
    sl = db.query(ShoppingList).filter(ShoppingList.id == list_id).first()
    if not sl:
        raise HTTPException(status_code=404, detail=error_detail(SHOPPING_LIST_NOT_FOUND))
    ensure_adult(db, user.id, sl.family_id)
    deleted = db.query(ShoppingItem).filter(
        ShoppingItem.list_id == list_id,
        ShoppingItem.checked == True,
    ).delete(synchronize_session="fetch")
    db.commit()
    broadcast_items_cleared(list_id, deleted)
    return {"status": "ok", "deleted_count": deleted}
