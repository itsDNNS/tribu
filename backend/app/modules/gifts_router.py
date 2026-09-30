"""Gifts around people and occasions.

Two kinds of entries share one list:

- **Ideas** are someone's plan for a person. The person never sees them.
- **Wishes** are what a person wishes for. They see their own wishes, but
  not who takes care of one, how far it is or the notes, until it was given.

Everyone in the family takes part. Adults see every idea and wish that is
not meant for them; children see wishes and the ideas they wrote or took
on themselves. Anyone except the recipient can say "I'll take care of it",
so nobody buys the same thing twice. Occasions (birthdays from the family's
list, Christmas and dated occasions) gather the gifts per person, with an
optional budget that only the adults see.
"""

from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.avatars import AvatarError, normalize_photo
from app.core.clock import local_today
from app.core.deps import current_user, ensure_family_membership, next_birthday_date
from app.core.errors import (
    ADULT_REQUIRED,
    GIFT_ALREADY_CLAIMED,
    GIFT_CONTACT_NOT_FOUND,
    GIFT_NOT_ALLOWED,
    GIFT_NOT_FOUND,
    GIFT_PREVIEW_NOT_ALLOWED,
    GIFT_PREVIEW_UNREACHABLE,
    GIFT_RECIPIENT_CONFLICT,
    GIFT_RECIPIENT_NOT_FAMILY_MEMBER,
    IMAGE_UNREADABLE,
    INVALID_GIFT_KIND,
    INVALID_GIFT_SORT,
    INVALID_GIFT_STATUS,
    INVALID_GIFT_URL,
    error_detail,
)
from app.core.gift_preview import IMAGE_PX, preview_link
from app.core.rate_limits import limiter_storage_options
from app.core.recipe_import import RecipeImportError
from app.core.scopes import require_scope
from app.core.utils import utcnow
from app.database import get_db
from app.models import Contact, FamilyBirthday, GiftBudget, GiftIdea, GiftPriceHistory, Membership, User
from app.schemas import (
    AUTH_RESPONSES,
    NOT_FOUND_RESPONSE,
    GIFT_KINDS,
    GIFT_STATUSES,
    GiftBudgetResponse,
    GiftBudgetSet,
    GiftCreate,
    GiftDetailResponse,
    GiftOccasion,
    GiftOccasionList,
    GiftPreviewRequest,
    GiftPreviewResponse,
    GiftResponse,
    GiftUpdate,
    PaginatedGifts,
)

router = APIRouter(prefix="/gifts", tags=["gifts"], responses={**AUTH_RESPONSES})
limiter = Limiter(key_func=get_remote_address, **limiter_storage_options())

VALID_STATUSES = set(GIFT_STATUSES)
VALID_KINDS = set(GIFT_KINDS)
# Someone is on it once it is ordered, bought or given.
UNDER_WAY = ("ordered", "purchased", "gifted")
HOLIDAYS = ("christmas", "easter")

GIFT_SORT_OPTIONS: tuple[str, ...] = (
    "created_desc",
    "created_asc",
    "occasion_date_asc",
    "price_desc",
    "price_asc",
    "title_asc",
)

CONTENT_FIELDS = {
    "title", "description", "url", "image", "occasion", "occasion_date", "current_price_cents", "currency",
}
RECIPIENT_FIELDS = {"for_user_id", "for_contact_id", "for_person_name"}
BUYER_FIELDS = {"status", "notes"}


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


def _fold(name: str) -> str:
    return " ".join((name or "").split()).casefold()


class _Links:
    """Who a gift is for: contacts that are family members, and names that
    are a contact or a member ("Opa Karl" typed by hand is the contact)."""

    def __init__(self, db: Session, family_id: int) -> None:
        contacts = (
            db.query(Contact.id, Contact.member_user_id, Contact.full_name)
            .filter(Contact.family_id == family_id)
            .all()
        )
        members = (
            db.query(User.id, User.display_name)
            .join(Membership, Membership.user_id == User.id)
            .filter(Membership.family_id == family_id)
            .all()
        )
        self.contact_members = {contact_id: member for contact_id, member, _ in contacts if member}
        targets: dict[str, set] = {}
        for contact_id, member, name in contacts:
            targets.setdefault(_fold(name), set()).add(f"u:{member}" if member else f"c:{contact_id}")
        for user_id, name in members:
            targets.setdefault(_fold(name), set()).add(f"u:{user_id}")
        # Only names that point at one person.
        self.names = {name: next(iter(keys)) for name, keys in targets.items() if name and len(keys) == 1}

    def member(self, gift: GiftIdea) -> Optional[int]:
        """The family member a gift is for, also through a contact or a name."""
        if gift.for_user_id is not None:
            return gift.for_user_id
        if gift.for_contact_id is not None:
            return self.contact_members.get(gift.for_contact_id)
        target = self.names.get(_fold(gift.for_person_name)) if gift.for_person_name else None
        return int(target[2:]) if target and target.startswith("u:") else None

    def key(self, gift: GiftIdea) -> Optional[str]:
        """"u:<member>", "c:<contact>", "n:<folded name>", or None without a recipient."""
        member = self.member(gift)
        if member is not None:
            return f"u:{member}"
        if gift.for_contact_id is not None:
            return f"c:{gift.for_contact_id}"
        if gift.for_person_name:
            name = _fold(gift.for_person_name)
            return self.names.get(name, f"n:{name}")
        return None

    def birthday(self, birthday: FamilyBirthday) -> tuple[Optional[int], str]:
        """The member a birthday belongs to (if any) and its recipient key."""
        member = birthday.member_user_id
        if member is None and birthday.contact_id is not None:
            member = self.contact_members.get(birthday.contact_id)
        if member is not None:
            return member, f"u:{member}"
        if birthday.contact_id is not None:
            return None, f"c:{birthday.contact_id}"
        name = _fold(birthday.person_name)
        key = self.names.get(name, f"n:{name}")
        return (int(key[2:]) if key.startswith("u:") else None), key


class _Viewer:
    """Who is looking, and who the family's gifts are for."""

    def __init__(self, db: Session, user: User, membership: Membership) -> None:
        self.user_id = user.id
        self.is_adult = bool(membership.is_adult)
        self.family_id = membership.family_id
        self.links = _Links(db, membership.family_id)

    def recipient_user_id(self, gift: GiftIdea) -> Optional[int]:
        return self.links.member(gift)

    def is_recipient(self, gift: GiftIdea) -> bool:
        return self.recipient_user_id(gift) == self.user_id

    def can_see(self, gift: GiftIdea) -> bool:
        if self.is_recipient(gift):
            return gift.kind == "wish"
        if self.is_adult or gift.kind == "wish":
            return True
        return self.user_id in (gift.created_by_user_id, gift.claimed_by_user_id)

    def may_edit_content(self, gift: GiftIdea) -> bool:
        if self.is_recipient(gift):
            return True  # their own wish
        return self.is_adult or gift.created_by_user_id == self.user_id

    def may_change_recipient(self, gift: GiftIdea) -> bool:
        return not self.is_recipient(gift) and (self.is_adult or gift.created_by_user_id == self.user_id)

    def may_buy(self, gift: GiftIdea) -> bool:
        if self.is_recipient(gift):
            return False
        return self.is_adult or self.user_id in (gift.created_by_user_id, gift.claimed_by_user_id)

    def may_delete(self, gift: GiftIdea) -> bool:
        if self.is_recipient(gift):
            return gift.created_by_user_id == self.user_id
        return self.is_adult or gift.created_by_user_id == self.user_id


def _viewer(db: Session, user: User, family_id: int) -> _Viewer:
    return _Viewer(db, user, ensure_family_membership(db, user.id, family_id))


def _serialize(gift: GiftIdea, viewer: _Viewer, detail: bool = False):
    """The gift as this viewer may see it."""
    model = GiftDetailResponse if detail else GiftResponse
    data = model.model_validate(gift).model_dump()
    for_me = viewer.is_recipient(gift)
    data["for_me"] = for_me
    if for_me and gift.status != "gifted":
        # A surprise stays one: nobody tells the wisher who is on it.
        data.update(status="idea", claimed_by_user_id=None, claimed_at=None, notes=None, gifted_at=None)
        if detail:
            data["price_history"] = []
    elif for_me:
        data["notes"] = None
    elif not viewer.is_adult and viewer.user_id not in (gift.created_by_user_id, gift.claimed_by_user_id):
        data["notes"] = None
    return model(**data)


def _load_gift(db: Session, user: User, gift_id: int) -> tuple[GiftIdea, _Viewer]:
    """Fetch a gift the caller may see.

    Callers outside the family, and the recipient of an idea, see 404, so a
    surprise does not leak through 403-vs-404.
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
    viewer = _Viewer(db, user, membership)
    if not viewer.can_see(gift):
        raise HTTPException(status_code=404, detail=error_detail(GIFT_NOT_FOUND))
    return gift, viewer


def _not_allowed() -> HTTPException:
    return HTTPException(status_code=403, detail=error_detail(GIFT_NOT_ALLOWED))


def _validate_url(url: Optional[str]) -> None:
    if url is None:
        return
    normalized = url.strip().lower()
    if not (normalized.startswith("http://") or normalized.startswith("https://")):
        raise HTTPException(status_code=400, detail=error_detail(INVALID_GIFT_URL))


def _validate_status(status: Optional[str]) -> None:
    if status is None:
        return
    if status not in VALID_STATUSES:
        raise HTTPException(status_code=400, detail=error_detail(INVALID_GIFT_STATUS, status=status))


def _validate_kind(kind: Optional[str]) -> None:
    if kind is not None and kind not in VALID_KINDS:
        raise HTTPException(status_code=400, detail=error_detail(INVALID_GIFT_KIND, kind=kind))


def _stored_image(image: Optional[str]) -> Optional[str]:
    if not image:
        return None
    try:
        return normalize_photo(image, max_px=IMAGE_PX)
    except AvatarError:
        raise HTTPException(status_code=400, detail=error_detail(IMAGE_UNREADABLE)) from None


def _resolve_recipient(
    db: Session, family_id: int, for_user_id: Optional[int], for_contact_id: Optional[int], name: Optional[str],
) -> tuple[Optional[int], Optional[int], Optional[str]]:
    """One recipient at most. A contact that is a family member is the member."""
    name = (name or "").strip() or None
    if sum(value is not None for value in (for_user_id, for_contact_id, name)) > 1:
        raise HTTPException(status_code=400, detail=error_detail(GIFT_RECIPIENT_CONFLICT))
    if for_contact_id is not None:
        contact = db.query(Contact).filter(Contact.id == for_contact_id, Contact.family_id == family_id).first()
        if not contact:
            raise HTTPException(status_code=400, detail=error_detail(GIFT_CONTACT_NOT_FOUND))
        if contact.member_user_id is not None:
            for_user_id, for_contact_id = contact.member_user_id, None
    if for_user_id is not None:
        member = db.query(Membership).filter(
            Membership.user_id == for_user_id,
            Membership.family_id == family_id,
        ).first()
        if not member:
            raise HTTPException(status_code=400, detail=error_detail(GIFT_RECIPIENT_NOT_FAMILY_MEMBER))
    return for_user_id, for_contact_id, name


def _apply_status(gift: GiftIdea, status: str, user_id: int) -> None:
    gift.status = status
    if status == "gifted" and gift.gifted_at is None:
        gift.gifted_at = utcnow()
    elif status != "gifted":
        gift.gifted_at = None
    if status in UNDER_WAY and gift.claimed_by_user_id is None:
        # Whoever orders or buys it is the one taking care of it.
        gift.claimed_by_user_id = user_id
        gift.claimed_at = utcnow()


@router.get(
    "",
    response_model=PaginatedGifts,
    summary="List gift ideas and wishes",
    description=(
        "Return the gift ideas and wishes the caller may see. Ideas for the caller are never listed; "
        "on the caller's own wishes, who takes care of them stays hidden until they were given. "
        "Children see wishes and the ideas they wrote or took on. Scope: `gifts:read`."
    ),
    response_description="Paginated list of gift ideas and wishes",
)
def list_gifts(
    family_id: int,
    status: Optional[str] = Query(None, description="Filter by status"),
    kind: Optional[str] = Query(None, description="Filter by kind: idea or wish"),
    for_user_id: Optional[int] = Query(None, description="Filter by recipient user ID"),
    for_contact_id: Optional[int] = Query(None, description="Filter by recipient contact ID"),
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
    viewer = _viewer(db, user, family_id)

    base = db.query(GiftIdea).filter(GiftIdea.family_id == family_id)
    if status is not None:
        _validate_status(status)
        base = base.filter(GiftIdea.status == status)
    elif not include_gifted:
        base = base.filter(GiftIdea.status != "gifted")
    if kind is not None:
        _validate_kind(kind)
        base = base.filter(GiftIdea.kind == kind)
    if for_user_id is not None:
        base = base.filter(GiftIdea.for_user_id == for_user_id)
    if for_contact_id is not None:
        base = base.filter(GiftIdea.for_contact_id == for_contact_id)
    if occasion is not None:
        base = base.filter(GiftIdea.occasion == occasion)

    visible = [gift for gift in base.order_by(*_sort_expressions(sort)).all() if viewer.can_see(gift)]
    items = [_serialize(gift, viewer) for gift in visible[offset:offset + limit]]
    return PaginatedGifts(items=items, total=len(visible), offset=offset, limit=limit)


@router.post(
    "",
    response_model=GiftResponse,
    summary="Add a gift idea or a wish",
    description=(
        "Add an idea for someone, or a wish. Everyone may add their own wishes and ideas for others; "
        "wishes on someone else's behalf are for adults. Scope: `gifts:write`."
    ),
    response_description="The created gift idea or wish",
)
def create_gift(
    payload: GiftCreate,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("gifts:write"),
):
    membership = ensure_family_membership(db, user.id, payload.family_id)
    _validate_kind(payload.kind)
    _validate_status(payload.status)
    _validate_url(payload.url)
    for_user_id, for_contact_id, name = _resolve_recipient(
        db, payload.family_id, payload.for_user_id, payload.for_contact_id, payload.for_person_name,
    )
    viewer = _Viewer(db, user, membership)
    # A name typed by hand may be a member, even the author.
    recipient = viewer.links.member(GiftIdea(for_user_id=for_user_id, for_contact_id=for_contact_id, for_person_name=name))
    own = recipient == user.id
    if payload.kind == "wish" and not own and not membership.is_adult:
        raise HTTPException(status_code=403, detail=error_detail(ADULT_REQUIRED))
    if own and payload.kind == "idea":
        # An idea for oneself would be hidden from its author: it is a wish.
        raise HTTPException(status_code=400, detail=error_detail(INVALID_GIFT_KIND, kind=payload.kind))

    gift = GiftIdea(
        family_id=payload.family_id,
        kind=payload.kind,
        for_user_id=for_user_id,
        for_contact_id=for_contact_id,
        for_person_name=name,
        title=payload.title.strip(),
        description=payload.description,
        url=payload.url,
        image=_stored_image(payload.image),
        occasion=payload.occasion,
        occasion_date=payload.occasion_date,
        status="idea",
        notes=None if own else payload.notes,
        current_price_cents=payload.current_price_cents,
        currency=payload.currency.upper(),
        created_by_user_id=user.id,
    )
    if not own and payload.status != "idea":
        _apply_status(gift, payload.status, user.id)
    db.add(gift)
    db.flush()

    if payload.current_price_cents is not None:
        db.add(GiftPriceHistory(gift_id=gift.id, price_cents=payload.current_price_cents))

    db.commit()
    db.refresh(gift)
    return _serialize(gift, viewer)


@router.post(
    "/preview",
    response_model=GiftPreviewResponse,
    summary="Read a product link",
    description=(
        "Fetch a product page on the server and read its name, picture and price (Open Graph and "
        "schema.org Product data). Nothing is saved. The shop sees the server's address. Public "
        "addresses only. Rate-limited to 20 requests per minute. Scope: `gifts:write`."
    ),
)
@limiter.limit("20/minute")
def preview_gift_link(
    request: Request,
    payload: GiftPreviewRequest,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("gifts:write"),
):
    ensure_family_membership(db, user.id, payload.family_id)
    _validate_url(payload.url)
    try:
        preview = preview_link(payload.url)
    except RecipeImportError as error:
        if error.code in ("not_allowed", "invalid_url"):
            raise HTTPException(status_code=422, detail=error_detail(GIFT_PREVIEW_NOT_ALLOWED)) from None
        raise HTTPException(status_code=502, detail=error_detail(GIFT_PREVIEW_UNREACHABLE)) from None
    return GiftPreviewResponse(
        title=preview.title,
        image=preview.image,
        price_cents=preview.price_cents,
        currency=preview.currency,
        site=preview.site,
    )


def easter_sunday(year: int) -> date:
    """Easter Sunday (Western), anonymous Gregorian algorithm."""
    a, b, c = year % 19, year // 100, year % 100
    d, e = b // 4, b % 4
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i, k = c // 4, c % 4
    l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l) // 451
    month, day = divmod(h + l - 7 * m + 114, 31)
    return date(year, month, day + 1)


def _next_holiday(occasion: str, today: date) -> date:
    def on(year: int) -> date:
        return date(year, 12, 24) if occasion == "christmas" else easter_sunday(year)

    candidate = on(today.year)
    return candidate if candidate >= today else on(today.year + 1)


@router.get(
    "/occasions",
    response_model=GiftOccasionList,
    summary="Coming occasions with their gifts",
    description=(
        "Birthdays from the family's list, Christmas and dated occasions within `days`, each with the "
        "gifts the caller may see, how many are taken care of or bought, the person's open wishes and "
        "the optional budget (adults only, never on one's own occasion). Scope: `gifts:read`."
    ),
)
def list_occasions(
    family_id: int,
    days: int = Query(120, ge=1, le=400),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("gifts:read"),
):
    viewer = _viewer(db, user, family_id)
    today = local_today()
    until = today + timedelta(days=days)
    gifts = [
        gift for gift in db.query(GiftIdea).filter(GiftIdea.family_id == family_id).order_by(GiftIdea.id).all()
        if viewer.can_see(gift)
    ]
    budgets = {
        (budget.occasion, budget.occasion_date, budget.recipient_key): budget.amount_cents
        for budget in db.query(GiftBudget).filter(GiftBudget.family_id == family_id).all()
    }
    instances: dict[str, GiftOccasion] = {}

    def instance(occasion: str, on: date, recipient_key: str, **extra) -> GiftOccasion:
        key = f"{occasion}:{on.isoformat()}:{recipient_key}"
        if key not in instances:
            instances[key] = GiftOccasion(
                key=key, occasion=occasion, date=on, days_until=(on - today).days, recipient_key=recipient_key,
                **extra,
            )
        return instances[key]

    # Birthdays from the family's list.
    for birthday in db.query(FamilyBirthday).filter(FamilyBirthday.family_id == family_id).all():
        on = next_birthday_date(birthday.month, birthday.day, today)
        if on > until:
            continue
        member, key = viewer.links.birthday(birthday)
        if member is not None:
            extra = {"for_user_id": member}
        elif birthday.contact_id is not None:
            extra = {"for_contact_id": birthday.contact_id}
        else:
            extra = {}
        instance(
            "birthday", on, key, person_name=birthday.person_name,
            turns=(on.year - birthday.year) if birthday.year else None,
            for_me=member == user.id, **extra,
        )
    christmas = _next_holiday("christmas", today)
    if christmas <= until:
        instance("christmas", christmas, "family")

    # Gifts join their occasion; dated ones of their own make one.
    for gift in gifts:
        occasion = (gift.occasion or "").strip()
        if not occasion:
            continue
        recipient = viewer.links.key(gift)
        if occasion in HOLIDAYS:
            on = _next_holiday(occasion, today)
            if on > until or (gift.occasion_date and gift.occasion_date.year != on.year):
                continue
            if gift.occasion_date is None and gift.status == "gifted":
                continue
            target = instance(occasion, on, "family")
        elif occasion == "birthday" and recipient is not None:
            match = next(
                (
                    item for item in instances.values()
                    if item.occasion == "birthday" and item.recipient_key == recipient
                ),
                None,
            )
            if match is None:
                if gift.occasion_date is None or not today <= gift.occasion_date <= until:
                    continue
                target = instance("birthday", gift.occasion_date, recipient, **_recipient_extra(gift, viewer))
            elif gift.occasion_date not in (None, match.date) or (gift.occasion_date is None and gift.status == "gifted"):
                continue
            else:
                target = match
        else:
            if gift.occasion_date is None or not today <= gift.occasion_date <= until:
                continue
            target = instance(occasion, gift.occasion_date, recipient or "family", **_recipient_extra(gift, viewer))
        view = _serialize(gift, viewer)
        if target.recipient_key != "family" and view.for_me and view.kind != "wish":
            continue
        target.gift_ids.append(gift.id)
        target.gift_count += 1
        if view.claimed_by_user_id is not None or view.status in UNDER_WAY:
            target.claimed_count += 1
            if view.current_price_cents is not None and not view.for_me:
                target.spent_cents = (target.spent_cents or 0) + view.current_price_cents
        if view.status in ("purchased", "gifted"):
            target.purchased_count += 1

    # Open wishes of each person, whatever the occasion.
    open_wishes: dict[str, int] = {}
    for gift in gifts:
        if gift.kind != "wish" or gift.status == "gifted":
            continue
        view = _serialize(gift, viewer)
        if view.claimed_by_user_id is not None and not view.for_me:
            continue
        recipient = viewer.links.key(gift)
        if recipient:
            open_wishes[recipient] = open_wishes.get(recipient, 0) + 1

    items = []
    for item in instances.values():
        if item.recipient_key != "family":
            item.wish_count = open_wishes.get(item.recipient_key, 0)
        if item.occasion in HOLIDAYS and item.occasion != "christmas" and not item.gift_ids:
            continue
        if viewer.is_adult and not item.for_me:
            item.budget_cents = budgets.get((item.occasion, item.date, item.recipient_key))
        else:
            item.spent_cents = None
        items.append(item)
    items.sort(key=lambda item: (item.date, item.occasion, item.person_name or ""))
    return GiftOccasionList(items=items)


def birthday_recipient(db: Session, birthday: FamilyBirthday) -> tuple[Optional[int], str]:
    """The member a birthday belongs to (if any) and its recipient key."""
    return _Links(db, birthday.family_id).birthday(birthday)


def gift_under_way(db: Session, family_id: int, recipient_key: str, on: date) -> bool:
    """Whether someone takes care of a birthday gift for this person."""
    links = _Links(db, family_id)
    gifts = db.query(GiftIdea).filter(
        GiftIdea.family_id == family_id,
        GiftIdea.occasion == "birthday",
        (GiftIdea.claimed_by_user_id.isnot(None)) | (GiftIdea.status.in_(UNDER_WAY)),
    ).all()
    return any(links.key(gift) == recipient_key and gift.occasion_date in (None, on) for gift in gifts)


def _recipient_extra(gift: GiftIdea, viewer: _Viewer) -> dict:
    key = viewer.links.key(gift) or ""
    if key.startswith("u:"):
        return {"for_user_id": int(key[2:]), "for_me": int(key[2:]) == viewer.user_id}
    if key.startswith("c:"):
        return {"for_contact_id": int(key[2:]), "person_name": gift.for_person_name}
    return {"person_name": gift.for_person_name}


@router.put(
    "/budgets",
    response_model=GiftBudgetResponse,
    summary="Set or clear an occasion's budget",
    description=(
        "Set the budget for one occasion and person (or `family` for Christmas); `amount_cents: null` "
        "clears it. Adults only, not for their own occasion. Scope: `gifts:write`."
    ),
)
def set_budget(
    payload: GiftBudgetSet,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("gifts:write"),
):
    membership = ensure_family_membership(db, user.id, payload.family_id)
    if not membership.is_adult:
        raise HTTPException(status_code=403, detail=error_detail(ADULT_REQUIRED))
    if payload.recipient_key == f"u:{user.id}":
        raise _not_allowed()
    budget = db.query(GiftBudget).filter(
        GiftBudget.family_id == payload.family_id,
        GiftBudget.occasion == payload.occasion,
        GiftBudget.occasion_date == payload.occasion_date,
        GiftBudget.recipient_key == payload.recipient_key,
    ).first()
    if payload.amount_cents is None:
        if budget:
            db.delete(budget)
    elif budget:
        budget.amount_cents = payload.amount_cents
    else:
        db.add(GiftBudget(
            family_id=payload.family_id,
            occasion=payload.occasion,
            occasion_date=payload.occasion_date,
            recipient_key=payload.recipient_key,
            amount_cents=payload.amount_cents,
        ))
    db.commit()
    return GiftBudgetResponse(
        occasion=payload.occasion,
        occasion_date=payload.occasion_date,
        recipient_key=payload.recipient_key,
        amount_cents=payload.amount_cents,
    )


@router.get(
    "/{gift_id}",
    response_model=GiftDetailResponse,
    summary="Get gift idea with price history",
    description="Return a gift idea or wish with its price history. Scope: `gifts:read`.",
    response_description="The gift idea with price history",
    responses={**NOT_FOUND_RESPONSE},
)
def get_gift(
    gift_id: int,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("gifts:read"),
):
    gift, viewer = _load_gift(db, user, gift_id)
    return _serialize(gift, viewer, detail=True)


@router.patch(
    "/{gift_id}",
    response_model=GiftResponse,
    summary="Update a gift idea",
    description=(
        "Partially update a gift idea or wish. Changing the price appends to the price history. "
        "Setting status to 'gifted' stamps `gifted_at`; clearing it resets the stamp. Ordering or "
        "buying it makes the caller the one taking care of it. The recipient may change their own "
        "wish but not its progress. Scope: `gifts:write`."
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
    gift, viewer = _load_gift(db, user, gift_id)
    fields = payload.model_dump(exclude_unset=True)

    if CONTENT_FIELDS & fields.keys() and not viewer.may_edit_content(gift):
        raise _not_allowed()
    if (RECIPIENT_FIELDS | {"kind"}) & fields.keys() and not viewer.may_change_recipient(gift):
        raise _not_allowed()
    if BUYER_FIELDS & fields.keys() and not viewer.may_buy(gift):
        raise _not_allowed()

    if "status" in fields:
        if fields["status"] is None:
            raise HTTPException(status_code=400, detail=error_detail(INVALID_GIFT_STATUS, status=None))
        _validate_status(fields["status"])
    if "kind" in fields:
        _validate_kind(fields["kind"] or "")
        if fields["kind"] == "idea" and not viewer.is_adult and gift.created_by_user_id != user.id:
            raise _not_allowed()
    if "url" in fields:
        _validate_url(fields["url"])
    if RECIPIENT_FIELDS & fields.keys():
        next_values = {key: fields.get(key, getattr(gift, key)) for key in RECIPIENT_FIELDS}
        # Naming a new recipient replaces the old one.
        chosen = [key for key in RECIPIENT_FIELDS if key in fields and fields[key] not in (None, "")]
        if len(chosen) == 1:
            next_values = {key: (fields[key] if key == chosen[0] else None) for key in RECIPIENT_FIELDS}
        for_user_id, for_contact_id, name = _resolve_recipient(
            db, gift.family_id, next_values["for_user_id"], next_values["for_contact_id"],
            next_values["for_person_name"],
        )
        probe = GiftIdea(for_user_id=for_user_id, for_contact_id=for_contact_id, for_person_name=name)
        if viewer.links.member(probe) == user.id:
            raise _not_allowed()
        gift.for_user_id, gift.for_contact_id, gift.for_person_name = for_user_id, for_contact_id, name
    if "title" in fields and fields["title"] is not None:
        fields["title"] = fields["title"].strip()
    if "image" in fields and fields["image"] != gift.image:
        gift.image = _stored_image(fields["image"])
    if fields.get("currency"):
        fields["currency"] = fields["currency"].upper()

    for key, value in fields.items():
        if key in RECIPIENT_FIELDS or key in ("image", "current_price_cents", "status"):
            continue
        if key in ("title", "currency", "kind") and value is None:
            continue
        setattr(gift, key, value)

    if "current_price_cents" in fields:
        new_price = fields["current_price_cents"]
        if new_price != gift.current_price_cents:
            gift.current_price_cents = new_price
            if new_price is not None:
                db.add(GiftPriceHistory(gift_id=gift.id, price_cents=new_price))

    if "status" in fields:
        _apply_status(gift, fields["status"], user.id)

    db.commit()
    db.refresh(gift)
    return _serialize(gift, viewer)


@router.post(
    "/{gift_id}/claim",
    response_model=GiftResponse,
    summary="Take care of a gift",
    description=(
        "Say \"I'll take care of it\", so nobody else buys the same thing. Anyone in the family except "
        "the recipient. Returns 409 when someone else already does. Scope: `gifts:write`."
    ),
    responses={**NOT_FOUND_RESPONSE},
)
def claim_gift(
    gift_id: int,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("gifts:write"),
):
    gift, viewer = _load_gift(db, user, gift_id)
    if viewer.is_recipient(gift):
        raise _not_allowed()
    if gift.claimed_by_user_id not in (None, user.id):
        raise HTTPException(status_code=409, detail=error_detail(GIFT_ALREADY_CLAIMED))
    if gift.claimed_by_user_id is None:
        gift.claimed_by_user_id = user.id
        gift.claimed_at = utcnow()
        db.commit()
        db.refresh(gift)
    return _serialize(gift, viewer)


@router.delete(
    "/{gift_id}/claim",
    response_model=GiftResponse,
    summary="Stop taking care of a gift",
    description="Free the gift for others. The one taking care of it, or an adult. Scope: `gifts:write`.",
    responses={**NOT_FOUND_RESPONSE},
)
def unclaim_gift(
    gift_id: int,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("gifts:write"),
):
    gift, viewer = _load_gift(db, user, gift_id)
    if viewer.is_recipient(gift):
        raise _not_allowed()
    if gift.claimed_by_user_id not in (None, user.id) and not viewer.is_adult:
        raise _not_allowed()
    gift.claimed_by_user_id = None
    gift.claimed_at = None
    if gift.status in ("ordered", "purchased"):
        gift.status = "idea"
    db.commit()
    db.refresh(gift)
    return _serialize(gift, viewer)


@router.delete(
    "/{gift_id}",
    summary="Delete a gift idea",
    description=(
        "Permanently delete a gift idea or wish and its price history. Adults, and whoever wrote it. "
        "Scope: `gifts:write`."
    ),
    response_description="Deletion confirmation",
    responses={**NOT_FOUND_RESPONSE},
)
def delete_gift(
    gift_id: int,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("gifts:write"),
):
    gift, viewer = _load_gift(db, user, gift_id)
    if not viewer.may_delete(gift):
        raise _not_allowed()
    db.delete(gift)
    db.commit()
    return {"status": "deleted", "gift_id": gift_id}
