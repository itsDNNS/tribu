from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.deps import current_user, ensure_family_admin, ensure_family_membership
from app.database import get_db
from app.models import Family, Membership, User
from app.schemas import FamilyMemberResponse, FamilySummary, MemberAdultUpdate, MemberRoleUpdate

router = APIRouter(prefix="/families", tags=["families"])


@router.get("/me", response_model=list[FamilySummary])
def my_families(user: User = Depends(current_user), db: Session = Depends(get_db)):
    memberships = db.query(Membership).filter(Membership.user_id == user.id).all()
    result = []
    for membership in memberships:
        family = db.query(Family).filter(Family.id == membership.family_id).first()
        if family:
            result.append(
                FamilySummary(
                    family_id=family.id,
                    family_name=family.name,
                    role=membership.role,
                    is_adult=membership.is_adult,
                )
            )
    return result


@router.get("/{family_id}/members", response_model=list[FamilyMemberResponse])
def family_members(
    family_id: int,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    ensure_family_membership(db, user.id, family_id)
    memberships = db.query(Membership).filter(Membership.family_id == family_id).all()

    result = []
    for m in memberships:
        member_user = db.query(User).filter(User.id == m.user_id).first()
        if member_user:
            result.append(
                FamilyMemberResponse(
                    user_id=member_user.id,
                    display_name=member_user.display_name,
                    email=member_user.email,
                    role=m.role,
                    is_adult=m.is_adult,
                )
            )
    return result


@router.patch("/{family_id}/members/{target_user_id}/adult")
def update_member_adult(
    family_id: int,
    target_user_id: int,
    payload: MemberAdultUpdate,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    ensure_family_admin(db, user.id, family_id)

    membership = db.query(Membership).filter(
        Membership.family_id == family_id,
        Membership.user_id == target_user_id,
    ).first()
    if not membership:
        raise HTTPException(status_code=404, detail="Mitglied nicht gefunden")

    membership.is_adult = payload.is_adult
    if not payload.is_adult and membership.role == "admin":
        membership.role = "member"
    db.commit()
    return {"status": "ok", "user_id": target_user_id, "is_adult": membership.is_adult}


@router.patch("/{family_id}/members/{target_user_id}/role")
def update_member_role(
    family_id: int,
    target_user_id: int,
    payload: MemberRoleUpdate,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
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

    if payload.role == "admin" and not membership.is_adult:
        raise HTTPException(status_code=400, detail="Nur Erwachsene können Admin werden")

    membership.role = payload.role
    db.commit()
    return {"status": "ok", "user_id": target_user_id, "role": membership.role}
