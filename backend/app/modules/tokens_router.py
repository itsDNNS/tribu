from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.deps import current_user
from app.core.scopes import VALID_SCOPES, require_scope
from app.database import get_db
from app.models import Membership, PersonalAccessToken, User
from app.schemas import AUTH_RESPONSES, NOT_FOUND_RESPONSE, ErrorResponse, PATCreate, PATCreatedResponse, PATResponse
from app.security import generate_pat

router = APIRouter(prefix="/tokens", tags=["tokens"], responses={**AUTH_RESPONSES})

MAX_TOKENS_PER_USER = 25


def _ensure_user_is_adult(db: Session, user_id: int):
    adult = db.query(Membership).filter(
        Membership.user_id == user_id, Membership.is_adult == True,
    ).first()
    if not adult:
        raise HTTPException(status_code=403, detail="Erwachsenen-Berechtigung erforderlich")


@router.get(
    "",
    response_model=list[PATResponse],
    summary="List personal access tokens",
    description="Return all PATs for the current user. Adult only. Scope: `profile:read`.",
    response_description="List of token metadata",
)
def list_tokens(
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("profile:read"),
):
    _ensure_user_is_adult(db, user.id)
    return (
        db.query(PersonalAccessToken)
        .filter(PersonalAccessToken.user_id == user.id)
        .order_by(PersonalAccessToken.created_at.desc())
        .all()
    )


@router.post(
    "",
    response_model=PATCreatedResponse,
    summary="Create a personal access token",
    description="Generate a new PAT with specified scopes. The token value is only returned once. Adult only. Scope: `profile:write`.",
    response_description="Token value (shown once) and metadata",
)
def create_token(
    payload: PATCreate,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("profile:write"),
):
    _ensure_user_is_adult(db, user.id)
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


@router.delete(
    "/{token_id}",
    summary="Revoke a personal access token",
    description="Permanently delete a PAT. Adult only. Scope: `profile:write`.",
    response_description="Deletion confirmation",
    responses={**NOT_FOUND_RESPONSE},
)
def revoke_token(
    token_id: int,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("profile:write"),
):
    _ensure_user_is_adult(db, user.id)
    pat = db.query(PersonalAccessToken).filter(PersonalAccessToken.id == token_id).first()
    if not pat:
        raise HTTPException(status_code=404, detail="Token nicht gefunden")
    if pat.user_id != user.id:
        raise HTTPException(status_code=403, detail="Kein Zugriff auf dieses Token")

    db.delete(pat)
    db.commit()
    return {"status": "deleted", "token_id": token_id}
