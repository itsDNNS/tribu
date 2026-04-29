from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.deps import current_user, ensure_adult
from app.core.scopes import require_scope
from app.core.utils import utcnow
from app.database import get_db
from app.models import CalendarEvent, FamilySetupChecklist, MealPlan, Membership, PersonalAccessToken, ShoppingList, Task, User
from app.schemas import SetupChecklistActionRequest, SetupChecklistResponse, SetupChecklistStepResponse

router = APIRouter(prefix="/setup-checklist", tags=["setup_checklist"])

MANUAL_STEP_KEYS = {"phone_sync", "backup_guidance"}

STEP_COPY = {
    "members": {
        "title": "Add family members",
        "description": "Invite the people who should share calendars, shopping, and tasks.",
        "cta_label": "Invite members",
        "target_view": "admin",
    },
    "calendar": {
        "title": "Add a recurring calendar event",
        "description": "Put the first school, sport, or family routine on the calendar.",
        "cta_label": "Open calendar",
        "target_view": "calendar",
    },
    "shopping": {
        "title": "Create a shared shopping list",
        "description": "Start one list the whole household can update.",
        "cta_label": "Open shopping",
        "target_view": "shopping",
    },
    "meal_plan": {
        "title": "Plan the first meal",
        "description": "Add one meal so the week starts with a shared plan.",
        "cta_label": "Open meal plan",
        "target_view": "meal_plans",
    },
    "routine": {
        "title": "Add a recurring task or routine",
        "description": "Create the first repeating chore, reminder, or household routine.",
        "cta_label": "Open tasks",
        "target_view": "tasks",
    },
    "phone_sync": {
        "title": "Set up phone sync",
        "description": "Connect calendar or contacts sync for the phones that need it.",
        "cta_label": "Open phone sync",
        "target_view": "settings",
    },
    "backup_guidance": {
        "title": "Review backup guidance",
        "description": "Check backup and restore guidance before the household depends on Tribu daily.",
        "cta_label": "Open backups",
        "target_view": "admin",
    },
}


def _get_state(db: Session, family_id: int) -> FamilySetupChecklist:
    state = db.query(FamilySetupChecklist).filter(FamilySetupChecklist.family_id == family_id).first()
    if state:
        return state
    state = FamilySetupChecklist(family_id=family_id, completed_steps=[])
    db.add(state)
    db.flush()
    return state


def _auto_completed(db: Session, family_id: int) -> dict[str, bool]:
    member_count = db.query(Membership).filter(Membership.family_id == family_id).count()
    event_exists = db.query(CalendarEvent.id).filter(CalendarEvent.family_id == family_id).first() is not None
    shopping_exists = db.query(ShoppingList.id).filter(ShoppingList.family_id == family_id).first() is not None
    meal_exists = db.query(MealPlan.id).filter(MealPlan.family_id == family_id).first() is not None
    routine_exists = db.query(Task.id).filter(Task.family_id == family_id, Task.recurrence.isnot(None)).first() is not None
    phone_sync_exists = (
        db.query(PersonalAccessToken.id)
        .join(User, PersonalAccessToken.user_id == User.id)
        .join(Membership, Membership.user_id == User.id)
        .filter(Membership.family_id == family_id, PersonalAccessToken.last_dav_success_at.isnot(None))
        .first()
        is not None
    )
    return {
        "members": member_count >= 2,
        "calendar": event_exists,
        "shopping": shopping_exists,
        "meal_plan": meal_exists,
        "routine": routine_exists,
        "phone_sync": phone_sync_exists,
        "backup_guidance": False,
    }


def _build_response(db: Session, family_id: int) -> SetupChecklistResponse:
    state = _get_state(db, family_id)
    manual_completed = set(state.completed_steps or [])
    auto = _auto_completed(db, family_id)
    steps = []
    for key, copy in STEP_COPY.items():
        auto_done = auto.get(key, False)
        completed = auto_done or key in manual_completed
        steps.append(SetupChecklistStepResponse(key=key, completed=completed, auto_completed=auto_done, **copy))
    completed_count = sum(1 for step in steps if step.completed)
    return SetupChecklistResponse(
        family_id=family_id,
        dismissed=bool(state.dismissed),
        show_on_dashboard=not state.dismissed and completed_count < len(steps),
        completed_count=completed_count,
        total_count=len(steps),
        steps=steps,
    )


def _ensure_access(db: Session, user: User, family_id: int) -> None:
    ensure_adult(db, user.id, family_id)


@router.get("", response_model=SetupChecklistResponse)
def get_setup_checklist(
    family_id: int,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("setup_checklist:read"),
):
    _ensure_access(db, user, family_id)
    return _build_response(db, family_id)


@router.post("/dismiss", response_model=SetupChecklistResponse)
def dismiss_setup_checklist(
    payload: SetupChecklistActionRequest,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("setup_checklist:write"),
):
    _ensure_access(db, user, payload.family_id)
    state = _get_state(db, payload.family_id)
    state.dismissed = True
    state.dismissed_at = utcnow()
    state.updated_at = utcnow()
    db.commit()
    return _build_response(db, payload.family_id)


@router.post("/reset", response_model=SetupChecklistResponse)
def reset_setup_checklist(
    payload: SetupChecklistActionRequest,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("setup_checklist:write"),
):
    _ensure_access(db, user, payload.family_id)
    state = _get_state(db, payload.family_id)
    state.dismissed = False
    state.dismissed_at = None
    state.reset_at = utcnow()
    state.updated_at = utcnow()
    db.commit()
    return _build_response(db, payload.family_id)


@router.post("/steps/{step_key}/complete", response_model=SetupChecklistResponse)
def complete_setup_checklist_step(
    step_key: str,
    payload: SetupChecklistActionRequest,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("setup_checklist:write"),
):
    if step_key not in MANUAL_STEP_KEYS:
        raise HTTPException(status_code=400, detail="Only manual setup checklist steps can be completed directly")
    _ensure_access(db, user, payload.family_id)
    state = _get_state(db, payload.family_id)
    completed = set(state.completed_steps or [])
    completed.add(step_key)
    state.completed_steps = sorted(completed)
    state.updated_at = utcnow()
    db.commit()
    return _build_response(db, payload.family_id)
