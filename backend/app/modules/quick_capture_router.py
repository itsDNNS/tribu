"""Universal quick capture API."""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.activity import record_activity
from app.core.deps import current_user, ensure_adult
from app.core.errors import error_detail
from app.core.scopes import require_scope
from app.core.shopping_notifications import dispatch_shopping_destination_event
from app.core.webhooks import dispatch_webhook_event
from app.database import get_db
from app.models import QuickCaptureItem, ShoppingItem, ShoppingList, Task, User
from app.schemas import (
    NOT_FOUND_RESPONSE,
    PaginatedQuickCaptureInbox,
    QuickCaptureConvertRequest,
    QuickCaptureConvertResponse,
    QuickCaptureCreate,
    QuickCaptureDestination,
    QuickCaptureResponse,
    ShoppingItemResponse,
    TaskResponse,
)

router = APIRouter(prefix="/quick-capture", tags=["quick-capture"])

QUICK_CAPTURE_NOT_FOUND = "QUICK_CAPTURE_NOT_FOUND"
QUICK_CAPTURE_ALREADY_TRIAGED = "QUICK_CAPTURE_ALREADY_TRIAGED"
QUICK_CAPTURE_SHOPPING_LIST_NAME = "Quick capture"


def _capture_text(raw: str) -> str:
    text = " ".join(raw.split())
    if not text:
        raise HTTPException(status_code=400, detail=error_detail("INVALID_QUICK_CAPTURE_TEXT"))
    return text[:240]


def _task_response(task: Task) -> TaskResponse:
    return TaskResponse.model_validate(task)


def _shopping_item_response(item: ShoppingItem) -> ShoppingItemResponse:
    return ShoppingItemResponse.model_validate(item)


def _get_or_create_quick_list(db: Session, family_id: int, user_id: int) -> tuple[ShoppingList, bool]:
    shopping_list = (
        db.query(ShoppingList)
        .filter(ShoppingList.family_id == family_id, ShoppingList.name == QUICK_CAPTURE_SHOPPING_LIST_NAME)
        .order_by(ShoppingList.created_at.asc())
        .first()
    )
    if shopping_list:
        return shopping_list, False
    shopping_list = ShoppingList(
        family_id=family_id,
        name=QUICK_CAPTURE_SHOPPING_LIST_NAME,
        created_by_user_id=user_id,
    )
    db.add(shopping_list)
    db.flush()
    return shopping_list, True


def _create_task(db: Session, *, family_id: int, user: User, text: str) -> Task:
    task = Task(
        family_id=family_id,
        title=text,
        priority="normal",
        created_by_user_id=user.id,
    )
    db.add(task)
    db.flush()
    record_activity(
        db,
        family_id=family_id,
        actor_user_id=user.id,
        actor_display_name=user.display_name,
        action="created",
        object_type="task",
        object_id=task.id,
        object_label=task.title,
        verb="created",
        object_kind="task",
    )
    return task


def _create_shopping_item(db: Session, *, family_id: int, user: User, text: str) -> tuple[ShoppingItem, ShoppingList, bool]:
    shopping_list, shopping_list_created = _get_or_create_quick_list(db, family_id, user.id)
    item = ShoppingItem(
        list_id=shopping_list.id,
        name=text,
        added_by_user_id=user.id,
    )
    db.add(item)
    db.flush()
    record_activity(
        db,
        family_id=family_id,
        actor_user_id=user.id,
        actor_display_name=user.display_name,
        action="added",
        object_type="shopping_item",
        object_id=item.id,
        object_label=item.name,
        verb="added",
        object_kind="to shopping",
    )
    return item, shopping_list, shopping_list_created


def _created_payload(destination: QuickCaptureDestination, created_item: Task | ShoppingItem) -> QuickCaptureResponse:
    if destination == QuickCaptureDestination.task:
        return QuickCaptureResponse(destination=destination, created_item=_task_response(created_item))
    return QuickCaptureResponse(destination=destination, created_item=_shopping_item_response(created_item))


def _dispatch_quick_capture_shopping_events(
    *,
    family_id: int,
    user: User,
    shopping_list: ShoppingList,
    item: ShoppingItem,
    shopping_list_created: bool,
) -> None:
    if shopping_list_created:
        dispatch_shopping_destination_event(
            family_id=family_id,
            event_type="shopping.list.changed",
            title="Shopping list created",
            body=f'{user.display_name or "Someone"} created shopping list "{shopping_list.name}" from quick capture.',
            link=f"/shopping?list={shopping_list.id}",
            source_type="shopping_list",
            source_id=shopping_list.id,
            action="quick_capture_list_created",
        )
    dispatch_shopping_destination_event(
        family_id=family_id,
        event_type="shopping.item.changed",
        title="Shopping item added",
        body=f'{user.display_name or "Someone"} added "{item.name}" to "{shopping_list.name}" from quick capture.',
        link=f"/shopping?list={shopping_list.id}&item={item.id}",
        source_type="shopping_item",
        source_id=item.id,
        action="quick_capture_added",
    )


@router.post(
    "",
    response_model=QuickCaptureResponse,
    summary="Capture a quick note",
    description="Capture text into the inbox or route it directly to a task or shopping item. Adult only. Scope: `quick_capture:write`.",
)
def create_quick_capture(
    payload: QuickCaptureCreate,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("quick_capture:write"),
):
    ensure_adult(db, user.id, payload.family_id)
    text = _capture_text(payload.text)

    if payload.destination == QuickCaptureDestination.task:
        task = _create_task(db, family_id=payload.family_id, user=user, text=text)
        db.commit()
        db.refresh(task)
        dispatch_webhook_event(
            db,
            family_id=payload.family_id,
            event_type="task.created",
            data={"task_id": task.id, "title": task.title, "status": task.status, "source": "quick_capture"},
        )
        return _created_payload(payload.destination, task)

    if payload.destination == QuickCaptureDestination.shopping:
        item, shopping_list, shopping_list_created = _create_shopping_item(db, family_id=payload.family_id, user=user, text=text)
        db.commit()
        db.refresh(item)
        db.refresh(shopping_list)
        dispatch_webhook_event(
            db,
            family_id=payload.family_id,
            event_type="shopping.item.created",
            data={"list_id": item.list_id, "item_id": item.id, "name": item.name, "source": "quick_capture"},
        )
        _dispatch_quick_capture_shopping_events(
            family_id=payload.family_id,
            user=user,
            shopping_list=shopping_list,
            item=item,
            shopping_list_created=shopping_list_created,
        )
        return _created_payload(payload.destination, item)

    item = QuickCaptureItem(
        family_id=payload.family_id,
        text=text,
        created_by_user_id=user.id,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    dispatch_webhook_event(
        db,
        family_id=payload.family_id,
        event_type="quick_capture.created",
        data={"quick_capture_id": item.id, "status": item.status},
    )
    return QuickCaptureResponse(destination=QuickCaptureDestination.inbox, inbox_item=item)


@router.get(
    "/inbox",
    response_model=PaginatedQuickCaptureInbox,
    summary="List quick capture inbox items",
    description="Return open quick capture inbox items for a family. Scope: `quick_capture:read`.",
)
def list_quick_capture_inbox(
    family_id: int,
    limit: int = Query(10, ge=1, le=50),
    offset: int = Query(0, ge=0),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("quick_capture:read"),
):
    ensure_adult(db, user.id, family_id)
    query = db.query(QuickCaptureItem).filter(
        QuickCaptureItem.family_id == family_id,
        QuickCaptureItem.status == "open",
    )
    total = query.count()
    items = query.order_by(QuickCaptureItem.created_at.desc(), QuickCaptureItem.id.desc()).offset(offset).limit(limit).all()
    return PaginatedQuickCaptureInbox(items=items, total=total, offset=offset, limit=limit)


def _get_inbox_item(db: Session, item_id: int) -> QuickCaptureItem:
    item = db.query(QuickCaptureItem).filter(QuickCaptureItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail=error_detail(QUICK_CAPTURE_NOT_FOUND))
    return item


def _ensure_open(item: QuickCaptureItem) -> None:
    if item.status != "open":
        raise HTTPException(status_code=409, detail=error_detail(QUICK_CAPTURE_ALREADY_TRIAGED))


@router.post(
    "/inbox/{item_id}/convert",
    response_model=QuickCaptureConvertResponse,
    summary="Convert an inbox item",
    description="Convert a quick capture inbox item to a task or shopping item. Adult only. Scope: `quick_capture:write`.",
    responses={**NOT_FOUND_RESPONSE},
)
def convert_quick_capture_item(
    item_id: int,
    payload: QuickCaptureConvertRequest,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("quick_capture:write"),
):
    item = _get_inbox_item(db, item_id)
    ensure_adult(db, user.id, item.family_id)
    _ensure_open(item)
    if payload.destination == QuickCaptureDestination.inbox:
        raise HTTPException(status_code=400, detail=error_detail("INVALID_QUICK_CAPTURE_DESTINATION"))

    shopping_list = None
    shopping_list_created = False
    if payload.destination == QuickCaptureDestination.task:
        created = _create_task(db, family_id=item.family_id, user=user, text=item.text)
    else:
        created, shopping_list, shopping_list_created = _create_shopping_item(db, family_id=item.family_id, user=user, text=item.text)

    item.status = "converted"
    item.converted_to = payload.destination.value
    item.converted_object_id = created.id
    db.commit()
    db.refresh(item)
    db.refresh(created)
    if payload.destination == QuickCaptureDestination.shopping and shopping_list is not None:
        db.refresh(shopping_list)
        _dispatch_quick_capture_shopping_events(
            family_id=item.family_id,
            user=user,
            shopping_list=shopping_list,
            item=created,
            shopping_list_created=shopping_list_created,
        )
    return QuickCaptureConvertResponse(
        status=item.status,
        converted_to=payload.destination,
        inbox_item=item,
        converted_item=_task_response(created) if payload.destination == QuickCaptureDestination.task else _shopping_item_response(created),
    )


@router.post(
    "/inbox/{item_id}/dismiss",
    response_model=QuickCaptureConvertResponse,
    summary="Dismiss an inbox item",
    description="Dismiss an open quick capture inbox item. Adult only. Scope: `quick_capture:write`.",
    responses={**NOT_FOUND_RESPONSE},
)
def dismiss_quick_capture_item(
    item_id: int,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("quick_capture:write"),
):
    item = _get_inbox_item(db, item_id)
    ensure_adult(db, user.id, item.family_id)
    _ensure_open(item)
    item.status = "dismissed"
    db.commit()
    db.refresh(item)
    return QuickCaptureConvertResponse(status=item.status, converted_to=None, inbox_item=item, converted_item=None)
