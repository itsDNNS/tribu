from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core import cache
from app.core.deps import current_user
from app.core.scopes import require_scope
from app.database import get_db
from app.models import User, UserNavOrder
from app.schemas import AUTH_RESPONSES, DashboardLayoutResponse, DashboardLayoutUpdate, NavOrderResponse, NavOrderUpdate, UiPreferencesResponse, UiPreferencesUpdate
from app.core.errors import error_detail, INVALID_UI_PREFERENCE, UNKNOWN_NAV_KEYS

router = APIRouter(prefix="/nav", tags=["nav"], responses={**AUTH_RESPONSES})

DEFAULT_NAV_ORDER = ["dashboard", "calendar", "weekly_plan", "shopping", "tasks", "activity", "templates", "meal_plans", "school_timetables", "recipes", "rewards", "gifts", "contacts", "notifications", "settings", "admin"]
KNOWN_KEYS = {"dashboard", "calendar", "weekly_plan", "shopping", "tasks", "activity", "templates", "rewards", "gifts", "meal_plans", "school_timetables", "recipes", "contacts", "notifications", "settings", "admin"}
DEFAULT_DASHBOARD_LAYOUT = ["quick_capture", "daily_loop", "events", "tasks", "birthdays", "rewards"]
KNOWN_DASHBOARD_MODULES = set(DEFAULT_DASHBOARD_LAYOUT)
DEFAULT_UI_THEME = "light"
DEFAULT_UI_LANGUAGE = "en"
KNOWN_UI_THEMES = {"light", "dark", "midnight-glass"}
KNOWN_UI_LANGUAGES = {"de", "en", "es", "fr", "it", "nl", "pl", "pt", "sv", "da", "nb", "fi", "cs", "sk", "hu", "ro", "el", "bg", "hr", "sl", "lt", "lv", "et", "ga"}


@router.get(
    "/order",
    response_model=NavOrderResponse,
    summary="Get navigation order",
    description="Return the current user's custom navigation bar order, or the default if not set.",
    response_description="Navigation bar order",
)
def get_nav_order(user: User = Depends(current_user), db: Session = Depends(get_db), _scope=require_scope("profile:read")):
    def _load():
        row = db.query(UserNavOrder).filter(UserNavOrder.user_id == user.id).first()
        if not row:
            return {"nav_order": DEFAULT_NAV_ORDER}
        return {"nav_order": row.nav_order}
    data = cache.get_or_set(f"tribu:nav_order:{user.id}", 600, _load)
    return NavOrderResponse(**data)


@router.put(
    "/order",
    response_model=NavOrderResponse,
    summary="Update navigation order",
    description="Save a custom navigation bar order for the current user.",
    response_description="Updated navigation bar order",
)
def update_nav_order(payload: NavOrderUpdate, user: User = Depends(current_user), db: Session = Depends(get_db), _scope=require_scope("profile:write")):
    invalid = [k for k in payload.nav_order if k not in KNOWN_KEYS]
    if invalid:
        raise HTTPException(status_code=422, detail=error_detail(UNKNOWN_NAV_KEYS, keys=', '.join(invalid)))

    row = db.query(UserNavOrder).filter(UserNavOrder.user_id == user.id).first()
    if row:
        row.nav_order = payload.nav_order
    else:
        row = UserNavOrder(user_id=user.id, nav_order=payload.nav_order)
        db.add(row)
    db.commit()
    cache.invalidate(f"tribu:nav_order:{user.id}")
    return NavOrderResponse(nav_order=row.nav_order)


@router.get(
    "/dashboard-layout",
    response_model=DashboardLayoutResponse,
    summary="Get dashboard module layout",
    description="Return the current user's custom dashboard module order, or the default if not set.",
    response_description="Dashboard module layout",
)
def get_dashboard_layout(user: User = Depends(current_user), db: Session = Depends(get_db), _scope=require_scope("profile:read")):
    def _load():
        row = db.query(UserNavOrder).filter(UserNavOrder.user_id == user.id).first()
        modules = row.dashboard_layout if row and row.dashboard_layout else DEFAULT_DASHBOARD_LAYOUT
        return {"modules": _normalize_dashboard_modules(modules)}
    data = cache.get_or_set(f"tribu:dashboard_layout:{user.id}", 600, _load)
    return DashboardLayoutResponse(**data)


@router.put(
    "/dashboard-layout",
    response_model=DashboardLayoutResponse,
    summary="Update dashboard module layout",
    description="Save a custom dashboard module order for the current user.",
    response_description="Updated dashboard module layout",
)
def update_dashboard_layout(payload: DashboardLayoutUpdate, user: User = Depends(current_user), db: Session = Depends(get_db), _scope=require_scope("profile:write")):
    modules = _validate_dashboard_modules(payload.modules)
    row = db.query(UserNavOrder).filter(UserNavOrder.user_id == user.id).first()
    if row:
        row.dashboard_layout = modules
    else:
        row = UserNavOrder(user_id=user.id, nav_order=DEFAULT_NAV_ORDER, dashboard_layout=modules)
        db.add(row)
    db.commit()
    cache.invalidate(f"tribu:dashboard_layout:{user.id}")
    return DashboardLayoutResponse(modules=row.dashboard_layout)


@router.delete(
    "/dashboard-layout",
    response_model=DashboardLayoutResponse,
    summary="Reset dashboard module layout",
    description="Reset the current user's dashboard module order back to the default.",
    response_description="Default dashboard module layout",
)
def reset_dashboard_layout(user: User = Depends(current_user), db: Session = Depends(get_db), _scope=require_scope("profile:write")):
    row = db.query(UserNavOrder).filter(UserNavOrder.user_id == user.id).first()
    if row:
        row.dashboard_layout = None
        db.commit()
    cache.invalidate(f"tribu:dashboard_layout:{user.id}")
    return DashboardLayoutResponse(modules=DEFAULT_DASHBOARD_LAYOUT)


@router.get(
    "/ui-preferences",
    response_model=UiPreferencesResponse,
    summary="Get UI preferences",
    description="Return the current user's app theme and language preferences for web and native clients.",
    response_description="UI preferences",
)
def get_ui_preferences(user: User = Depends(current_user), db: Session = Depends(get_db), _scope=require_scope("profile:read")):
    def _load():
        row = db.query(UserNavOrder).filter(UserNavOrder.user_id == user.id).first()
        theme = row.ui_theme if row and row.ui_theme in KNOWN_UI_THEMES else DEFAULT_UI_THEME
        language = row.ui_language if row and row.ui_language in KNOWN_UI_LANGUAGES else DEFAULT_UI_LANGUAGE
        return {
            "theme": theme,
            "language": language,
            "available_themes": sorted(KNOWN_UI_THEMES),
            "available_languages": sorted(KNOWN_UI_LANGUAGES),
        }
    data = cache.get_or_set(f"tribu:ui_preferences:{user.id}", 600, _load)
    return UiPreferencesResponse(**data)


@router.put(
    "/ui-preferences",
    response_model=UiPreferencesResponse,
    summary="Update UI preferences",
    description="Save the current user's app theme and language preferences for web and native clients.",
    response_description="Updated UI preferences",
)
def update_ui_preferences(payload: UiPreferencesUpdate, user: User = Depends(current_user), db: Session = Depends(get_db), _scope=require_scope("profile:write")):
    if payload.theme is not None and payload.theme not in KNOWN_UI_THEMES:
        raise HTTPException(status_code=422, detail=error_detail(INVALID_UI_PREFERENCE, key=payload.theme))
    if payload.language is not None and payload.language not in KNOWN_UI_LANGUAGES:
        raise HTTPException(status_code=422, detail=error_detail(INVALID_UI_PREFERENCE, key=payload.language))

    row = db.query(UserNavOrder).filter(UserNavOrder.user_id == user.id).first()
    if not row:
        row = UserNavOrder(user_id=user.id, nav_order=DEFAULT_NAV_ORDER)
        db.add(row)
    if payload.theme is not None:
        row.ui_theme = payload.theme
    if payload.language is not None:
        row.ui_language = payload.language
    db.commit()
    cache.invalidate(f"tribu:ui_preferences:{user.id}")
    return UiPreferencesResponse(
        theme=row.ui_theme if row.ui_theme in KNOWN_UI_THEMES else DEFAULT_UI_THEME,
        language=row.ui_language if row.ui_language in KNOWN_UI_LANGUAGES else DEFAULT_UI_LANGUAGE,
        available_themes=sorted(KNOWN_UI_THEMES),
        available_languages=sorted(KNOWN_UI_LANGUAGES),
    )


def _normalize_dashboard_modules(modules: list[str]) -> list[str]:
    seen = []
    for module in modules:
        if module in KNOWN_DASHBOARD_MODULES and module not in seen:
            seen.append(module)
    normalized = list(seen)
    for default_index, module in enumerate(DEFAULT_DASHBOARD_LAYOUT):
        if module in normalized:
            continue
        if module == "daily_loop" and "quick_capture" in normalized:
            normalized.insert(normalized.index("quick_capture") + 1, module)
            continue
        insert_at = len(normalized)
        for next_module in DEFAULT_DASHBOARD_LAYOUT[default_index + 1:]:
            if next_module in normalized:
                insert_at = normalized.index(next_module)
                break
        normalized.insert(insert_at, module)
    return normalized


def _validate_dashboard_modules(modules: list[str]) -> list[str]:
    invalid = [module for module in modules if module not in KNOWN_DASHBOARD_MODULES]
    if invalid:
        raise HTTPException(status_code=422, detail=error_detail(UNKNOWN_NAV_KEYS, keys=', '.join(invalid)))
    return _normalize_dashboard_modules(modules)
