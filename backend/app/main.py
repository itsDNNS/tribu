from fastapi import FastAPI, Depends, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.extension import _rate_limit_exceeded_handler
from slowapi.middleware import SlowAPIMiddleware
from slowapi.util import get_remote_address

import os

from app.core.deps import current_user
from app.core.scopes import require_scope
from app.database import get_db, SessionLocal
from app.models import Family, Membership, SystemSetting, User
from app.modules.birthdays_router import router as birthdays_router
from app.modules.calendar_router import router as calendar_router
from app.modules.dashboard_router import router as dashboard_router
from app.modules.families_router import router as families_router
from app.modules.contacts_router import router as contacts_router
from app.modules.tasks_router import router as tasks_router
from app.modules.shopping_router import router as shopping_router
from app.modules.tokens_router import router as tokens_router
from app.modules.backup_router import router as backup_router, BACKUP_DIR, DATABASE_URL as BACKUP_DB_URL
from app.modules.notifications_router import router as notifications_router
from app.modules.nav_router import router as nav_router
from app.core.scheduler import configure_backup_schedule, start_notification_job, start_scheduler, shutdown_scheduler
from app.schemas import ChangePasswordRequest, LoginRequest, MeResponse, ProfileImageUpdate, RegisterRequest
from app.security import JWT_EXPIRE_HOURS, create_access_token, hash_password, needs_rehash, verify_password

COOKIE_NAME = "tribu_token"
COOKIE_MAX_AGE = JWT_EXPIRE_HOURS * 3600
COOKIE_SECURE = os.getenv("SECURE_COOKIES", "false").lower() == "true"

limiter = Limiter(key_func=get_remote_address)

app = FastAPI(title="Tribu API", version="0.3.1")
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



@app.get("/health")
def health():
    return {"status": "ok", "service": "tribu-api"}


@app.post("/auth/register")
@limiter.limit("10/minute")
def register(request: Request, payload: RegisterRequest, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == payload.email.lower()).first()
    if existing:
        raise HTTPException(status_code=400, detail="E-Mail existiert bereits")

    user = User(
        email=payload.email.lower(),
        password_hash=hash_password(payload.password),
        display_name=payload.display_name,
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


@app.post("/auth/login")
@limiter.limit("20/minute")
def login(request: Request, payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email.lower()).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Ungültige Zugangsdaten")

    if needs_rehash(user.password_hash):
        user.password_hash = hash_password(payload.password)
        db.commit()

    token = create_access_token(user_id=user.id, email=user.email)
    response = JSONResponse(content={"status": "ok", "must_change_password": user.must_change_password})
    response.set_cookie(
        COOKIE_NAME, token, httponly=True, samesite="lax",
        secure=COOKIE_SECURE, max_age=COOKIE_MAX_AGE, path="/",
    )
    return response


@app.post("/auth/logout")
def logout():
    response = JSONResponse(content={"status": "ok"})
    response.delete_cookie(COOKIE_NAME, path="/")
    return response


@app.get("/auth/me", response_model=MeResponse)
def me(user: User = Depends(current_user), _scope=require_scope("profile:read")):
    return MeResponse(user_id=user.id, email=user.email, display_name=user.display_name, profile_image=user.profile_image, must_change_password=user.must_change_password)


@app.patch("/auth/me/password")
def change_password(
    payload: ChangePasswordRequest,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    if not verify_password(payload.old_password, user.password_hash):
        raise HTTPException(status_code=400, detail="Old password is incorrect")
    user.password_hash = hash_password(payload.new_password)
    user.must_change_password = False
    db.commit()
    return {"status": "ok"}


@app.patch("/auth/me/profile-image")
def update_profile_image(
    payload: ProfileImageUpdate,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("profile:write"),
):
    user.profile_image = payload.profile_image
    db.commit()
    return {"status": "ok"}


app.include_router(families_router)
app.include_router(calendar_router)
app.include_router(birthdays_router)
app.include_router(dashboard_router)
app.include_router(contacts_router)
app.include_router(tasks_router)
app.include_router(shopping_router)
app.include_router(tokens_router)
app.include_router(backup_router)
app.include_router(notifications_router)
app.include_router(nav_router)


@app.on_event("startup")
def startup_scheduler():
    db = SessionLocal()
    try:
        schedule_row = db.query(SystemSetting).filter(SystemSetting.key == "backup_schedule").first()
        retention_row = db.query(SystemSetting).filter(SystemSetting.key == "backup_retention").first()
        schedule = schedule_row.value if schedule_row else "off"
        retention = int(retention_row.value) if retention_row else 7
        start_scheduler()
        start_notification_job()
        if schedule != "off":
            configure_backup_schedule(schedule, BACKUP_DB_URL, BACKUP_DIR, retention)
    finally:
        db.close()


@app.on_event("shutdown")
def shutdown_app_scheduler():
    shutdown_scheduler()


@app.get("/")
def root():
    return {"name": "Tribu API", "message": "Tribu läuft"}
