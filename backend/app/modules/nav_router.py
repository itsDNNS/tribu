from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core import cache
from app.core.deps import current_user
from app.core.scopes import require_scope
from app.database import get_db
from app.models import User, UserNavOrder
from app.schemas import AUTH_RESPONSES, NavOrderResponse, NavOrderUpdate, UiPreferencesResponse, UiPreferencesUpdate
from app.core.errors import error_detail, INVALID_UI_PREFERENCE, UNKNOWN_NAV_KEYS

router = APIRouter(prefix="/nav", tags=["nav"], responses={**AUTH_RESPONSES})

DEFAULT_NAV_ORDER = ["dashboard", "calendar", "weekly_plan", "shopping", "tasks", "activity", "templates", "meal_plans", "school_timetables", "recipes", "family", "rewards", "gifts", "contacts", "notifications", "settings", "admin"]
KNOWN_KEYS = {"dashboard", "family", "calendar", "weekly_plan", "shopping", "tasks", "activity", "templates", "rewards", "gifts", "meal_plans", "school_timetables", "recipes", "contacts", "notifications", "settings", "admin"}
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
