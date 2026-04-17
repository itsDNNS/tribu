import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Depends, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.extension import _rate_limit_exceeded_handler
from slowapi.middleware import SlowAPIMiddleware
from slowapi.util import get_remote_address


from app.core.deps import current_user
from app.core.scopes import require_scope, SCOPE_DESCRIPTIONS
from app.core.errors import error_detail, EMAIL_ALREADY_EXISTS, INVALID_CREDENTIALS, OLD_PASSWORD_INCORRECT, LAST_ADMIN, MEMBER_NOT_FOUND, INVALID_CONFIRMATION
from app.database import get_db, SessionLocal
from app.models import AuditLog, CalendarEvent, Family, Membership, ShoppingList, Task, User
from app.modules.birthdays_router import router as birthdays_router
from app.modules.calendar_router import router as calendar_router
from app.modules.dashboard_router import router as dashboard_router
from app.modules.families_router import router as families_router
from app.modules.contacts_router import router as contacts_router
from app.modules.tasks_router import router as tasks_router
from app.modules.shopping_router import router as shopping_router
from app.modules.shopping_ws import router as shopping_ws_router
from app.modules.tokens_router import router as tokens_router
from app.modules.backup_router import router as backup_router, BACKUP_DIR, DATABASE_URL as BACKUP_DB_URL
from app.modules.notifications_router import router as notifications_router
from app.modules.nav_router import router as nav_router
from app.modules.invitations_router import router as invitations_router, public_router as invitations_public_router, settings_router as invitations_settings_router
from app.modules.setup_router import router as setup_router
from app.modules.search_router import router as search_router
from app.modules.rewards_router import router as rewards_router
from app.modules.gifts_router import router as gifts_router
from app.modules.meal_plans_router import router as meal_plans_router
from app.core.scheduler import configure_backup_schedule, start_notification_job, start_scheduler, shutdown_scheduler
from app.core import ws_broadcast
from app.schemas import (
    AUTH_RESPONSES, CONFLICT_RESPONSE, ErrorResponse,
    ChangePasswordRequest, DeleteAccountRequest, LeaveFamilyRequest, LoginRequest, MeResponse, ProfileImageUpdate, RegisterRequest,
)
from app.core import cache
from app.core.utils import get_setting
from app.security import create_access_token, hash_password, verify_password
from app.core.config import COOKIE_NAME, COOKIE_MAX_AGE, COOKIE_SECURE, VERSION

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# API description (rendered as Markdown in /docs and /redoc)
# ---------------------------------------------------------------------------

API_DESCRIPTION = """
Self-hosted family organizer — calendars, tasks, shopping lists, contacts,
birthdays, and notifications in one place.

## Authentication

Tribu supports two authentication methods:

### 1. Cookie-based JWT (browser sessions)

Login via `POST /auth/login` sets an httpOnly cookie (`tribu_token`).
All subsequent requests are automatically authenticated.

### 2. Personal Access Token — PAT (API automation)

Create a token via `POST /tokens` and pass it in the `Authorization` header:

```
curl -H "Authorization: Bearer tribu_pat_abc123..." \\
     https://your-instance/calendar/events?family_id=1
```

## Rate Limiting

| Endpoint | Limit |
|----------|-------|
| `POST /auth/register` | 10 / minute |
| `POST /auth/login` | 20 / minute |
| `POST /auth/register-with-invite` | 10 / minute |

## Error Format

All errors return JSON with a structured `detail` field:

```json
{"detail": {"code": "MEMBER_NOT_FOUND", "message": "Member not found", "params": {}}}
```

The `code` field is a stable identifier for client-side i18n. The `message` field
provides a human-readable English fallback. The optional `params` field contains
interpolation values (e.g. `{"status": "invalid"}`).

Common HTTP status codes: `400` (bad request), `401` (not authenticated),
`403` (forbidden), `404` (not found), `409` (conflict), `422` (validation error),
`429` (rate limit exceeded).

## Permissions Model

Three permission levels control access to family data:

| Level | Check | Description |
|-------|-------|-------------|
| **Member** | Family membership | Any family member can read data |
| **Adult** | `is_adult` flag | Required for write operations, CSV/ICS import/export, PAT management |
| **Admin** | `role = admin` | Required for member management, backup, audit log, invitations |

## PAT Scope Reference

| Scope | Description |
|-------|-------------|
""" + "\n".join(
    f"| `{scope}` | {desc} |"
    for scope, desc in SCOPE_DESCRIPTIONS.items()
)

# ---------------------------------------------------------------------------
# Tag metadata (section descriptions in /docs and /redoc)
# ---------------------------------------------------------------------------

TAG_METADATA = [
    {"name": "auth", "description": "Register, login, logout, and profile management. Supports cookie-based JWT and PAT bearer tokens."},
    {"name": "families", "description": "Family membership management, member CRUD, role assignments, and audit logging."},
    {"name": "calendar", "description": "Calendar event CRUD with recurrence support, plus ICS import/export."},
    {"name": "tasks", "description": "Family task management with priority levels, recurrence, and user assignment."},
    {"name": "shopping", "description": "Shopping lists and items with real-time sync via WebSocket (`/ws/shopping/{list_id}`)."},
    {"name": "contacts", "description": "Contact management with CSV import/export. Auto-syncs birthday entries."},
    {"name": "birthdays", "description": "Family birthday tracking."},
    {"name": "dashboard", "description": "Aggregated dashboard with upcoming events (14 days) and birthdays (28 days)."},
    {"name": "notifications", "description": "User notifications with SSE streaming, read/unread management, and notification preferences."},
    {"name": "tokens", "description": "Personal Access Token (PAT) management for API automation."},
    {"name": "backup", "description": "Database backup management — schedule, trigger, download, and delete. Admin only."},
    {"name": "invitations", "description": "Family invitation links — create, list, revoke, and accept."},
    {"name": "admin-settings", "description": "System-wide admin settings (base URL configuration)."},
    {"name": "nav", "description": "User navigation bar order customization."},
    {"name": "setup", "description": "Initial setup wizard — check status and restore from backup. Only available on empty databases."},
    {"name": "gifts", "description": "Gift list — track gift ideas, prices, and occasions per family. Adult only."},
    {"name": "meal_plans", "description": "Weekly meal planning across fixed morning/noon/evening slots. Available to all family members."},
    {"name": "health", "description": "Health check and service info."},
]

# ---------------------------------------------------------------------------
# Lifespan
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    ws_broadcast.set_event_loop(asyncio.get_running_loop())

    if cache.ping():
        logger.info("Valkey connected")
    else:
        logger.warning("Valkey not available - caching disabled, falling back to DB")

    db = SessionLocal()
    try:
        schedule = get_setting(db, "backup_schedule", "off")
        retention = int(get_setting(db, "backup_retention", "7"))
        start_scheduler()
        start_notification_job()
        if schedule != "off":
            configure_backup_schedule(schedule, BACKUP_DB_URL, BACKUP_DIR, retention)
    finally:
        db.close()

    yield

    shutdown_scheduler()


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

limiter = Limiter(key_func=get_remote_address)

app = FastAPI(
    title="Tribu API",
    version=VERSION,
    description=API_DESCRIPTION,
    contact={"name": "Tribu", "url": "https://github.com/itsDNNS/tribu"},
    license_info={"name": "All rights reserved"},
    openapi_tags=TAG_METADATA,
    lifespan=lifespan,
)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1|192\.168\.[0-9]+\.[0-9]+)(:[0-9]+)?",
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)


# ---------------------------------------------------------------------------
# Auth & health endpoints
# ---------------------------------------------------------------------------

@app.get(
    "/health",
    tags=["health"],
    summary="Health check",
    description="Returns service status. No authentication required.",
    response_description="Service status",
)
def health():
    return {"status": "ok", "service": "tribu-api", "version": VERSION}


@app.post(
    "/auth/register",
    tags=["auth"],
    summary="Register new user",
    description=(
        "Create a new user account and their first family. "
        "The user becomes admin of the new family. "
        "Rate limited to 10 requests per minute. No authentication required."
    ),
    responses={**CONFLICT_RESPONSE},
    response_description="Registration successful",
)
@limiter.limit("10/minute")
def register(request: Request, payload: RegisterRequest, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == payload.email.lower()).first()
    if existing:
        raise HTTPException(status_code=400, detail=error_detail(EMAIL_ALREADY_EXISTS))

    user = User(
        email=payload.email.lower(),
        password_hash=hash_password(payload.password),
        display_name=payload.display_name,
        has_completed_onboarding=True,
    )
    db.add(user)
    db.flush()

    family = Family(name=payload.family_name)
    db.add(family)
    db.flush()

    membership = Membership(user_id=user.id, family_id=family.id, role="admin", is_adult=True)
    db.add(membership)
    db.commit()

    token = create_access_token(user_id=user.id, email=user.email)
    response = JSONResponse(content={"status": "ok"})
    response.set_cookie(
        COOKIE_NAME, token, httponly=True, samesite="lax",
        secure=COOKIE_SECURE, max_age=COOKIE_MAX_AGE, path="/",
    )
    return response


@app.post(
    "/auth/login",
    tags=["auth"],
    summary="Login",
    description=(
        "Authenticate with email and password. "
        "Sets an httpOnly JWT cookie on success. "
        "Rate limited to 20 requests per minute. No authentication required."
    ),
    responses={401: {"model": ErrorResponse, "description": "Invalid credentials"}},
    response_description="Login successful",
)
@limiter.limit("20/minute")
def login(request: Request, payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email.lower()).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail=error_detail(INVALID_CREDENTIALS))

    token = create_access_token(user_id=user.id, email=user.email)
    response = JSONResponse(content={"status": "ok", "must_change_password": user.must_change_password})
    response.set_cookie(
        COOKIE_NAME, token, httponly=True, samesite="lax",
        secure=COOKIE_SECURE, max_age=COOKIE_MAX_AGE, path="/",
    )
    return response


@app.post(
    "/auth/logout",
    tags=["auth"],
    summary="Logout",
    description="Clear the authentication cookie. No authentication required.",
    response_description="Logout successful",
)
def logout():
    response = JSONResponse(content={"status": "ok"})
    response.delete_cookie(COOKIE_NAME, path="/")
    return response


@app.get(
    "/auth/me",
    tags=["auth"],
    summary="Get current user",
    description="Return the authenticated user's profile. Scope: `profile:read`.",
    response_model=MeResponse,
    responses={**AUTH_RESPONSES},
    response_description="User profile",
)
def me(user: User = Depends(current_user), _scope=require_scope("profile:read")):
    return MeResponse(user_id=user.id, email=user.email, display_name=user.display_name, profile_image=user.profile_image, must_change_password=user.must_change_password, has_completed_onboarding=user.has_completed_onboarding)


@app.patch(
    "/auth/me/password",
    tags=["auth"],
    summary="Change password",
    description="Change the current user's password. Requires the old password for verification. Scope: `profile:write`.",
    responses={**AUTH_RESPONSES, 400: {"model": ErrorResponse, "description": "Old password incorrect"}},
    response_description="Password changed",
)
def change_password(
    payload: ChangePasswordRequest,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("profile:write"),
):
    if not verify_password(payload.old_password, user.password_hash):
        raise HTTPException(status_code=400, detail=error_detail(OLD_PASSWORD_INCORRECT))
    user.password_hash = hash_password(payload.new_password)
    user.must_change_password = False
    db.commit()
    return {"status": "ok"}


@app.patch(
    "/auth/me/profile-image",
    tags=["auth"],
    summary="Update profile image",
    description="Upload a new profile image as base64-encoded string. Scope: `profile:write`.",
    responses={**AUTH_RESPONSES},
    response_description="Profile image updated",
)
def update_profile_image(
    payload: ProfileImageUpdate,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("profile:write"),
):
    user.profile_image = payload.profile_image
    db.commit()
    # Invalidate members cache so other family members see the new image
    family_ids = [m.family_id for m in db.query(Membership).filter(Membership.user_id == user.id).all()]
    for fid in family_ids:
        cache.invalidate(f"tribu:members:{fid}")
    return {"status": "ok"}


@app.post(
    "/auth/me/complete-onboarding",
    tags=["auth"],
    summary="Complete onboarding",
    description="Mark the onboarding wizard as completed for the current user. Scope: `profile:write`.",
    responses={**AUTH_RESPONSES},
    response_description="Onboarding completed",
)
def complete_onboarding(
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("profile:write"),
):
    user.has_completed_onboarding = True
    db.commit()
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Leave family / Delete account
# ---------------------------------------------------------------------------

@app.post(
    "/auth/me/leave-family",
    tags=["auth"],
    summary="Leave a family",
    description="Leave a family. If you are the last admin, you must transfer the admin role first. If you are the last member, the family is deleted. Scope: `profile:write`.",
    responses={**AUTH_RESPONSES, 400: {"model": ErrorResponse}, 404: {"model": ErrorResponse}},
    response_description="Left the family",
)
def leave_family(
    payload: LeaveFamilyRequest,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("profile:write"),
):
    membership = db.query(Membership).filter(
        Membership.user_id == user.id,
        Membership.family_id == payload.family_id,
    ).with_for_update().first()
    if not membership:
        raise HTTPException(status_code=404, detail=error_detail(MEMBER_NOT_FOUND))

    if membership.role == "admin":
        other_admins = db.query(Membership).filter(
            Membership.family_id == payload.family_id,
            Membership.role == "admin",
            Membership.user_id != user.id,
        ).with_for_update().count()
        if other_admins == 0:
            remaining_members = db.query(Membership).filter(
                Membership.family_id == payload.family_id,
                Membership.user_id != user.id,
            ).count()
            if remaining_members > 0:
                raise HTTPException(status_code=400, detail=error_detail(LAST_ADMIN))

    # NULL out references to this user in the family being left
    fid = payload.family_id
    db.query(CalendarEvent).filter(CalendarEvent.family_id == fid, CalendarEvent.created_by_user_id == user.id).update({"created_by_user_id": None})
    db.query(Task).filter(Task.family_id == fid, Task.assigned_to_user_id == user.id).update({"assigned_to_user_id": None})
    db.query(Task).filter(Task.family_id == fid, Task.created_by_user_id == user.id).update({"created_by_user_id": None})
    db.query(ShoppingList).filter(ShoppingList.family_id == fid, ShoppingList.created_by_user_id == user.id).update({"created_by_user_id": None})
    db.query(AuditLog).filter(AuditLog.family_id == fid, AuditLog.admin_user_id == user.id).update({"admin_user_id": None})

    db.delete(membership)
    db.flush()

    family_members = db.query(Membership).filter(Membership.family_id == fid).count()
    family_deleted = False
    if family_members == 0:
        family = db.query(Family).filter(Family.id == fid).first()
        if family:
            db.delete(family)
            family_deleted = True

    user_memberships = db.query(Membership).filter(Membership.user_id == user.id).count()
    user_deleted = False
    if user_memberships == 0:
        db.delete(user)
        user_deleted = True

    db.commit()
    cache.invalidate(f"tribu:members:{fid}")
    cache.invalidate_pattern("tribu:families:*")
    return {"status": "ok", "family_deleted": family_deleted, "user_deleted": user_deleted}


@app.delete(
    "/auth/me",
    tags=["auth"],
    summary="Delete own account",
    description="Permanently delete your account and all associated data. Requires typing 'DELETE' to confirm. If you are the last admin of a family with other members, you must transfer admin first. Scope: `profile:write`.",
    responses={**AUTH_RESPONSES, 400: {"model": ErrorResponse}},
    response_description="Account deleted",
)
def delete_account(
    payload: DeleteAccountRequest,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("profile:write"),
):
    if payload.confirmation != "DELETE":
        raise HTTPException(status_code=400, detail=error_detail(INVALID_CONFIRMATION))

    memberships = db.query(Membership).filter(Membership.user_id == user.id).with_for_update().all()
    family_ids = []
    for m in memberships:
        if m.role == "admin":
            other_admins = db.query(Membership).filter(
                Membership.family_id == m.family_id,
                Membership.role == "admin",
                Membership.user_id != user.id,
            ).with_for_update().count()
            other_members = db.query(Membership).filter(
                Membership.family_id == m.family_id,
                Membership.user_id != user.id,
            ).count()
            if other_admins == 0 and other_members > 0:
                raise HTTPException(status_code=400, detail=error_detail(LAST_ADMIN))
        family_ids.append(m.family_id)

    for m in memberships:
        db.delete(m)
    db.flush()

    families_deleted = []
    for fid in family_ids:
        remaining = db.query(Membership).filter(Membership.family_id == fid).count()
        if remaining == 0:
            family = db.query(Family).filter(Family.id == fid).first()
            if family:
                db.delete(family)
                families_deleted.append(fid)

    db.delete(user)
    db.commit()

    for fid in family_ids:
        cache.invalidate(f"tribu:members:{fid}")
    cache.invalidate_pattern("tribu:families:*")
    return {"status": "ok", "families_deleted": families_deleted}


# ---------------------------------------------------------------------------
# Router registration
# ---------------------------------------------------------------------------

app.include_router(families_router)
app.include_router(calendar_router)
app.include_router(birthdays_router)
app.include_router(dashboard_router)
app.include_router(contacts_router)
app.include_router(tasks_router)
app.include_router(shopping_router)
app.include_router(shopping_ws_router)
app.include_router(tokens_router)
app.include_router(backup_router)
app.include_router(notifications_router)
app.include_router(nav_router)
app.include_router(invitations_router)
app.include_router(invitations_public_router)
app.include_router(invitations_settings_router)
app.include_router(setup_router)
app.include_router(search_router)
app.include_router(rewards_router)
app.include_router(gifts_router)
app.include_router(meal_plans_router)



@app.get(
    "/",
    tags=["health"],
    summary="Root",
    description="Service info. No authentication required.",
    response_description="Service info",
)
def root():
    return {"name": "Tribu API", "message": "Tribu läuft"}
