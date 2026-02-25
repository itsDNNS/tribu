from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func as sa_func
from sqlalchemy.orm import Session, joinedload, aliased

from app.core import cache
from app.core.deps import current_user, ensure_family_admin, ensure_family_membership
from app.core.scopes import require_scope
from app.database import get_db
from app.models import AuditLog, Family, Membership, User
from app.schemas import AUTH_RESPONSES, ADMIN_RESPONSES, CONFLICT_RESPONSE, NOT_FOUND_RESPONSE, ErrorResponse, AuditLogEntry, CreateMemberRequest, CreateMemberResponse, FamilyMemberResponse, FamilySummary, MemberAdultUpdate, MemberRoleUpdate, PaginatedAuditLog, ResetPasswordResponse
from app.security import generate_temp_password, hash_password

router = APIRouter(prefix="/families", tags=["families"], responses={**AUTH_RESPONSES})


def _audit(db, family_id, admin_id, action, target_user_id=None, details=None):
    db.add(AuditLog(family_id=family_id, admin_user_id=admin_id, action=action,
                     target_user_id=target_user_id, details=details))


@router.get(
    "/me",
    response_model=list[FamilySummary],
    summary="List my families",
    description="Return all families the current user belongs to, with role and adult status. Scope: `families:read`.",
    response_description="List of family memberships",
)
def my_families(user: User = Depends(current_user), db: Session = Depends(get_db), _scope=require_scope("families:read")):
    def _load():
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
            ).model_dump()
            for m in memberships
            if m.family
        ]
    return cache.get_or_set(f"tribu:families:{user.id}", 300, _load)


@router.get(
    "/{family_id}/members",
    response_model=list[FamilyMemberResponse],
    summary="List family members",
    description="Return all members of a family. Requires family membership. Scope: `families:read`.",
    response_description="List of family members",
)
def family_members(
    family_id: int,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("families:read"),
):
    ensure_family_membership(db, user.id, family_id)

    def _load():
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
            ).model_dump()
            for m in memberships
            if m.user
        ]
    return cache.get_or_set(f"tribu:members:{family_id}", 300, _load)


@router.post(
    "/{family_id}/members",
    response_model=CreateMemberResponse,
    summary="Create a family member",
    description="Create a new user and add them to the family with a temporary password. Admin role required. Scope: `families:write`.",
    response_description="Newly created member with temporary password",
    responses={**CONFLICT_RESPONSE},
)
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
    _audit(db, family_id, user.id, "member_created", target_user_id=new_user.id,
           details={"role": payload.role, "email": payload.email.lower()})
    db.commit()

    cache.invalidate(f"tribu:members:{family_id}")
    cache.invalidate_pattern("tribu:families:*")
    return CreateMemberResponse(
        user_id=new_user.id,
        email=new_user.email,
        display_name=new_user.display_name,
        role=payload.role,
        is_adult=payload.is_adult,
        temporary_password=temp_password,
    )


@router.patch(
    "/{family_id}/members/{target_user_id}/adult",
    summary="Update member adult status",
    description="Change a member's adult flag. Demotes admins to member when set to non-adult. Admin role required. Scope: `families:write`.",
    response_description="Updated adult status and role",
    responses={**NOT_FOUND_RESPONSE},
)
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
    _audit(db, family_id, user.id, "adult_changed", target_user_id=target_user_id,
           details={"is_adult": payload.is_adult})
    db.commit()
    cache.invalidate(f"tribu:members:{family_id}")
    cache.invalidate_pattern("tribu:families:*")
    return {"status": "ok", "user_id": target_user_id, "is_adult": membership.is_adult, "role": membership.role}


@router.patch(
    "/{family_id}/members/{target_user_id}/role",
    summary="Update member role",
    description="Change a member's role to admin or member. Only adults can be promoted to admin. Admin role required. Scope: `families:write`.",
    response_description="Updated role",
    responses={**NOT_FOUND_RESPONSE},
)
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

    old_role = membership.role
    membership.role = payload.role
    _audit(db, family_id, user.id, "role_changed", target_user_id=target_user_id,
           details={"old": old_role, "new": payload.role})
    db.commit()
    cache.invalidate(f"tribu:members:{family_id}")
    cache.invalidate_pattern("tribu:families:*")
    return {"status": "ok", "user_id": target_user_id, "role": membership.role}


@router.post(
    "/{family_id}/members/{target_user_id}/reset-password",
    response_model=ResetPasswordResponse,
    summary="Reset member password",
    description="Generate a new temporary password for a family member. Cannot reset your own password. Admin role required. Scope: `families:write`.",
    response_description="New temporary password",
    responses={**NOT_FOUND_RESPONSE},
)
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
    _audit(db, family_id, user.id, "password_reset", target_user_id=target_user_id)
    db.commit()

    return ResetPasswordResponse(
        user_id=target_user.id,
        temporary_password=temp_password,
    )


@router.delete(
    "/{family_id}/members/{target_user_id}",
    summary="Remove a family member",
    description="Remove a member from the family. Cannot remove yourself. Admin role required. Scope: `families:write`.",
    response_description="Confirmation of removal",
    responses={**NOT_FOUND_RESPONSE},
)
def remove_member(
    family_id: int,
    target_user_id: int,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("families:write"),
):
    ensure_family_admin(db, user.id, family_id)

    if target_user_id == user.id:
        raise HTTPException(status_code=400, detail="Cannot remove yourself")

    membership = db.query(Membership).filter(
        Membership.family_id == family_id,
        Membership.user_id == target_user_id,
    ).first()
    if not membership:
        raise HTTPException(status_code=404, detail="Member not found")

    target_user = db.query(User).filter(User.id == target_user_id).first()
    display_name = target_user.display_name if target_user else None

    _audit(db, family_id, user.id, "member_removed", target_user_id=target_user_id,
           details={"display_name": display_name, "role": membership.role})
    db.delete(membership)
    db.commit()
    cache.invalidate(f"tribu:members:{family_id}")
    cache.invalidate_pattern("tribu:families:*")
    return {"status": "ok", "user_id": target_user_id}


@router.get(
    "/{family_id}/audit-log",
    response_model=PaginatedAuditLog,
    summary="Get family audit log",
    description="Return paginated admin action history for the family. Admin role required. Scope: `families:read`.",
    response_description="Paginated audit log entries",
)
def get_audit_log(
    family_id: int,
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("families:read"),
):
    ensure_family_admin(db, user.id, family_id)

    AdminUser = aliased(User)
    TargetUser = aliased(User)

    query = (
        db.query(
            AuditLog,
            AdminUser.display_name.label("admin_display_name"),
            TargetUser.display_name.label("target_display_name"),
        )
        .outerjoin(AdminUser, AuditLog.admin_user_id == AdminUser.id)
        .outerjoin(TargetUser, AuditLog.target_user_id == TargetUser.id)
        .filter(AuditLog.family_id == family_id)
    )

    total = db.query(sa_func.count(AuditLog.id)).filter(AuditLog.family_id == family_id).scalar()

    rows = query.order_by(AuditLog.created_at.desc()).offset(offset).limit(limit).all()

    items = [
        AuditLogEntry(
            id=row.AuditLog.id,
            family_id=row.AuditLog.family_id,
            admin_user_id=row.AuditLog.admin_user_id,
            admin_display_name=row.admin_display_name,
            action=row.AuditLog.action,
            target_user_id=row.AuditLog.target_user_id,
            target_display_name=row.target_display_name,
            details=row.AuditLog.details,
            created_at=row.AuditLog.created_at,
        )
        for row in rows
    ]

    return PaginatedAuditLog(items=items, total=total, offset=offset, limit=limit)
