from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.deps import current_user, ensure_family_membership
from app.core.scopes import require_scope
from app.database import get_db
from app.models import ShoppingItem, ShoppingList, User
from app.schemas import (
    ShoppingItemCreate,
    ShoppingItemResponse,
    ShoppingItemUpdate,
    ShoppingListCreate,
    ShoppingListResponse,
)

router = APIRouter(prefix="/shopping", tags=["shopping"])


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


@router.get("/lists", response_model=list[ShoppingListResponse])
def get_lists(
    family_id: int,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("shopping:read"),
):
    ensure_family_membership(db, user.id, family_id)
    lists = db.query(ShoppingList).filter(ShoppingList.family_id == family_id).order_by(ShoppingList.created_at).all()
    return [_list_response(sl) for sl in lists]


@router.post("/lists", response_model=ShoppingListResponse)
def create_list(
    payload: ShoppingListCreate,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("shopping:write"),
):
    ensure_family_membership(db, user.id, payload.family_id)
    sl = ShoppingList(
        family_id=payload.family_id,
        name=payload.name,
        created_by_user_id=user.id,
    )
    db.add(sl)
    db.commit()
    db.refresh(sl)
    return _list_response(sl)


@router.delete("/lists/{list_id}")
def delete_list(
    list_id: int,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("shopping:write"),
):
    sl = db.query(ShoppingList).filter(ShoppingList.id == list_id).first()
    if not sl:
        raise HTTPException(status_code=404, detail="Liste nicht gefunden")
    ensure_family_membership(db, user.id, sl.family_id)
    db.delete(sl)
    db.commit()
    return {"status": "deleted", "list_id": list_id}


# ── Items ──────────────────────────────────────────────


@router.get("/lists/{list_id}/items", response_model=list[ShoppingItemResponse])
def get_items(
    list_id: int,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("shopping:read"),
):
    sl = db.query(ShoppingList).filter(ShoppingList.id == list_id).first()
    if not sl:
        raise HTTPException(status_code=404, detail="Liste nicht gefunden")
    ensure_family_membership(db, user.id, sl.family_id)
    items = (
        db.query(ShoppingItem)
        .filter(ShoppingItem.list_id == list_id)
        .order_by(ShoppingItem.checked, ShoppingItem.created_at)
        .all()
    )
    return items


@router.post("/lists/{list_id}/items", response_model=ShoppingItemResponse)
def add_item(
    list_id: int,
    payload: ShoppingItemCreate,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("shopping:write"),
):
    sl = db.query(ShoppingList).filter(ShoppingList.id == list_id).first()
    if not sl:
        raise HTTPException(status_code=404, detail="Liste nicht gefunden")
    ensure_family_membership(db, user.id, sl.family_id)
    item = ShoppingItem(
        list_id=list_id,
        name=payload.name,
        spec=payload.spec,
        added_by_user_id=user.id,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.patch("/items/{item_id}", response_model=ShoppingItemResponse)
def update_item(
    item_id: int,
    payload: ShoppingItemUpdate,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("shopping:write"),
):
    item = db.query(ShoppingItem).filter(ShoppingItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Artikel nicht gefunden")
    sl = db.query(ShoppingList).filter(ShoppingList.id == item.list_id).first()
    ensure_family_membership(db, user.id, sl.family_id)

    if payload.name is not None:
        item.name = payload.name
    if payload.spec is not None:
        item.spec = payload.spec
    if payload.checked is not None:
        item.checked = payload.checked
        item.checked_at = datetime.utcnow() if payload.checked else None

    db.commit()
    db.refresh(item)
    return item


@router.delete("/items/{item_id}")
def delete_item(
    item_id: int,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("shopping:write"),
):
    item = db.query(ShoppingItem).filter(ShoppingItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Artikel nicht gefunden")
    sl = db.query(ShoppingList).filter(ShoppingList.id == item.list_id).first()
    ensure_family_membership(db, user.id, sl.family_id)
    db.delete(item)
    db.commit()
    return {"status": "deleted", "item_id": item_id}


@router.delete("/lists/{list_id}/checked")
def clear_checked(
    list_id: int,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("shopping:write"),
):
    sl = db.query(ShoppingList).filter(ShoppingList.id == list_id).first()
    if not sl:
        raise HTTPException(status_code=404, detail="Liste nicht gefunden")
    ensure_family_membership(db, user.id, sl.family_id)
    deleted = db.query(ShoppingItem).filter(
        ShoppingItem.list_id == list_id,
        ShoppingItem.checked == True,
    ).delete(synchronize_session="fetch")
    db.commit()
    return {"status": "ok", "deleted_count": deleted}
