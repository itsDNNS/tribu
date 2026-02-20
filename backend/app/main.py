from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from .database import Base, engine, get_db
from .models import User, Family, Membership
from .schemas import RegisterRequest, LoginRequest, TokenResponse, MeResponse
from .security import hash_password, verify_password, create_access_token, decode_token

app = FastAPI(title="Tribu API", version="0.2.0")
security = HTTPBearer()


@app.on_event("startup")
def on_startup():
    Base.metadata.create_all(bind=engine)


@app.get("/health")
def health():
    return {"status": "ok", "service": "tribu-api"}


@app.post("/auth/register", response_model=TokenResponse)
def register(payload: RegisterRequest, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == payload.email.lower()).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already exists")

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

    membership = Membership(user_id=user.id, family_id=family.id, role="owner")
    db.add(membership)
    db.commit()

    token = create_access_token(user_id=user.id, email=user.email)
    return TokenResponse(access_token=token)


@app.post("/auth/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email.lower()).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = create_access_token(user_id=user.id, email=user.email)
    return TokenResponse(access_token=token)


def current_user(
    creds: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
):
    try:
        payload = decode_token(creds.credentials)
        user_id = int(payload.get("sub"))
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user


@app.get("/auth/me", response_model=MeResponse)
def me(user: User = Depends(current_user)):
    return MeResponse(user_id=user.id, email=user.email, display_name=user.display_name)


@app.get("/")
def root():
    return {"name": "Tribu API", "message": "Family chaos manager backend is running"}
