from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from app.core.deps import current_user, ensure_family_admin, ensure_family_membership
from app.core.scopes import require_scope
from app.database import get_db
from app.models import Family, Membership, User
from app.schemas import FamilyMemberResponse, FamilySummary, MemberAdultUpdate, MemberRoleUpdate

router = APIRouter(prefix="/families", tags=["families"])


@router.get("/me", response_model=list[FamilySummary])
def my_families(user: User = Depends(current_user), db: Session = Depends(get_db), _scope=require_scope("families:read")):
    memberships = (
        db.query(Membership)
        .options(joinedload(Membership.family))
        .filter(Membership.user_id == user.id)
        .all()
    )
    return [
        FamilySummary(
            family_id=m.family.id,
            family_name=m.family.name,
            role=m.role,
            is_adult=m.is_adult,
        )
        for m in memberships
        if m.family
    ]


@router.get("/{family_id}/members", response_model=list[FamilyMemberResponse])
def family_members(
    family_id: int,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("families:read"),
):
    ensure_family_membership(db, user.id, family_id)
    memberships = (
        db.query(Membership)
        .options(joinedload(Membership.user))
        .filter(Membership.family_id == family_id)
        .all()
    )
    return [
        FamilyMemberResponse(
            user_id=m.user.id,
            display_name=m.user.display_name,
            email=m.user.email,
            role=m.role,
            is_adult=m.is_adult,
        )
        for m in memberships
        if m.user
    ]


@router.patch("/{family_id}/members/{target_user_id}/adult")
def update_member_adult(
    family_id: int,
    target_user_id: int,
    payload: MemberAdultUpdate,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("families:write"),
):
    ensure_family_admin(db, user.id, family_id)

    membership = db.query(Membership).filter(
        Membership.family_id == family_id,
        Membership.user_id == target_user_id,
    ).first()
    if not membership:
        raise HTTPException(status_code=404, detail="Mitglied nicht gefunden")

    if not payload.is_adult and target_user_id == user.id:
        raise HTTPException(status_code=400, detail="Cannot change own adult status")

    membership.is_adult = payload.is_adult
    if not payload.is_adult and membership.role == "admin":
        membership.role = "member"
    db.commit()
    return {"status": "ok", "user_id": target_user_id, "is_adult": membership.is_adult, "role": membership.role}


@router.patch("/{family_id}/members/{target_user_id}/role")
def update_member_role(
    family_id: int,
    target_user_id: int,
    payload: MemberRoleUpdate,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("families:write"),
):
    ensure_family_admin(db, user.id, family_id)

    membership = db.query(Membership).filter(
        Membership.family_id == family_id,
        Membership.user_id == target_user_id,
    ).first()
    if not membership:
        raise HTTPException(status_code=404, detail="Mitglied nicht gefunden")

    if payload.role not in ["admin", "member"]:
        raise HTTPException(status_code=400, detail="Rolle muss admin oder member sein")

    if payload.role == "member" and target_user_id == user.id:
        raise HTTPException(status_code=400, detail="Cannot demote yourself")

    if payload.role == "admin" and not membership.is_adult:
        raise HTTPException(status_code=400, detail="Nur Erwachsene können Admin werden")

    membership.role = payload.role
    db.commit()
    return {"status": "ok", "user_id": target_user_id, "role": membership.role}
