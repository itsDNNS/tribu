from sqlalchemy import text
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from app.core.deps import current_user
from app.database import Base, engine, get_db
from app.models import Family, Membership, User
from app.modules.birthdays_router import router as birthdays_router
from app.modules.calendar_router import router as calendar_router
from app.modules.dashboard_router import router as dashboard_router
from app.modules.families_router import router as families_router
from app.modules.contacts_router import router as contacts_router
from app.schemas import LoginRequest, MeResponse, ProfileImageUpdate, RegisterRequest, TokenResponse
from app.security import create_access_token, hash_password, verify_password

app = FastAPI(title="Tribu API", version="0.3.0")

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1|192\.168\.[0-9]+\.[0-9]+)(:[0-9]+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup():
    Base.metadata.create_all(bind=engine)
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE memberships ADD COLUMN IF NOT EXISTS is_adult BOOLEAN NOT NULL DEFAULT FALSE"))
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_image VARCHAR"))
        conn.execute(text("UPDATE memberships SET role='admin' WHERE role='owner'"))
        conn.execute(text("UPDATE memberships SET is_adult=TRUE WHERE role='admin'"))


@app.get("/health")
def health():
    return {"status": "ok", "service": "tribu-api"}


@app.post("/auth/register", response_model=TokenResponse)
def register(payload: RegisterRequest, db: Session = Depends(get_db)):
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
    return TokenResponse(access_token=token)


@app.post("/auth/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email.lower()).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Ungültige Zugangsdaten")

    token = create_access_token(user_id=user.id, email=user.email)
    return TokenResponse(access_token=token)


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


@app.get("/")
def root():
    return {"name": "Tribu API", "message": "Tribu läuft"}
