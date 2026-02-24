from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from app.core.deps import current_user, ensure_family_admin, ensure_family_membership
from app.core.scopes import require_scope
from app.database import get_db
from app.models import Family, Membership, User
from app.schemas import CreateMemberRequest, CreateMemberResponse, FamilyMemberResponse, FamilySummary, MemberAdultUpdate, MemberRoleUpdate, ResetPasswordResponse
from app.security import generate_temp_password, hash_password

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


@router.post("/{family_id}/members", response_model=CreateMemberResponse)
def create_member(
    family_id: int,
    payload: CreateMemberRequest,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("families:write"),
):
    ensure_family_admin(db, user.id, family_id)

    if payload.role not in ("admin", "member"):
        raise HTTPException(status_code=400, detail="Role must be admin or member")
    if payload.role == "admin" and not payload.is_adult:
        raise HTTPException(status_code=400, detail="Only adults can be admin")

    existing = db.query(User).filter(User.email == payload.email.lower()).first()
    if existing:
        raise HTTPException(status_code=409, detail="Email already in use")

    temp_password = generate_temp_password()

    new_user = User(
        email=payload.email.lower(),
        password_hash=hash_password(temp_password),
        display_name=payload.display_name,
        must_change_password=True,
    )
    db.add(new_user)
    db.flush()

    membership = Membership(
        user_id=new_user.id,
        family_id=family_id,
        role=payload.role,
        is_adult=payload.is_adult,
    )
    db.add(membership)
    db.commit()

    return CreateMemberResponse(
        user_id=new_user.id,
        email=new_user.email,
        display_name=new_user.display_name,
        role=payload.role,
        is_adult=payload.is_adult,
        temporary_password=temp_password,
    )


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


@router.post("/{family_id}/members/{target_user_id}/reset-password", response_model=ResetPasswordResponse)
def reset_member_password(
    family_id: int,
    target_user_id: int,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("families:write"),
):
    ensure_family_admin(db, user.id, family_id)

    if target_user_id == user.id:
        raise HTTPException(status_code=400, detail="Cannot reset your own password here")

    membership = db.query(Membership).filter(
        Membership.family_id == family_id,
        Membership.user_id == target_user_id,
    ).first()
    if not membership:
        raise HTTPException(status_code=404, detail="Member not found")

    target_user = db.query(User).filter(User.id == target_user_id).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")

    temp_password = generate_temp_password()
    target_user.password_hash = hash_password(temp_password)
    target_user.must_change_password = True
    db.commit()

    return ResetPasswordResponse(
        user_id=target_user.id,
        temporary_password=temp_password,
    )
