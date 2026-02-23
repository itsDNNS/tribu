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
from app.database import get_db
from app.models import Family, Membership, User
from app.modules.birthdays_router import router as birthdays_router
from app.modules.calendar_router import router as calendar_router
from app.modules.dashboard_router import router as dashboard_router
from app.modules.families_router import router as families_router
from app.modules.contacts_router import router as contacts_router
from app.modules.tasks_router import router as tasks_router
from app.schemas import LoginRequest, MeResponse, ProfileImageUpdate, RegisterRequest
from app.security import JWT_EXPIRE_HOURS, create_access_token, hash_password, verify_password

COOKIE_NAME = "tribu_token"
COOKIE_MAX_AGE = JWT_EXPIRE_HOURS * 3600

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
        secure=False, max_age=COOKIE_MAX_AGE, path="/",
    )
    return response


@app.post("/auth/login")
@limiter.limit("20/minute")
def login(request: Request, payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email.lower()).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Ungültige Zugangsdaten")

    token = create_access_token(user_id=user.id, email=user.email)
    response = JSONResponse(content={"status": "ok"})
    response.set_cookie(
        COOKIE_NAME, token, httponly=True, samesite="lax",
        secure=False, max_age=COOKIE_MAX_AGE, path="/",
    )
    return response


@app.post("/auth/logout")
def logout():
    response = JSONResponse(content={"status": "ok"})
    response.delete_cookie(COOKIE_NAME, path="/")
    return response


@app.get("/auth/me", response_model=MeResponse)
def me(user: User = Depends(current_user)):
    return MeResponse(user_id=user.id, email=user.email, display_name=user.display_name, profile_image=user.profile_image)


@app.patch("/auth/me/profile-image")
def update_profile_image(
    payload: ProfileImageUpdate,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
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


@app.get("/")
def root():
    return {"name": "Tribu API", "message": "Tribu läuft"}
