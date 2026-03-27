from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func as sa_func
from sqlalchemy.orm import Session, joinedload, aliased

from app.core import cache
from app.core.deps import current_user, ensure_family_admin, ensure_family_membership
from app.core.scopes import require_scope
from app.database import get_db
from app.models import AuditLog, Family, Membership, User
from app.schemas import AUTH_RESPONSES, ADMIN_RESPONSES, CONFLICT_RESPONSE, NOT_FOUND_RESPONSE, ErrorResponse, AuditLogEntry, CreateMemberRequest, CreateMemberResponse, FamilyMemberResponse, FamilySummary, MemberAdultUpdate, MemberBirthdateUpdate, MemberColorUpdate, MemberRoleUpdate, PaginatedAuditLog, ResetPasswordResponse
from app.security import generate_temp_password, hash_password
from app.core.errors import error_detail, NOT_A_MEMBER, COLOR_NOT_ALLOWED, COLOR_ALREADY_TAKEN, INVALID_ROLE, ONLY_ADULTS_ADMIN, EMAIL_ALREADY_EXISTS, MEMBER_NOT_FOUND, CANNOT_CHANGE_OWN_ADULT, CANNOT_DEMOTE_SELF, CANNOT_RESET_OWN_PASSWORD, USER_NOT_FOUND, CANNOT_REMOVE_SELF

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
                color=m.color,
                date_of_birth=m.date_of_birth,
                profile_image=m.user.profile_image,
            ).model_dump()
            for m in memberships
            if m.user
        ]
    return cache.get_or_set(f"tribu:members:{family_id}", 300, _load)


ALLOWED_COLORS = {
    "#7c3aed", "#f43f5e", "#06b6d4",
    "#f59e0b", "#10b981", "#ec4899",
    "#3b82f6", "#ef4444", "#8b5cf6",
    "#14b8a6", "#f97316", "#6366f1",
}


@router.patch(
    "/{family_id}/members/me/color",
    summary="Set my color",
    description="Set or remove the current user's personal color in this family. Scope: `families:write`.",
    response_description="Updated color",
)
def set_member_color(
    family_id: int,
    payload: MemberColorUpdate,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("families:write"),
):
    membership = db.query(Membership).filter(
        Membership.family_id == family_id,
        Membership.user_id == user.id,
    ).first()
    if not membership:
        raise HTTPException(status_code=404, detail=error_detail(NOT_A_MEMBER))

    if payload.color is not None:
        if payload.color not in ALLOWED_COLORS:
            raise HTTPException(status_code=400, detail=error_detail(COLOR_NOT_ALLOWED))
        taken = db.query(Membership).filter(
            Membership.family_id == family_id,
            Membership.color == payload.color,
            Membership.user_id != user.id,
        ).first()
        if taken:
            raise HTTPException(status_code=409, detail=error_detail(COLOR_ALREADY_TAKEN))

    membership.color = payload.color
    db.commit()
    cache.invalidate(f"tribu:members:{family_id}")
    return {"status": "ok", "color": membership.color}


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
        raise HTTPException(status_code=400, detail=error_detail(INVALID_ROLE))
    if payload.role == "admin" and not payload.is_adult:
        raise HTTPException(status_code=400, detail=error_detail(ONLY_ADULTS_ADMIN))

    existing = db.query(User).filter(User.email == payload.email.lower()).first()
    if existing:
        raise HTTPException(status_code=409, detail=error_detail(EMAIL_ALREADY_EXISTS))

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
        raise HTTPException(status_code=404, detail=error_detail(MEMBER_NOT_FOUND))

    if not payload.is_adult and target_user_id == user.id:
        raise HTTPException(status_code=400, detail=error_detail(CANNOT_CHANGE_OWN_ADULT))

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
    "/{family_id}/members/{target_user_id}/birthdate",
    summary="Update member date of birth",
    description="Set or clear a member's date of birth. Self-update or admin role required. Scope: `families:write`.",
    response_description="Updated birthdate",
    responses={**NOT_FOUND_RESPONSE},
)
def update_member_birthdate(
    family_id: int,
    target_user_id: int,
    payload: MemberBirthdateUpdate,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("families:write"),
):
    # Allow self-update or admin
    if target_user_id != user.id:
        ensure_family_admin(db, user.id, family_id)
    else:
        ensure_family_membership(db, user.id, family_id)
    membership = db.query(Membership).filter(
        Membership.family_id == family_id,
        Membership.user_id == target_user_id,
    ).first()
    if not membership:
        raise HTTPException(status_code=404, detail=error_detail(MEMBER_NOT_FOUND))
    membership.date_of_birth = payload.date_of_birth
    db.commit()
    cache.invalidate(f"tribu:members:{family_id}")
    return {"status": "ok", "user_id": target_user_id, "date_of_birth": str(membership.date_of_birth) if membership.date_of_birth else None}


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
        raise HTTPException(status_code=404, detail=error_detail(MEMBER_NOT_FOUND))

    if payload.role not in ["admin", "member"]:
        raise HTTPException(status_code=400, detail=error_detail(INVALID_ROLE))

    if payload.role == "member" and target_user_id == user.id:
        raise HTTPException(status_code=400, detail=error_detail(CANNOT_DEMOTE_SELF))

    if payload.role == "admin" and not membership.is_adult:
        raise HTTPException(status_code=400, detail=error_detail(ONLY_ADULTS_ADMIN))

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
        raise HTTPException(status_code=400, detail=error_detail(CANNOT_RESET_OWN_PASSWORD))

    membership = db.query(Membership).filter(
        Membership.family_id == family_id,
        Membership.user_id == target_user_id,
    ).first()
    if not membership:
        raise HTTPException(status_code=404, detail=error_detail(MEMBER_NOT_FOUND))

    target_user = db.query(User).filter(User.id == target_user_id).first()
    if not target_user:
        raise HTTPException(status_code=404, detail=error_detail(USER_NOT_FOUND))

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
        raise HTTPException(status_code=400, detail=error_detail(CANNOT_REMOVE_SELF))

    membership = db.query(Membership).filter(
        Membership.family_id == family_id,
        Membership.user_id == target_user_id,
    ).first()
    if not membership:
        raise HTTPException(status_code=404, detail=error_detail(MEMBER_NOT_FOUND))

    target_user = db.query(User).filter(User.id == target_user_id).with_for_update().first()
    display_name = target_user.display_name if target_user else None

    _audit(db, family_id, user.id, "member_removed", target_user_id=target_user_id,
           details={"display_name": display_name, "role": membership.role})
    db.delete(membership)
    db.flush()

    remaining = db.query(Membership).filter(Membership.user_id == target_user_id).count()
    user_deleted = False
    if remaining == 0 and target_user:
        db.delete(target_user)
        user_deleted = True

    db.commit()
    cache.invalidate(f"tribu:members:{family_id}")
    cache.invalidate_pattern("tribu:families:*")
    return {"status": "ok", "user_id": target_user_id, "user_deleted": user_deleted}


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
