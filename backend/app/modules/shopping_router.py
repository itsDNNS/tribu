from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.utils import utcnow

from app.core.deps import current_user, ensure_adult, ensure_family_membership
from app.core.activity import record_activity
from app.core.scopes import require_scope
from app.database import get_db
from app.models import ShoppingItem, ShoppingList, ShoppingStoreLink, ShoppingTemplate, ShoppingTemplateItem, User
from app.core.ws_broadcast import broadcast_shopping_event
from app.core.shopping_notifications import dispatch_shopping_destination_event
from app.core.shopping_domain import (
    InvalidShoppingItemName,
    InvalidStoreUrlTemplate,
    MAX_STORE_LINKS_PER_FAMILY,
    ShoppingItemTransition,
    add_or_merge_shopping_item,
    clean_optional_text,
    normalize_item_name,
    remember_category,
    normalize_store_name,
    store_name_key,
    validate_store_url_template,
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
    ShoppingListUpdate,
    ShoppingStoreLinkCreate,
    ShoppingStoreLinkResponse,
    ShoppingStoreLinkUpdate,
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
    SHOPPING_STORE_LINK_INVALID_TEMPLATE,
    SHOPPING_STORE_LINK_LIMIT_REACHED,
    SHOPPING_STORE_LINK_NAME_TAKEN,
    SHOPPING_STORE_LINK_NOT_FOUND,
    ADULT_REQUIRED,
)

router = APIRouter(prefix="/shopping", tags=["shopping"], responses={**AUTH_RESPONSES})


def _clean_optional_text(value: str | None) -> str | None:
    return clean_optional_text(value)


def _normalize_item_name(value: str) -> str:
    try:
        return normalize_item_name(value)
    except InvalidShoppingItemName:
        raise HTTPException(status_code=422, detail="Shopping item name cannot be blank")


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


def _get_store_link_or_404(db: Session, store_link_id: int) -> ShoppingStoreLink:
    link = db.query(ShoppingStoreLink).filter(ShoppingStoreLink.id == store_link_id).first()
    if not link:
        raise HTTPException(status_code=404, detail=error_detail(SHOPPING_STORE_LINK_NOT_FOUND))
    return link


def _validated_store_template(value: str) -> str:
    try:
        return validate_store_url_template(value)
    except InvalidStoreUrlTemplate as exc:
        raise HTTPException(
            status_code=422,
            detail=error_detail(SHOPPING_STORE_LINK_INVALID_TEMPLATE, reason=exc.reason),
        )


def _clean_store_name(value: str) -> str:
    name = normalize_store_name(value)
    if not name:
        raise HTTPException(status_code=422, detail="Store name cannot be blank")
    return name


def _store_name_is_taken(
    db: Session,
    *,
    family_id: int,
    normalized_name: str,
    exclude_id: int | None = None,
) -> bool:
    query = db.query(ShoppingStoreLink.id).filter(
        ShoppingStoreLink.family_id == family_id,
        ShoppingStoreLink.normalized_name == normalized_name,
    )
    if exclude_id is not None:
        query = query.filter(ShoppingStoreLink.id != exclude_id)
    return query.first() is not None


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

    transitions: list[ShoppingItemTransition] = []
    ordered_template_items = sorted(template.items, key=lambda item: item.position)
    for template_item in ordered_template_items:
        try:
            transition = add_or_merge_shopping_item(
                db,
                shopping_list=sl,
                name=template_item.name,
                spec=template_item.spec,
                category=template_item.category,
                added_by_user_id=user.id,
            )
        except InvalidShoppingItemName:
            raise HTTPException(status_code=422, detail="Shopping item name cannot be blank")
        transitions.append(transition)

    db.commit()
    for transition in transitions:
        item = transition.item
        db.refresh(item)
        broadcast_shopping_event(
            "list",
            sl.id,
            "item_added" if transition.action == "created" else "item_updated",
            {"item": ShoppingItemResponse.model_validate(item).model_dump(mode="json")},
        )
    if transitions:
        dispatch_shopping_destination_event(
            family_id=sl.family_id,
            event_type="shopping.item.changed",
            title="Shopping items added",
            body=f'{user.display_name or "Someone"} added {len(transitions)} items from "{template.name}" to "{sl.name}".',
            link=f"/shopping?list={sl.id}",
            source_type="shopping_list",
            source_id=sl.id,
            action="template_applied",
        )

    return ShoppingTemplateApplyResponse(
        template_id=template.id,
        list_id=sl.id,
        added_count=len(transitions),
        created_count=sum(result.action == "created" for result in transitions),
        merged_count=sum(result.action != "created" for result in transitions),
        items=[result.item for result in transitions],
    )


# ── Store links ──────────────────────────────────────────


@router.get(
    "/store-links",
    response_model=list[ShoppingStoreLinkResponse],
    summary="List shopping store search links",
    description="Return store search links configured for a family. Adult only. Scope: `shopping:read`.",
    response_description="List of configured store search links",
)
def get_store_links(
    family_id: int,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("shopping:read"),
):
    ensure_adult(db, user.id, family_id)
    return (
        db.query(ShoppingStoreLink)
        .filter(ShoppingStoreLink.family_id == family_id)
        .order_by(ShoppingStoreLink.created_at, ShoppingStoreLink.id)
        .all()
    )


@router.post(
    "/store-links",
    response_model=ShoppingStoreLinkResponse,
    summary="Create a shopping store search link",
    description="Create a store search link for a family. Adult only. Scope: `shopping:write`.",
    response_description="The created store search link",
)
def create_store_link(
    payload: ShoppingStoreLinkCreate,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("shopping:write"),
):
    ensure_adult(db, user.id, payload.family_id)
    name = _clean_store_name(payload.name)
    url_template = _validated_store_template(payload.url_template)
    count = db.query(ShoppingStoreLink).filter(ShoppingStoreLink.family_id == payload.family_id).count()
    if count >= MAX_STORE_LINKS_PER_FAMILY:
        raise HTTPException(
            status_code=422,
            detail=error_detail(SHOPPING_STORE_LINK_LIMIT_REACHED, limit=MAX_STORE_LINKS_PER_FAMILY),
        )
    normalized_name = store_name_key(name)
    if _store_name_is_taken(db, family_id=payload.family_id, normalized_name=normalized_name):
        raise HTTPException(status_code=409, detail=error_detail(SHOPPING_STORE_LINK_NAME_TAKEN))
    link = ShoppingStoreLink(
        family_id=payload.family_id,
        name=name,
        normalized_name=normalized_name,
        url_template=url_template,
        created_by_user_id=user.id,
    )
    db.add(link)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail=error_detail(SHOPPING_STORE_LINK_NAME_TAKEN))
    db.refresh(link)
    return link


@router.patch(
    "/store-links/{store_link_id}",
    response_model=ShoppingStoreLinkResponse,
    summary="Update a shopping store search link",
    description="Update a configured store search link. Adult only. Scope: `shopping:write`.",
    response_description="The updated store search link",
    responses={**NOT_FOUND_RESPONSE},
)
def update_store_link(
    store_link_id: int,
    payload: ShoppingStoreLinkUpdate,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("shopping:write"),
):
    link = _get_store_link_or_404(db, store_link_id)
    ensure_adult(db, user.id, link.family_id)
    if payload.name is not None:
        name = _clean_store_name(payload.name)
        normalized_name = store_name_key(name)
        if _store_name_is_taken(
            db,
            family_id=link.family_id,
            normalized_name=normalized_name,
            exclude_id=link.id,
        ):
            raise HTTPException(status_code=409, detail=error_detail(SHOPPING_STORE_LINK_NAME_TAKEN))
        link.name = name
        link.normalized_name = normalized_name
    if payload.url_template is not None:
        link.url_template = _validated_store_template(payload.url_template)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail=error_detail(SHOPPING_STORE_LINK_NAME_TAKEN))
    db.refresh(link)
    return link


@router.delete(
    "/store-links/{store_link_id}",
    summary="Delete a shopping store search link",
    description="Delete a configured store search link. Adult only. Scope: `shopping:write`.",
    response_description="Deletion confirmation",
    responses={**NOT_FOUND_RESPONSE},
)
def delete_store_link(
    store_link_id: int,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("shopping:write"),
):
    link = _get_store_link_or_404(db, store_link_id)
    ensure_adult(db, user.id, link.family_id)
    db.delete(link)
    db.commit()
    return {"status": "deleted", "store_link_id": store_link_id}


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
    broadcast_shopping_event(
        "family",
        sl.family_id,
        "list_created",
        {"list": resp.model_dump(mode="json")},
    )
    dispatch_webhook_event(
        db,
        family_id=sl.family_id,
        event_type="shopping.list.created",
        data={"list_id": sl.id, "name": sl.name, "created_by_user_id": user.id},
    )
    dispatch_shopping_destination_event(
        family_id=sl.family_id,
        event_type="shopping.list.changed",
        title="Shopping list created",
        body=f'{user.display_name or "Someone"} created shopping list "{sl.name}".',
        link=f"/shopping?list={sl.id}",
        source_type="shopping_list",
        source_id=sl.id,
        action="created",
    )
    return resp




@router.patch(
    "/lists/{list_id}",
    response_model=ShoppingListResponse,
    summary="Update a shopping list",
    description="Rename a shopping list. Broadcasts via WebSocket. Adult only. Scope: `shopping:write`.",
    response_description="The updated shopping list",
    responses={**NOT_FOUND_RESPONSE},
)
def update_list(
    list_id: int,
    payload: ShoppingListUpdate,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("shopping:write"),
):
    sl = db.query(ShoppingList).filter(ShoppingList.id == list_id).first()
    if not sl:
        raise HTTPException(status_code=404, detail=error_detail(SHOPPING_LIST_NOT_FOUND))
    ensure_adult(db, user.id, sl.family_id)
    new_name = payload.name.strip()
    if not new_name:
        raise HTTPException(status_code=422, detail="Shopping list name cannot be blank")
    old_name = sl.name
    sl.name = new_name
    record_activity(
        db,
        family_id=sl.family_id,
        actor_user_id=user.id,
        actor_display_name=user.display_name,
        action="renamed",
        object_type="shopping_list",
        object_id=sl.id,
        object_label=sl.name,
        verb="renamed",
        object_kind="shopping list",
    )
    db.commit()
    db.refresh(sl)
    resp = _list_response(sl)
    broadcast_shopping_event(
        "family",
        sl.family_id,
        "list_updated",
        {"list": resp.model_dump(mode="json")},
    )
    dispatch_webhook_event(
        db,
        family_id=sl.family_id,
        event_type="shopping.list.updated",
        data={"list_id": sl.id, "name": sl.name, "old_name": old_name},
    )
    dispatch_shopping_destination_event(
        family_id=sl.family_id,
        event_type="shopping.list.changed",
        title="Shopping list renamed",
        body=f'{user.display_name or "Someone"} renamed shopping list "{old_name}" to "{sl.name}".',
        link=f"/shopping?list={sl.id}",
        source_type="shopping_list",
        source_id=sl.id,
        action="renamed",
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
    list_name = sl.name
    db.delete(sl)
    db.commit()
    broadcast_shopping_event("family", family_id, "list_deleted", {"list_id": list_id})
    dispatch_shopping_destination_event(
        family_id=family_id,
        event_type="shopping.list.changed",
        title="Shopping list deleted",
        body=f'{user.display_name or "Someone"} deleted shopping list "{list_name}".',
        link="/shopping",
        source_type="shopping_list",
        source_id=list_id,
        action="deleted",
    )
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
    try:
        transition = add_or_merge_shopping_item(
            db,
            shopping_list=sl,
            name=payload.name,
            spec=payload.spec,
            category=payload.category,
            added_by_user_id=user.id,
        )
    except InvalidShoppingItemName:
        raise HTTPException(status_code=422, detail="Shopping item name cannot be blank")
    item = transition.item
    if transition.action == "created":
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
    created = transition.action == "created"
    broadcast_shopping_event(
        "list",
        list_id,
        "item_added" if created else "item_updated",
        {"item": ShoppingItemResponse.model_validate(item).model_dump(mode="json")},
    )
    dispatch_webhook_event(
        db,
        family_id=sl.family_id,
        event_type="shopping.item.created" if created else "shopping.item.updated",
        data={"list_id": list_id, "item_id": item.id, "name": item.name, "checked": item.checked},
    )
    if transition.action == "created":
        title = "Shopping item added"
        body = f'{user.display_name or "Someone"} added "{item.name}" to "{sl.name}".'
    elif transition.action == "merged":
        title = "Shopping item merged"
        body = f'{user.display_name or "Someone"} merged "{item.name}" on "{sl.name}".'
    else:
        title = "Shopping item restored"
        body = f'{user.display_name or "Someone"} restored "{item.name}" on "{sl.name}".'
    dispatch_shopping_destination_event(
        family_id=sl.family_id,
        event_type="shopping.item.changed",
        title=title,
        body=body,
        link=f"/shopping?list={list_id}&item={item.id}",
        source_type="shopping_item",
        source_id=item.id,
        action=transition.action,
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
    fields = payload.model_dump(exclude_unset=True)
    if not membership.is_adult:
        if set(fields.keys()) - {"checked"}:
            raise HTTPException(status_code=403, detail=error_detail(ADULT_REQUIRED))

    old_list_id = item.list_id
    old_list_name = sl.name
    target_list = sl
    moved = False

    if payload.name is not None:
        item.name = _normalize_item_name(payload.name)
    if "spec" in fields:
        item.spec = _clean_optional_text(payload.spec)
    if "category" in fields:
        item.category = _clean_optional_text(payload.category)
        if item.category is not None:
            remember_category(
                db,
                family_id=sl.family_id,
                name=item.name,
                category=item.category,
            )
    if payload.list_id is not None and payload.list_id != item.list_id:
        target_list = db.query(ShoppingList).filter(ShoppingList.id == payload.list_id).first()
        if not target_list or target_list.family_id != sl.family_id:
            raise HTTPException(status_code=404, detail=error_detail(SHOPPING_LIST_NOT_FOUND))
        item.list_id = target_list.id
        moved = True
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

    if moved:
        record_activity(
            db,
            family_id=sl.family_id,
            actor_user_id=user.id,
            actor_display_name=user.display_name,
            action="moved",
            object_type="shopping_item",
            object_id=item.id,
            object_label=item.name,
            verb="moved",
            object_kind="shopping item",
        )

    db.commit()
    db.refresh(item)
    item_payload = ShoppingItemResponse.model_validate(item).model_dump(mode="json")
    if moved:
        broadcast_shopping_event("list", old_list_id, "item_deleted", {"item_id": item.id})
        broadcast_shopping_event("list", item.list_id, "item_added", {"item": item_payload})
    else:
        broadcast_shopping_event(
            "list",
            item.list_id,
            "item_updated",
            {"item": item_payload},
        )
    webhook_data = {"list_id": item.list_id, "item_id": item.id, "name": item.name, "checked": item.checked}
    if moved:
        webhook_data["from_list_id"] = old_list_id
    dispatch_webhook_event(
        db,
        family_id=sl.family_id,
        event_type="shopping.item.updated",
        data=webhook_data,
    )
    if moved:
        item_action = "moved"
        destination_body = f'{user.display_name or "Someone"} moved "{item.name}" from "{old_list_name}" to "{target_list.name}".'
    elif payload.checked is True:
        item_action = "checked"
        destination_body = f'{user.display_name or "Someone"} checked "{item.name}" on "{sl.name}".'
    elif payload.checked is False:
        item_action = "unchecked"
        destination_body = f'{user.display_name or "Someone"} unchecked "{item.name}" on "{sl.name}".'
    else:
        item_action = "updated"
        destination_body = f'{user.display_name or "Someone"} updated "{item.name}" on "{sl.name}".'
    dispatch_shopping_destination_event(
        family_id=sl.family_id,
        event_type="shopping.item.changed",
        title="Shopping item updated",
        body=destination_body,
        link=f"/shopping?list={item.list_id}&item={item.id}",
        source_type="shopping_item",
        source_id=item.id,
        action=item_action,
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
    item_name = item.name
    db.delete(item)
    db.commit()
    broadcast_shopping_event("list", list_id, "item_deleted", {"item_id": item_id})
    dispatch_shopping_destination_event(
        family_id=sl.family_id,
        event_type="shopping.item.changed",
        title="Shopping item deleted",
        body=f'{user.display_name or "Someone"} deleted "{item_name}" from "{sl.name}".',
        link=f"/shopping?list={list_id}",
        source_type="shopping_item",
        source_id=item_id,
        action="deleted",
    )
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
    broadcast_shopping_event(
        "list",
        list_id,
        "items_cleared",
        {"list_id": list_id, "deleted_count": deleted},
    )
    if deleted:
        dispatch_shopping_destination_event(
            family_id=sl.family_id,
            event_type="shopping.item.changed",
            title="Shopping items cleared",
            body=f'{user.display_name or "Someone"} cleared {deleted} checked items from "{sl.name}".',
            link=f"/shopping?list={list_id}",
            source_type="shopping_list",
            source_id=list_id,
            action="clear_checked",
        )
    return {"status": "ok", "deleted_count": deleted}
