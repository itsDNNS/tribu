from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.deps import current_user, ensure_adult, ensure_family_membership
from app.core.errors import (
    ADULT_REQUIRED,
    GIFT_NOT_FOUND,
    GIFT_RECIPIENT_CONFLICT,
    GIFT_RECIPIENT_NOT_FAMILY_MEMBER,
    INVALID_GIFT_SORT,
    INVALID_GIFT_STATUS,
    INVALID_GIFT_URL,
    error_detail,
)
from app.core.scopes import require_scope
from app.core.utils import utcnow
from app.database import get_db
from app.models import GiftIdea, GiftPriceHistory, Membership, User
from app.schemas import (
    AUTH_RESPONSES,
    NOT_FOUND_RESPONSE,
    GIFT_STATUSES,
    GiftCreate,
    GiftDetailResponse,
    GiftResponse,
    GiftUpdate,
    PaginatedGifts,
)

router = APIRouter(prefix="/gifts", tags=["gifts"], responses={**AUTH_RESPONSES})

VALID_STATUSES = set(GIFT_STATUSES)

GIFT_SORT_OPTIONS: tuple[str, ...] = (
    "created_desc",
    "created_asc",
    "occasion_date_asc",
    "price_desc",
    "price_asc",
    "title_asc",
)


def _sort_expressions(sort: str):
    """Translate a sort key into SQLAlchemy order_by expressions.

    NULL values for occasion_date and price sort to the end so recent
    entries without those fields do not clutter the top of the list.
    Every sort ends with id.desc() as a stable tiebreaker so pagination
    and tie behavior stay deterministic when two rows share a sort key.
    """
    id_tiebreaker = GiftIdea.id.desc()
    if sort == "created_desc":
        return [GiftIdea.created_at.desc(), id_tiebreaker]
    if sort == "created_asc":
        return [GiftIdea.created_at.asc(), GiftIdea.id.asc()]
    if sort == "occasion_date_asc":
        return [GiftIdea.occasion_date.asc().nullslast(), id_tiebreaker]
    if sort == "price_desc":
        return [GiftIdea.current_price_cents.desc().nullslast(), id_tiebreaker]
    if sort == "price_asc":
        return [GiftIdea.current_price_cents.asc().nullslast(), id_tiebreaker]
    if sort == "title_asc":
        return [func.lower(GiftIdea.title).asc(), id_tiebreaker]
    raise HTTPException(status_code=400, detail=error_detail(INVALID_GIFT_SORT, sort=sort))


def _require_adult_or_403(db: Session, user: User, family_id: int) -> Membership:
    """Gift list is adult-only to keep surprises intact."""
    membership = ensure_family_membership(db, user.id, family_id)
    if not membership.is_adult:
        raise HTTPException(status_code=403, detail=error_detail(ADULT_REQUIRED))
    return membership


def _load_gift_for_caller(db: Session, user: User, gift_id: int) -> GiftIdea:
    """Fetch a gift and authorize the caller.

    Callers outside the family see 404, not 403, so gift existence and
    recipient membership stay private across families.
    """
    gift = db.query(GiftIdea).filter(GiftIdea.id == gift_id).first()
    if not gift:
        raise HTTPException(status_code=404, detail=error_detail(GIFT_NOT_FOUND))
    membership = db.query(Membership).filter(
        Membership.user_id == user.id,
        Membership.family_id == gift.family_id,
    ).first()
    if not membership:
        raise HTTPException(status_code=404, detail=error_detail(GIFT_NOT_FOUND))
    if not membership.is_adult:
        raise HTTPException(status_code=403, detail=error_detail(ADULT_REQUIRED))
    return gift


def _validate_url(url: Optional[str]) -> None:
    if url is None:
        return
    normalized = url.strip().lower()
    if not (normalized.startswith("http://") or normalized.startswith("https://")):
        raise HTTPException(status_code=400, detail=error_detail(INVALID_GIFT_URL))


def _validate_recipient(db: Session, family_id: int, for_user_id: Optional[int]) -> None:
    if for_user_id is None:
        return
    member = db.query(Membership).filter(
        Membership.user_id == for_user_id,
        Membership.family_id == family_id,
    ).first()
    if not member:
        raise HTTPException(status_code=400, detail=error_detail(GIFT_RECIPIENT_NOT_FAMILY_MEMBER))


def _resolved_recipient(current_user_id: Optional[int], current_external: Optional[str],
                        fields: dict) -> tuple[Optional[int], Optional[str]]:
    """Return the (for_user_id, for_person_name) pair after applying the incoming patch."""
    next_user_id = fields["for_user_id"] if "for_user_id" in fields else current_user_id
    next_external = fields["for_person_name"] if "for_person_name" in fields else current_external
    if next_user_id is not None and next_external:
        raise HTTPException(status_code=400, detail=error_detail(GIFT_RECIPIENT_CONFLICT))
    return next_user_id, next_external


def _validate_status(status: Optional[str]) -> None:
    if status is None:
        return
    if status not in VALID_STATUSES:
        raise HTTPException(status_code=400, detail=error_detail(INVALID_GIFT_STATUS, status=status))


@router.get(
    "",
    response_model=PaginatedGifts,
    summary="List gift ideas",
    description=(
        "Return paginated gift ideas for a family. Adult only — children cannot see gifts to keep surprises intact. "
        "Scope: `gifts:read`."
    ),
    response_description="Paginated list of gift ideas",
)
def list_gifts(
    family_id: int,
    status: Optional[str] = Query(None, description="Filter by status"),
    for_user_id: Optional[int] = Query(None, description="Filter by recipient user ID"),
    occasion: Optional[str] = Query(None, description="Filter by occasion"),
    include_gifted: bool = Query(True, description="Include entries with status 'gifted'"),
    sort: str = Query(
        "created_desc",
        description=(
            "Sort order. One of: created_desc (default), created_asc, "
            "occasion_date_asc, price_desc, price_asc, title_asc."
        ),
    ),
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("gifts:read"),
):
    _require_adult_or_403(db, user, family_id)

    base = db.query(GiftIdea).filter(GiftIdea.family_id == family_id)
    if status is not None:
        _validate_status(status)
        base = base.filter(GiftIdea.status == status)
    elif not include_gifted:
        base = base.filter(GiftIdea.status != "gifted")
    if for_user_id is not None:
        base = base.filter(GiftIdea.for_user_id == for_user_id)
    if occasion is not None:
        base = base.filter(GiftIdea.occasion == occasion)

    order_by = _sort_expressions(sort)
    total = base.count()
    items = base.order_by(*order_by).offset(offset).limit(limit).all()
    return PaginatedGifts(items=items, total=total, offset=offset, limit=limit)


@router.post(
    "",
    response_model=GiftResponse,
    summary="Create a gift idea",
    description="Create a new gift idea. Adult only. Scope: `gifts:write`.",
    response_description="The created gift idea",
)
def create_gift(
    payload: GiftCreate,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("gifts:write"),
):
    _require_adult_or_403(db, user, payload.family_id)
    _validate_status(payload.status)
    _validate_url(payload.url)
    _validate_recipient(db, payload.family_id, payload.for_user_id)
    if payload.for_user_id is not None and payload.for_person_name:
        raise HTTPException(status_code=400, detail=error_detail(GIFT_RECIPIENT_CONFLICT))

    gift = GiftIdea(
        family_id=payload.family_id,
        for_user_id=payload.for_user_id,
        for_person_name=payload.for_person_name,
        title=payload.title,
        description=payload.description,
        url=payload.url,
        occasion=payload.occasion,
        occasion_date=payload.occasion_date,
        status=payload.status,
        notes=payload.notes,
        current_price_cents=payload.current_price_cents,
        currency=payload.currency,
        gifted_at=utcnow() if payload.status == "gifted" else None,
        created_by_user_id=user.id,
    )
    db.add(gift)
    db.flush()

    if payload.current_price_cents is not None:
        db.add(GiftPriceHistory(gift_id=gift.id, price_cents=payload.current_price_cents))

    db.commit()
    db.refresh(gift)
    return gift


@router.get(
    "/{gift_id}",
    response_model=GiftDetailResponse,
    summary="Get gift idea with price history",
    description="Return a gift idea with embedded price history. Adult only. Scope: `gifts:read`.",
    response_description="The gift idea with price history",
    responses={**NOT_FOUND_RESPONSE},
)
def get_gift(
    gift_id: int,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("gifts:read"),
):
    return _load_gift_for_caller(db, user, gift_id)


@router.patch(
    "/{gift_id}",
    response_model=GiftResponse,
    summary="Update a gift idea",
    description=(
        "Partially update a gift idea. Changing the price appends to the price history. "
        "Setting status to 'gifted' stamps `gifted_at`; clearing it resets the stamp. "
        "Adult only. Scope: `gifts:write`."
    ),
    response_description="The updated gift idea",
    responses={**NOT_FOUND_RESPONSE},
)
def update_gift(
    gift_id: int,
    payload: GiftUpdate,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("gifts:write"),
):
    gift = _load_gift_for_caller(db, user, gift_id)

    fields = payload.model_dump(exclude_unset=True)

    if "status" in fields:
        _validate_status(fields["status"])
    if "url" in fields:
        _validate_url(fields["url"])
    if "for_user_id" in fields:
        _validate_recipient(db, gift.family_id, fields["for_user_id"])
    _resolved_recipient(gift.for_user_id, gift.for_person_name, fields)

    for key, value in fields.items():
        if key == "current_price_cents":
            continue
        setattr(gift, key, value)

    if "current_price_cents" in fields:
        new_price = fields["current_price_cents"]
        if new_price != gift.current_price_cents:
            gift.current_price_cents = new_price
            if new_price is not None:
                db.add(GiftPriceHistory(gift_id=gift.id, price_cents=new_price))

    if "status" in fields:
        if fields["status"] == "gifted" and gift.gifted_at is None:
            gift.gifted_at = utcnow()
        elif fields["status"] != "gifted":
            gift.gifted_at = None

    db.commit()
    db.refresh(gift)
    return gift


@router.delete(
    "/{gift_id}",
    summary="Delete a gift idea",
    description="Permanently delete a gift idea and its price history. Adult only. Scope: `gifts:write`.",
    response_description="Deletion confirmation",
    responses={**NOT_FOUND_RESPONSE},
)
def delete_gift(
    gift_id: int,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("gifts:write"),
):
    gift = _load_gift_for_caller(db, user, gift_id)
    db.delete(gift)
    db.commit()
    return {"status": "deleted", "gift_id": gift_id}
