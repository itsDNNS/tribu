from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.deps import current_user
from app.core.scopes import VALID_SCOPES, require_scope
from app.database import get_db
from app.models import PersonalAccessToken, User
from app.schemas import PATCreate, PATCreatedResponse, PATResponse
from app.security import generate_pat

router = APIRouter(prefix="/tokens", tags=["tokens"])

MAX_TOKENS_PER_USER = 25


@router.get("", response_model=list[PATResponse])
def list_tokens(
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("profile:read"),
):
    return (
        db.query(PersonalAccessToken)
        .filter(PersonalAccessToken.user_id == user.id)
        .order_by(PersonalAccessToken.created_at.desc())
        .all()
    )


@router.post("", response_model=PATCreatedResponse)
def create_token(
    payload: PATCreate,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("profile:write"),
):
    invalid = set(payload.scopes) - VALID_SCOPES
    if invalid:
        raise HTTPException(status_code=400, detail=f"Ungültige Scopes: {', '.join(sorted(invalid))}")

    count = db.query(PersonalAccessToken).filter(PersonalAccessToken.user_id == user.id).count()
    if count >= MAX_TOKENS_PER_USER:
        raise HTTPException(status_code=400, detail=f"Maximum {MAX_TOKENS_PER_USER} Tokens erreicht")

    plain, token_hash = generate_pat()
    scopes_str = ",".join(sorted(payload.scopes))

    pat = PersonalAccessToken(
        user_id=user.id,
        name=payload.name,
        token_hash=token_hash,
        scopes=scopes_str,
        expires_at=payload.expires_at,
    )
    db.add(pat)
    db.commit()
    db.refresh(pat)

    return PATCreatedResponse(token=plain, pat=PATResponse.model_validate(pat))


@router.delete("/{token_id}")
def revoke_token(
    token_id: int,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("profile:write"),
):
    pat = db.query(PersonalAccessToken).filter(PersonalAccessToken.id == token_id).first()
    if not pat:
        raise HTTPException(status_code=404, detail="Token nicht gefunden")
    if pat.user_id != user.id:
        raise HTTPException(status_code=403, detail="Kein Zugriff auf dieses Token")

    db.delete(pat)
    db.commit()
    return {"status": "deleted", "token_id": token_id}
