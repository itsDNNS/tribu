
from app.core.utils import utcnow

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.deps import current_user, ensure_adult, ensure_family_membership
from app.core.activity import record_activity
from app.core.scopes import require_scope
from app.database import get_db
from app.models import ShoppingItem, ShoppingList, ShoppingTemplate, ShoppingTemplateItem, User
from app.core.ws_broadcast import (
    broadcast_item_added,
    broadcast_item_deleted,
    broadcast_item_updated,
    broadcast_items_cleared,
    broadcast_list_created,
    broadcast_list_deleted,
)
from app.core.webhooks import dispatch_webhook_event
from app.schemas import (
    AUTH_RESPONSES,
    NOT_FOUND_RESPONSE,
    ShoppingItemCreate,
    ShoppingItemResponse,
    ShoppingItemUpdate,
    ShoppingListCreate,
    ShoppingListResponse,
    ShoppingTemplateApplyRequest,
    ShoppingTemplateApplyResponse,
    ShoppingTemplateCreate,
    ShoppingTemplateResponse,
    ShoppingTemplateUpdate,
)
from app.core.errors import (
    error_detail,
    SHOPPING_LIST_NOT_FOUND,
    SHOPPING_ITEM_NOT_FOUND,
    SHOPPING_TEMPLATE_NOT_FOUND,
    ADULT_REQUIRED,
)

router = APIRouter(prefix="/shopping", tags=["shopping"], responses={**AUTH_RESPONSES})


def _clean_optional_text(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()
    return cleaned or None


def _capitalize_first(value: str) -> str:
    cleaned = value.strip()
    if not cleaned:
        return cleaned
    return f"{cleaned[:1].upper()}{cleaned[1:]}"


def _normalize_item_name(value: str) -> str:
    item_name = _capitalize_first(value)
    if not item_name:
        raise HTTPException(status_code=422, detail="Shopping item name cannot be blank")
    return item_name


def _same_item_name(left: str, right: str) -> bool:
    return left.strip().casefold() == right.strip().casefold()


def _same_optional_text(left: str | None, right: str | None) -> bool:
    return _clean_optional_text(left) == _clean_optional_text(right)


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


def _template_response(template: ShoppingTemplate) -> ShoppingTemplateResponse:
    ordered_items = sorted(template.items, key=lambda item: item.position)
    return ShoppingTemplateResponse(
        id=template.id,
        family_id=template.family_id,
        name=template.name,
        created_by_user_id=template.created_by_user_id,
        created_at=template.created_at,
        updated_at=template.updated_at,
        item_count=len(ordered_items),
        items=ordered_items,
    )


def _replace_template_items(template: ShoppingTemplate, items) -> None:
    template.items.clear()
    for position, item in enumerate(items):
        template.items.append(
            ShoppingTemplateItem(
                name=item.name,
                spec=item.spec,
                category=item.category,
                position=position,
            )
        )


def _get_template_or_404(db: Session, template_id: int) -> ShoppingTemplate:
    template = db.query(ShoppingTemplate).filter(ShoppingTemplate.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail=error_detail(SHOPPING_TEMPLATE_NOT_FOUND))
    return template


# ── Templates ──────────────────────────────────────────


@router.get(
    "/templates",
    response_model=list[ShoppingTemplateResponse],
    summary="List shopping templates",
    description="Return all saved shopping templates for a family. Scope: `shopping:read`.",
    response_description="List of saved shopping templates",
)
def get_templates(
    family_id: int,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("shopping:read"),
):
    ensure_family_membership(db, user.id, family_id)
    templates = (
        db.query(ShoppingTemplate)
        .filter(ShoppingTemplate.family_id == family_id)
        .order_by(ShoppingTemplate.created_at, ShoppingTemplate.id)
        .all()
    )
    return [_template_response(template) for template in templates]


@router.post(
    "/templates",
    response_model=ShoppingTemplateResponse,
    summary="Create a shopping template",
    description="Create a saved shopping template. Adult only. Scope: `shopping:write`.",
    response_description="The created shopping template",
)
def create_template(
    payload: ShoppingTemplateCreate,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("shopping:write"),
):
    ensure_adult(db, user.id, payload.family_id)
    template = ShoppingTemplate(
        family_id=payload.family_id,
        name=payload.name,
        created_by_user_id=user.id,
    )
    _replace_template_items(template, payload.items)
    db.add(template)
    db.commit()
    db.refresh(template)
    return _template_response(template)


@router.patch(
    "/templates/{template_id}",
    response_model=ShoppingTemplateResponse,
    summary="Update a shopping template",
    description="Update a saved shopping template and optionally replace its items. Adult only. Scope: `shopping:write`.",
    response_description="The updated shopping template",
    responses={**NOT_FOUND_RESPONSE},
)
def update_template(
    template_id: int,
    payload: ShoppingTemplateUpdate,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("shopping:write"),
):
    template = _get_template_or_404(db, template_id)
    ensure_adult(db, user.id, template.family_id)
    if payload.name is not None:
        template.name = payload.name
    if payload.items is not None:
        _replace_template_items(template, payload.items)
    db.commit()
    db.refresh(template)
    return _template_response(template)


@router.delete(
    "/templates/{template_id}",
    summary="Delete a shopping template",
    description="Delete a saved shopping template. Adult only. Scope: `shopping:write`.",
    response_description="Deletion confirmation",
    responses={**NOT_FOUND_RESPONSE},
)
def delete_template(
    template_id: int,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("shopping:write"),
):
    template = _get_template_or_404(db, template_id)
    ensure_adult(db, user.id, template.family_id)
    db.delete(template)
    db.commit()
    return {"status": "deleted", "template_id": template_id}


@router.post(
    "/templates/{template_id}/apply",
    response_model=ShoppingTemplateApplyResponse,
    summary="Add a shopping template to a list",
    description="Copy all template items to an existing shopping list. Adult only. Scope: `shopping:write`.",
    response_description="The created shopping items",
    responses={**NOT_FOUND_RESPONSE},
)
def apply_template(
    template_id: int,
    payload: ShoppingTemplateApplyRequest,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("shopping:write"),
):
    template = _get_template_or_404(db, template_id)
    ensure_adult(db, user.id, template.family_id)
    sl = db.query(ShoppingList).filter(ShoppingList.id == payload.list_id).first()
    if not sl or sl.family_id != template.family_id:
        raise HTTPException(status_code=404, detail=error_detail(SHOPPING_LIST_NOT_FOUND))

    created_items = []
    ordered_template_items = sorted(template.items, key=lambda item: item.position)
    max_position = max((item.position for item in sl.items), default=-1)
    for offset, template_item in enumerate(ordered_template_items):
        item = ShoppingItem(
            list_id=sl.id,
            name=template_item.name,
            spec=template_item.spec,
            category=template_item.category,
            added_by_user_id=user.id,
            position=max_position + offset + 1,
        )
        db.add(item)
        created_items.append(item)

    db.commit()
    for item in created_items:
        db.refresh(item)
        broadcast_item_added(sl.id, ShoppingItemResponse.model_validate(item).model_dump(mode="json"))

    return ShoppingTemplateApplyResponse(
        template_id=template.id,
        list_id=sl.id,
        added_count=len(created_items),
        items=created_items,
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
    db.flush()
    record_activity(
        db,
        family_id=sl.family_id,
        actor_user_id=user.id,
        actor_display_name=user.display_name,
        action="created",
        object_type="shopping_list",
        object_id=sl.id,
        object_label=sl.name,
        verb="created",
        object_kind="shopping list",
    )
    db.commit()
    db.refresh(sl)
    resp = _list_response(sl)
    broadcast_list_created(sl.family_id, resp.model_dump(mode="json"))
    dispatch_webhook_event(
        db,
        family_id=sl.family_id,
        event_type="shopping.list.created",
        data={"list_id": sl.id, "name": sl.name, "created_by_user_id": user.id},
    )
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
    item_name = _normalize_item_name(payload.name)
    item_spec = _clean_optional_text(payload.spec)
    item_category = _clean_optional_text(payload.category)
    checked_match = next(
        (
            existing
            for existing in sl.items
            if existing.checked
            and _same_item_name(existing.name, item_name)
            and _same_optional_text(existing.spec, item_spec)
            and _same_optional_text(existing.category, item_category)
        ),
        None,
    )
    if checked_match:
        checked_match.name = item_name
        checked_match.spec = item_spec
        checked_match.category = item_category
        checked_match.checked = False
        checked_match.checked_at = None
        db.commit()
        db.refresh(checked_match)
        resp = ShoppingItemResponse.model_validate(checked_match).model_dump(mode="json")
        broadcast_item_updated(list_id, resp)
        dispatch_webhook_event(
            db,
            family_id=sl.family_id,
            event_type="shopping.item.updated",
            data={"list_id": list_id, "item_id": checked_match.id, "name": checked_match.name, "checked": checked_match.checked},
        )
        return checked_match

    item = ShoppingItem(
        list_id=list_id,
        name=item_name,
        spec=item_spec,
        category=item_category,
        added_by_user_id=user.id,
    )
    db.add(item)
    db.flush()
    record_activity(
        db,
        family_id=sl.family_id,
        actor_user_id=user.id,
        actor_display_name=user.display_name,
        action="added",
        object_type="shopping_item",
        object_id=item.id,
        object_label=item.name,
        verb="added",
        object_kind="to shopping",
    )
    db.commit()
    db.refresh(item)
    broadcast_item_added(list_id, ShoppingItemResponse.model_validate(item).model_dump(mode="json"))
    dispatch_webhook_event(
        db,
        family_id=sl.family_id,
        event_type="shopping.item.created",
        data={"list_id": list_id, "item_id": item.id, "name": item.name, "checked": item.checked},
    )
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
        item.name = _normalize_item_name(payload.name)
    if payload.spec is not None:
        item.spec = _clean_optional_text(payload.spec)
    if payload.category is not None:
        item.category = _clean_optional_text(payload.category)
    if payload.checked is not None:
        was_checked = item.checked
        item.checked = payload.checked
        item.checked_at = utcnow() if payload.checked else None
        if payload.checked and not was_checked:
            record_activity(
                db,
                family_id=sl.family_id,
                actor_user_id=user.id,
                actor_display_name=user.display_name,
                action="checked",
                object_type="shopping_item",
                object_id=item.id,
                object_label=item.name,
                verb="checked off",
            )

    db.commit()
    db.refresh(item)
    broadcast_item_updated(item.list_id, ShoppingItemResponse.model_validate(item).model_dump(mode="json"))
    dispatch_webhook_event(
        db,
        family_id=sl.family_id,
        event_type="shopping.item.updated",
        data={"list_id": item.list_id, "item_id": item.id, "name": item.name, "checked": item.checked},
    )
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
        ShoppingItem.checked,
    ).delete(synchronize_session="fetch")
    db.commit()
    broadcast_items_cleared(list_id, deleted)
    return {"status": "ok", "deleted_count": deleted}
