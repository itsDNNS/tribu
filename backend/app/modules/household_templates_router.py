from datetime import datetime, time, timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.activity import record_activity
from app.core.deps import current_user, ensure_adult
from app.core.errors import error_detail, SHOPPING_LIST_NOT_FOUND
from app.core.scopes import require_scope
from app.database import get_db
from app.models import HouseholdTemplate, ShoppingItem, ShoppingList, Task, User
from app.schemas import (
    AUTH_RESPONSES,
    NOT_FOUND_RESPONSE,
    HouseholdTemplateApplyRequest,
    HouseholdTemplateApplyResponse,
    HouseholdTemplateCreate,
    HouseholdTemplateResponse,
    HouseholdTemplateUpdate,
    ShoppingItemResponse,
    TaskResponse,
)

router = APIRouter(prefix="/household-templates", tags=["household-templates"], responses={**AUTH_RESPONSES})

BUILT_IN_TEMPLATES: dict[str, dict[str, Any]] = {
    "school-morning": {
        "id": "school-morning",
        "name": "School morning routine",
        "description": "A calm checklist for getting bags, lunch, and papers ready.",
        "task_items": [
            {"title": "Pack school bag", "description": "Homework, water bottle, and signed papers", "priority": "normal", "days_offset": 0},
            {"title": "Prepare lunch boxes", "description": "Snacks and drinks ready before bedtime", "priority": "normal", "days_offset": 0},
            {"title": "Check sports or music gear", "description": None, "priority": "low", "days_offset": 0},
        ],
        "shopping_items": [
            {"name": "Lunch snacks", "spec": None, "category": "School"},
            {"name": "Juice boxes", "spec": "1 pack", "category": "School"},
        ],
    },
    "weekly-cleaning": {
        "id": "weekly-cleaning",
        "name": "Weekly cleaning plan",
        "description": "Split the regular household reset into manageable tasks.",
        "task_items": [
            {"title": "Vacuum common areas", "description": None, "priority": "normal", "days_offset": 0},
            {"title": "Clean bathrooms", "description": None, "priority": "high", "days_offset": 1},
            {"title": "Change towels", "description": None, "priority": "low", "days_offset": 1},
        ],
        "shopping_items": [
            {"name": "Cleaning cloths", "spec": None, "category": "Household"},
            {"name": "Trash bags", "spec": None, "category": "Household"},
        ],
    },
    "vacation-packing": {
        "id": "vacation-packing",
        "name": "Vacation packing list",
        "description": "Reusable prep for clothes, documents, and last-minute errands.",
        "task_items": [
            {"title": "Check travel documents", "description": None, "priority": "high", "days_offset": 0},
            {"title": "Pack chargers and medication", "description": None, "priority": "high", "days_offset": 1},
        ],
        "shopping_items": [
            {"name": "Sunscreen", "spec": None, "category": "Travel"},
            {"name": "Travel snacks", "spec": None, "category": "Travel"},
        ],
    },
}


def _clean_task_items(items: list[Any]) -> list[dict[str, Any]]:
    cleaned = []
    for item in items:
        data = item.model_dump() if hasattr(item, "model_dump") else dict(item)
        title = str(data.get("title") or "").strip()
        if not title:
            continue
        cleaned.append({
            "title": title,
            "description": (data.get("description") or None),
            "priority": data.get("priority") or "normal",
            "days_offset": int(data.get("days_offset") or 0),
        })
    return cleaned


def _clean_shopping_items(items: list[Any]) -> list[dict[str, Any]]:
    cleaned = []
    for item in items:
        data = item.model_dump() if hasattr(item, "model_dump") else dict(item)
        name = str(data.get("name") or "").strip()
        if not name:
            continue
        cleaned.append({
            "name": name,
            "spec": (data.get("spec") or None),
            "category": (data.get("category") or None),
        })
    return cleaned


def _builtin_response(template: dict[str, Any]) -> HouseholdTemplateResponse:
    task_items = _clean_task_items(template["task_items"])
    shopping_items = _clean_shopping_items(template["shopping_items"])
    return HouseholdTemplateResponse(
        id=template["id"],
        name=template["name"],
        description=template.get("description"),
        is_builtin=True,
        task_count=len(task_items),
        shopping_count=len(shopping_items),
        task_items=task_items,
        shopping_items=shopping_items,
    )


def _custom_response(template: HouseholdTemplate) -> HouseholdTemplateResponse:
    task_items = _clean_task_items(template.task_items or [])
    shopping_items = _clean_shopping_items(template.shopping_items or [])
    return HouseholdTemplateResponse(
        id=template.id,
        name=template.name,
        description=template.description,
        is_builtin=False,
        task_count=len(task_items),
        shopping_count=len(shopping_items),
        task_items=task_items,
        shopping_items=shopping_items,
        created_at=template.created_at,
        updated_at=template.updated_at,
    )


def _get_custom_template_or_404(db: Session, template_id: int) -> HouseholdTemplate:
    template = db.query(HouseholdTemplate).filter(HouseholdTemplate.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Household template not found")
    return template


def _resolve_shopping_list(
    db: Session,
    *,
    family_id: int,
    user_id: int,
    shopping_items: list[dict[str, Any]],
    payload: HouseholdTemplateApplyRequest,
) -> ShoppingList | None:
    if payload.shopping_list_id is not None:
        shopping_list = db.query(ShoppingList).filter(ShoppingList.id == payload.shopping_list_id).first()
        if not shopping_list or shopping_list.family_id != family_id:
            raise HTTPException(status_code=404, detail=error_detail(SHOPPING_LIST_NOT_FOUND))
        return shopping_list if shopping_items else None
    if not shopping_items:
        return None
    name = (payload.shopping_list_name or "Template groceries").strip()
    shopping_list = ShoppingList(family_id=family_id, name=name, created_by_user_id=user_id)
    db.add(shopping_list)
    db.flush()
    return shopping_list


def _apply_template(
    db: Session,
    *,
    template_id: int | str,
    family_id: int,
    user: User,
    task_items: list[dict[str, Any]],
    shopping_items: list[dict[str, Any]],
    payload: HouseholdTemplateApplyRequest,
) -> HouseholdTemplateApplyResponse:
    ensure_adult(db, user.id, family_id)
    due_base = datetime.combine(payload.target_date, time(hour=9))
    created_tasks: list[Task] = []
    for item in task_items:
        task = Task(
            family_id=family_id,
            title=item["title"],
            description=item.get("description"),
            priority=item.get("priority") or "normal",
            due_date=due_base + timedelta(days=int(item.get("days_offset") or 0)),
            created_by_user_id=user.id,
        )
        db.add(task)
        created_tasks.append(task)

    shopping_list = _resolve_shopping_list(
        db,
        family_id=family_id,
        user_id=user.id,
        shopping_items=shopping_items,
        payload=payload,
    )
    created_shopping_items: list[ShoppingItem] = []
    if shopping_list is not None:
        max_position = max((item.position for item in shopping_list.items), default=-1)
        for offset, item in enumerate(shopping_items):
            shopping_item = ShoppingItem(
                list_id=shopping_list.id,
                name=item["name"],
                spec=item.get("spec"),
                category=item.get("category"),
                added_by_user_id=user.id,
                position=max_position + offset + 1,
            )
            db.add(shopping_item)
            created_shopping_items.append(shopping_item)

    db.flush()
    if created_tasks or created_shopping_items:
        record_activity(
            db,
            family_id=family_id,
            actor_user_id=user.id,
            actor_display_name=user.display_name,
            action="applied",
            object_type="household_template",
            object_id=None if isinstance(template_id, str) else template_id,
            object_label="Household template",
            verb="applied",
            object_kind="template",
        )
    db.commit()
    for task in created_tasks:
        db.refresh(task)
    for item in created_shopping_items:
        db.refresh(item)
    if shopping_list is not None:
        db.refresh(shopping_list)
    return HouseholdTemplateApplyResponse(
        template_id=template_id,
        created_task_count=len(created_tasks),
        created_shopping_count=len(created_shopping_items),
        shopping_list_id=shopping_list.id if shopping_list else None,
        tasks=[TaskResponse.model_validate(task) for task in created_tasks],
        shopping_items=[ShoppingItemResponse.model_validate(item) for item in created_shopping_items],
    )


@router.get("", response_model=list[HouseholdTemplateResponse], summary="List household templates")
def list_household_templates(
    family_id: int,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("household_templates:read"),
):
    ensure_adult(db, user.id, family_id)
    custom = (
        db.query(HouseholdTemplate)
        .filter(HouseholdTemplate.family_id == family_id)
        .order_by(HouseholdTemplate.created_at, HouseholdTemplate.id)
        .all()
    )
    return [_builtin_response(template) for template in BUILT_IN_TEMPLATES.values()] + [_custom_response(template) for template in custom]


@router.post("", response_model=HouseholdTemplateResponse, summary="Create a household template")
def create_household_template(
    payload: HouseholdTemplateCreate,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("household_templates:write"),
):
    ensure_adult(db, user.id, payload.family_id)
    template = HouseholdTemplate(
        family_id=payload.family_id,
        name=payload.name.strip(),
        description=payload.description.strip() if payload.description else None,
        task_items=_clean_task_items(payload.task_items),
        shopping_items=_clean_shopping_items(payload.shopping_items),
        created_by_user_id=user.id,
    )
    db.add(template)
    db.commit()
    db.refresh(template)
    return _custom_response(template)


@router.patch("/{template_id}", response_model=HouseholdTemplateResponse, responses={**NOT_FOUND_RESPONSE})
def update_household_template(
    template_id: int,
    payload: HouseholdTemplateUpdate,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("household_templates:write"),
):
    template = _get_custom_template_or_404(db, template_id)
    ensure_adult(db, user.id, template.family_id)
    if payload.name is not None:
        template.name = payload.name.strip()
    if payload.description is not None:
        template.description = payload.description.strip() or None
    if payload.task_items is not None:
        template.task_items = _clean_task_items(payload.task_items)
    if payload.shopping_items is not None:
        template.shopping_items = _clean_shopping_items(payload.shopping_items)
    db.commit()
    db.refresh(template)
    return _custom_response(template)


@router.delete("/{template_id}", responses={**NOT_FOUND_RESPONSE})
def delete_household_template(
    template_id: int,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("household_templates:write"),
):
    template = _get_custom_template_or_404(db, template_id)
    ensure_adult(db, user.id, template.family_id)
    db.delete(template)
    db.commit()
    return {"status": "deleted", "template_id": template_id}


@router.post("/builtin/{template_key}/apply", response_model=HouseholdTemplateApplyResponse, responses={**NOT_FOUND_RESPONSE})
def apply_builtin_household_template(
    template_key: str,
    payload: HouseholdTemplateApplyRequest,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("household_templates:write"),
):
    template = BUILT_IN_TEMPLATES.get(template_key)
    if not template:
        raise HTTPException(status_code=404, detail="Household template not found")
    if payload.family_id is None:
        raise HTTPException(status_code=400, detail="family_id is required for built-in templates")
    task_items = _clean_task_items(template["task_items"])
    shopping_items = _clean_shopping_items(template["shopping_items"])
    return _apply_template(
        db,
        template_id=template_key,
        family_id=payload.family_id,
        user=user,
        task_items=task_items,
        shopping_items=shopping_items,
        payload=payload,
    )


@router.post("/{template_id}/apply", response_model=HouseholdTemplateApplyResponse, responses={**NOT_FOUND_RESPONSE})
def apply_custom_household_template(
    template_id: int,
    payload: HouseholdTemplateApplyRequest,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("household_templates:write"),
):
    template = _get_custom_template_or_404(db, template_id)
    task_items = _clean_task_items(template.task_items or [])
    shopping_items = _clean_shopping_items(template.shopping_items or [])
    return _apply_template(
        db,
        template_id=template.id,
        family_id=template.family_id,
        user=user,
        task_items=task_items,
        shopping_items=shopping_items,
        payload=payload,
    )
