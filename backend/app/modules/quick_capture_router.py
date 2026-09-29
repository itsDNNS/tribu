"""Universal quick capture API."""

import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.activity import record_activity
from app.core.deps import current_user, ensure_adult, ensure_family_membership
from app.core.errors import ADULT_REQUIRED, error_detail
from app.core.notification_preferences import should_push_notification_type
from app.core.push import send_push_for_user
from app.core.reminder_text import reminder_text, user_language
from app.core.scopes import require_scope
from app.core.shopping_notifications import dispatch_shopping_destination_event
from app.core.shopping_domain import ShoppingItemTransition, add_or_merge_shopping_item
from app.core.task_service import TaskDomainError, create_task as create_task_domain, dispatch_task_webhook
from app.core.ws_broadcast import broadcast_shopping_event
from app.core.webhooks import dispatch_webhook_event
from app.database import get_db
from app.models import Membership, Notification, NotificationPreference, QuickCaptureItem, ShoppingItem, ShoppingList, Task, User
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

logger = logging.getLogger(__name__)

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


def _create_task(
    db: Session,
    *,
    family_id: int,
    user: User,
    text: str,
    commit: bool = True,
) -> Task:
    try:
        return create_task_domain(
            db,
            user,
            {"family_id": family_id, "title": text, "priority": "normal"},
            commit=commit,
            webhook_extra={"source": "quick_capture"} if commit else None,
        )
    except TaskDomainError as exc:
        raise HTTPException(status_code=exc.status_code, detail={"code": exc.code, "message": exc.safe_reason}) from exc


def _create_shopping_item(
    db: Session,
    *,
    family_id: int,
    user: User,
    text: str,
) -> tuple[ShoppingItemTransition, ShoppingList, bool]:
    shopping_list, shopping_list_created = _get_or_create_quick_list(db, family_id, user.id)
    transition = add_or_merge_shopping_item(
        db,
        shopping_list=shopping_list,
        name=text,
        added_by_user_id=user.id,
    )
    if transition.action == "created":
        record_activity(
            db,
            family_id=family_id,
            actor_user_id=user.id,
            actor_display_name=user.display_name,
            action="added",
            object_type="shopping_item",
            object_id=transition.item.id,
            object_label=transition.item.name,
            verb="added",
            object_kind="to shopping",
        )
    return transition, shopping_list, shopping_list_created


def _created_payload(destination: QuickCaptureDestination, created_item: Task | ShoppingItem) -> QuickCaptureResponse:
    if destination == QuickCaptureDestination.task:
        return QuickCaptureResponse(destination=destination, created_item=_task_response(created_item))
    return QuickCaptureResponse(destination=destination, created_item=_shopping_item_response(created_item))


def _dispatch_quick_capture_shopping_events(
    *,
    family_id: int,
    user: User,
    shopping_list: ShoppingList,
    transition: ShoppingItemTransition,
    shopping_list_created: bool,
) -> None:
    item = transition.item
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
    broadcast_shopping_event(
        "list",
        shopping_list.id,
        "item_added" if transition.action == "created" else "item_updated",
        {"item": ShoppingItemResponse.model_validate(item).model_dump(mode="json")},
    )
    action_copy = {
        "created": (
            "Shopping item added",
            f'{user.display_name or "Someone"} added "{item.name}" to "{shopping_list.name}" from quick capture.',
            "quick_capture_added",
        ),
        "merged": (
            "Shopping item merged",
            f'{user.display_name or "Someone"} merged "{item.name}" on "{shopping_list.name}" from quick capture.',
            "quick_capture_merged",
        ),
        "restored": (
            "Shopping item restored",
            f'{user.display_name or "Someone"} restored "{item.name}" on "{shopping_list.name}" from quick capture.',
            "quick_capture_restored",
        ),
    }[transition.action]
    dispatch_shopping_destination_event(
        family_id=family_id,
        event_type="shopping.item.changed",
        title=action_copy[0],
        body=action_copy[1],
        link=f"/shopping?list={shopping_list.id}&item={item.id}",
        source_type="shopping_item",
        source_id=item.id,
        action=action_copy[2],
    )


@router.post(
    "",
    response_model=QuickCaptureResponse,
    summary="Capture a quick note",
    description="Capture text into the inbox or route it directly to a task or shopping item. Children can only capture into the inbox; the adults are notified and confirm the suggestion. Scope: `quick_capture:write`.",
)
def create_quick_capture(
    payload: QuickCaptureCreate,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("quick_capture:write"),
):
    membership = ensure_family_membership(db, user.id, payload.family_id)
    # Children suggest (Tribu 2.0, E5): their entries wait in the inbox
    # until an adult confirms them.
    if not membership.is_adult and payload.destination != QuickCaptureDestination.inbox:
        raise HTTPException(status_code=403, detail=error_detail(ADULT_REQUIRED))
    text = _capture_text(payload.text)

    if payload.destination == QuickCaptureDestination.task:
        task = _create_task(db, family_id=payload.family_id, user=user, text=text)
        return _created_payload(payload.destination, task)

    if payload.destination == QuickCaptureDestination.shopping:
        transition, shopping_list, shopping_list_created = _create_shopping_item(db, family_id=payload.family_id, user=user, text=text)
        item = transition.item
        db.commit()
        db.refresh(item)
        db.refresh(shopping_list)
        dispatch_webhook_event(
            db,
            family_id=payload.family_id,
            event_type="shopping.item.created" if transition.action == "created" else "shopping.item.updated",
            data={"list_id": item.list_id, "item_id": item.id, "name": item.name, "source": "quick_capture"},
        )
        _dispatch_quick_capture_shopping_events(
            family_id=payload.family_id,
            user=user,
            shopping_list=shopping_list,
            transition=transition,
            shopping_list_created=shopping_list_created,
        )
        return _created_payload(payload.destination, item)

    item = QuickCaptureItem(
        family_id=payload.family_id,
        text=text,
        created_by_user_id=user.id,
        is_suggestion=not membership.is_adult,
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
    if not membership.is_adult:
        _notify_adults_of_suggestion(db, item, user)
    return QuickCaptureResponse(destination=QuickCaptureDestination.inbox, inbox_item=item)


def _notify_adults_of_suggestion(db: Session, item: QuickCaptureItem, child: User) -> None:
    """Tells the family's adults that a child suggested something."""
    adults = (
        db.query(Membership.user_id)
        .filter(Membership.family_id == item.family_id, Membership.is_adult.is_(True))
        .all()
    )
    name = (child.display_name or "").split(" ")[0] or child.email
    for (adult_id,) in adults:
        body = reminder_text(user_language(db, adult_id), "capture_suggestion", name=name)
        db.add(Notification(
            user_id=adult_id,
            family_id=item.family_id,
            type="capture_suggestion",
            title=item.text,
            body=body,
            link="/dashboard?inbox=1",
        ))
        pref = db.query(NotificationPreference).filter(NotificationPreference.user_id == adult_id).first()
        if pref and should_push_notification_type(pref, "capture_suggestion")[0]:
            try:
                send_push_for_user(db, adult_id, item.text, body, "/dashboard?inbox=1")
            except Exception:
                logger.exception("Push notification failed for suggestion to user %s", adult_id)
    db.commit()


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
        created = _create_task(db, family_id=item.family_id, user=user, text=item.text, commit=False)
    else:
        shopping_transition, shopping_list, shopping_list_created = _create_shopping_item(
            db,
            family_id=item.family_id,
            user=user,
            text=item.text,
        )
        created = shopping_transition.item

    item.status = "converted"
    item.converted_to = payload.destination.value
    item.converted_object_id = created.id
    db.commit()
    db.refresh(item)
    db.refresh(created)
    if payload.destination == QuickCaptureDestination.task:
        dispatch_task_webhook(
            db,
            created,
            "task.created",
            extra={"source": "quick_capture_inbox"},
        )
    if payload.destination == QuickCaptureDestination.shopping and shopping_list is not None:
        db.refresh(shopping_list)
        dispatch_webhook_event(
            db,
            family_id=item.family_id,
            event_type="shopping.item.created" if shopping_transition.action == "created" else "shopping.item.updated",
            data={
                "list_id": created.list_id,
                "item_id": created.id,
                "name": created.name,
                "source": "quick_capture_inbox",
            },
        )
        _dispatch_quick_capture_shopping_events(
            family_id=item.family_id,
            user=user,
            shopping_list=shopping_list,
            transition=shopping_transition,
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
