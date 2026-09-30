import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import case, func
from sqlalchemy.orm import Session

from app.core import cache
from app.core.deps import current_user, ensure_adult, ensure_family_membership
from app.core.notification_preferences import should_push_notification_type
from app.core.push import send_push_for_user
from app.core.reminder_text import reminder_text, user_language
from app.core.scopes import require_scope
from app.core.utils import utcnow
from app.database import get_db
from app.models import (
    EarningRule, Membership, Notification, NotificationPreference, Praise, Reward,
    RewardCurrency, TokenTransaction, User,
)
from app.schemas import (
    BalancesResponse, EarningRuleCreate, EarningRuleResponse, EarningRuleUpdate,
    ManualEarnRequest, MemberBalance, PaginatedTransactions,
    PraiseCreate, PraiseResponse,
    RedeemRequest, RewardContribution, RewardCurrencyCreate, RewardCurrencyResponse, RewardCurrencyUpdate,
    RewardGive, RewardGoalSet, RewardItemCreate, RewardItemResponse, RewardItemUpdate,
    TokenTransactionResponse,
)
from app.schemas import AUTH_RESPONSES, NOT_FOUND_RESPONSE
from app.core.errors import (
    error_detail,
    REWARD_CURRENCY_NOT_FOUND, REWARD_CURRENCY_ALREADY_EXISTS,
    EARNING_RULE_NOT_FOUND, REWARD_NOT_FOUND,
    REWARD_TRANSACTION_NOT_FOUND, REWARD_TRANSACTION_NOT_PENDING,
    REWARD_TARGET_NOT_MEMBER, INSUFFICIENT_BALANCE, REWARD_INACTIVE,
    REWARD_NOT_PERSONAL, REWARD_NOT_FAMILY_GOAL, REWARD_GOAL_FULL, REWARD_GOAL_NOT_REACHED,
    REWARD_TRANSACTION_NOT_APPROVED, PRAISE_NOT_FOUND, PRAISE_SELF,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/rewards", tags=["Rewards"], responses={**AUTH_RESPONSES})


def _get_or_create_currency(db: Session, family_id: int) -> RewardCurrency:
    """The family's stars. Every family has them from the first look; the
    empty name reads as the reader's word for stars."""
    currency = db.query(RewardCurrency).filter(RewardCurrency.family_id == family_id).first()
    if currency is None:
        currency = RewardCurrency(family_id=family_id, name="", icon="star")
        db.add(currency)
        db.commit()
        db.refresh(currency)
    return currency


def _goal_progress(db: Session, reward: Reward) -> tuple[int, list[RewardContribution]]:
    """Stars put into a family goal, in total and per member."""
    rows = (
        db.query(TokenTransaction.user_id, func.sum(TokenTransaction.amount))
        .filter(
            TokenTransaction.source_reward_id == reward.id,
            TokenTransaction.kind == "give",
            TokenTransaction.status == "confirmed",
        )
        .group_by(TokenTransaction.user_id)
        .all()
    )
    contributions = [RewardContribution(user_id=user_id, amount=int(amount)) for user_id, amount in rows]
    return sum(item.amount for item in contributions), contributions


def _serialize_reward(db: Session, reward: Reward) -> RewardItemResponse:
    item = RewardItemResponse.model_validate(reward)
    if reward.kind == "family":
        item.progress, item.contributions = _goal_progress(db, reward)
    return item


def _family_reward_or_404(db: Session, reward_id: int, family_id: int) -> Reward:
    reward = db.query(Reward).filter(Reward.id == reward_id, Reward.family_id == family_id).first()
    if not reward:
        raise HTTPException(status_code=404, detail=error_detail(REWARD_NOT_FOUND))
    return reward


def _first_name(user: User) -> str:
    return (user.display_name or "").split(" ")[0] or user.email


def _notify(db: Session, user_id: int, family_id: int, kind: str, title: str, body: str, link: str) -> None:
    """An in-app notification, and a push when the member wants one."""
    db.add(Notification(user_id=user_id, family_id=family_id, type=kind, title=title, body=body, link=link))
    pref = db.query(NotificationPreference).filter(NotificationPreference.user_id == user_id).first()
    if pref and should_push_notification_type(pref, kind)[0]:
        try:
            send_push_for_user(db, user_id, title, body, link)
        except Exception:
            logger.exception("Push notification failed for %s to user %s", kind, user_id)


def _compute_balance(db: Session, family_id: int, user_id: int, include_pending_redeems: bool = False) -> int:
    """Compute token balance. If include_pending_redeems=True, also subtract pending redemptions."""
    if include_pending_redeems:
        result = db.query(
            func.coalesce(
                func.sum(case(
                    (TokenTransaction.kind == "earn", case((TokenTransaction.status == "confirmed", TokenTransaction.amount), else_=0)),
                    else_=case((TokenTransaction.status.in_(["confirmed", "pending"]), -TokenTransaction.amount), else_=0),
                )),
                0,
            )
        ).filter(
            TokenTransaction.family_id == family_id,
            TokenTransaction.user_id == user_id,
        ).scalar()
    else:
        result = db.query(
            func.coalesce(
                func.sum(case((TokenTransaction.kind == "earn", TokenTransaction.amount), else_=-TokenTransaction.amount)),
                0,
            )
        ).filter(
            TokenTransaction.family_id == family_id,
            TokenTransaction.user_id == user_id,
            TokenTransaction.status == "confirmed",
        ).scalar()
    return int(result)


def _verify_currency_belongs_to_family(db: Session, currency_id: int, family_id: int) -> RewardCurrency:
    currency = db.query(RewardCurrency).filter(
        RewardCurrency.id == currency_id, RewardCurrency.family_id == family_id,
    ).first()
    if not currency:
        raise HTTPException(status_code=404, detail=error_detail(REWARD_CURRENCY_NOT_FOUND))
    return currency


def _invalidate_balance(family_id: int, user_id: int):
    cache.invalidate(f"tribu:rewards:balance:{family_id}:{user_id}")


# ── Currency ──────────────────────────────────────────────────


@router.get("/currency", response_model=RewardCurrencyResponse, responses={**NOT_FOUND_RESPONSE})
def get_currency(
    family_id: int = Query(...),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("rewards:read"),
):
    ensure_family_membership(db, user.id, family_id)
    return _get_or_create_currency(db, family_id)


@router.post("/currency", response_model=RewardCurrencyResponse, status_code=201)
def create_currency(
    payload: RewardCurrencyCreate,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("rewards:write"),
):
    ensure_adult(db, user.id, payload.family_id)
    existing = db.query(RewardCurrency).filter(RewardCurrency.family_id == payload.family_id).first()
    if existing:
        raise HTTPException(status_code=409, detail=error_detail(REWARD_CURRENCY_ALREADY_EXISTS))
    currency = RewardCurrency(family_id=payload.family_id, name=payload.name, icon=payload.icon)
    db.add(currency)
    db.commit()
    db.refresh(currency)
    return currency


@router.patch("/currency/{currency_id}", response_model=RewardCurrencyResponse)
def update_currency(
    currency_id: int,
    payload: RewardCurrencyUpdate,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("rewards:write"),
):
    currency = db.query(RewardCurrency).filter(RewardCurrency.id == currency_id).first()
    if not currency:
        raise HTTPException(status_code=404, detail=error_detail(REWARD_CURRENCY_NOT_FOUND))
    ensure_adult(db, user.id, currency.family_id)
    if payload.name is not None:
        currency.name = payload.name
    if payload.icon is not None:
        currency.icon = payload.icon
    db.commit()
    db.refresh(currency)
    return currency


@router.delete("/currency/{currency_id}")
def delete_currency(
    currency_id: int,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("rewards:write"),
):
    currency = db.query(RewardCurrency).filter(RewardCurrency.id == currency_id).first()
    if not currency:
        raise HTTPException(status_code=404, detail=error_detail(REWARD_CURRENCY_NOT_FOUND))
    ensure_adult(db, user.id, currency.family_id)
    db.delete(currency)
    db.commit()
    return {"status": "ok"}


# ── Earning Rules ─────────────────────────────────────────────


@router.get("/rules", response_model=list[EarningRuleResponse])
def list_rules(
    family_id: int = Query(...),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("rewards:read"),
):
    ensure_family_membership(db, user.id, family_id)
    return db.query(EarningRule).filter(EarningRule.family_id == family_id).order_by(EarningRule.name).all()


@router.post("/rules", response_model=EarningRuleResponse, status_code=201)
def create_rule(
    payload: EarningRuleCreate,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("rewards:write"),
):
    ensure_adult(db, user.id, payload.family_id)
    _verify_currency_belongs_to_family(db, payload.currency_id, payload.family_id)
    rule = EarningRule(
        family_id=payload.family_id, currency_id=payload.currency_id,
        name=payload.name, amount=payload.amount,
        require_confirmation=payload.require_confirmation,
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return rule


@router.patch("/rules/{rule_id}", response_model=EarningRuleResponse)
def update_rule(
    rule_id: int,
    payload: EarningRuleUpdate,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("rewards:write"),
):
    rule = db.query(EarningRule).filter(EarningRule.id == rule_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail=error_detail(EARNING_RULE_NOT_FOUND))
    ensure_adult(db, user.id, rule.family_id)
    if payload.name is not None:
        rule.name = payload.name
    if payload.amount is not None:
        rule.amount = payload.amount
    if payload.require_confirmation is not None:
        rule.require_confirmation = payload.require_confirmation
    db.commit()
    db.refresh(rule)
    return rule


@router.delete("/rules/{rule_id}")
def delete_rule(
    rule_id: int,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("rewards:write"),
):
    rule = db.query(EarningRule).filter(EarningRule.id == rule_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail=error_detail(EARNING_RULE_NOT_FOUND))
    ensure_adult(db, user.id, rule.family_id)
    db.delete(rule)
    db.commit()
    return {"status": "ok"}


# ── Reward Catalog ────────────────────────────────────────────


@router.get("/catalog", response_model=list[RewardItemResponse])
def list_catalog(
    family_id: int = Query(...),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("rewards:read"),
):
    ensure_family_membership(db, user.id, family_id)
    rewards = db.query(Reward).filter(Reward.family_id == family_id).order_by(Reward.cost, Reward.id).all()
    return [_serialize_reward(db, reward) for reward in rewards]


@router.post("/catalog", response_model=RewardItemResponse, status_code=201)
def create_reward(
    payload: RewardItemCreate,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("rewards:write"),
):
    ensure_adult(db, user.id, payload.family_id)
    _verify_currency_belongs_to_family(db, payload.currency_id, payload.family_id)
    reward = Reward(
        family_id=payload.family_id, currency_id=payload.currency_id,
        name=payload.name, cost=payload.cost, icon=payload.icon, kind=payload.kind,
    )
    db.add(reward)
    db.commit()
    db.refresh(reward)
    return _serialize_reward(db, reward)


@router.patch("/catalog/{reward_id}", response_model=RewardItemResponse)
def update_reward(
    reward_id: int,
    payload: RewardItemUpdate,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("rewards:write"),
):
    reward = db.query(Reward).filter(Reward.id == reward_id).first()
    if not reward:
        raise HTTPException(status_code=404, detail=error_detail(REWARD_NOT_FOUND))
    ensure_adult(db, user.id, reward.family_id)
    if payload.name is not None:
        reward.name = payload.name
    if payload.cost is not None:
        reward.cost = payload.cost
    if payload.icon is not None:
        reward.icon = payload.icon
    if payload.is_active is not None:
        reward.is_active = payload.is_active
    db.commit()
    db.refresh(reward)
    return _serialize_reward(db, reward)


@router.delete("/catalog/{reward_id}")
def delete_reward(
    reward_id: int,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("rewards:write"),
):
    reward = db.query(Reward).filter(Reward.id == reward_id).first()
    if not reward:
        raise HTTPException(status_code=404, detail=error_detail(REWARD_NOT_FOUND))
    ensure_adult(db, user.id, reward.family_id)
    db.delete(reward)
    db.commit()
    return {"status": "ok"}


# ── Transactions ──────────────────────────────────────────────


@router.get("/transactions", response_model=PaginatedTransactions)
def list_transactions(
    family_id: int = Query(...),
    user_id: int = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("rewards:read"),
):
    membership = ensure_family_membership(db, user.id, family_id)
    query = db.query(TokenTransaction).filter(TokenTransaction.family_id == family_id)
    # Children can only see their own transactions
    if not membership.is_adult:
        query = query.filter(TokenTransaction.user_id == user.id)
    elif user_id:
        query = query.filter(TokenTransaction.user_id == user_id)
    total = query.count()
    items = query.order_by(TokenTransaction.created_at.desc()).offset(offset).limit(limit).all()
    return PaginatedTransactions(items=items, total=total, offset=offset, limit=limit)


@router.post("/transactions/earn", response_model=TokenTransactionResponse, status_code=201)
def earn_tokens(
    payload: ManualEarnRequest,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("rewards:write"),
):
    ensure_adult(db, user.id, payload.family_id)
    _verify_currency_belongs_to_family(db, payload.currency_id, payload.family_id)
    target_membership = db.query(Membership).filter(
        Membership.user_id == payload.target_user_id,
        Membership.family_id == payload.family_id,
    ).first()
    if not target_membership:
        raise HTTPException(status_code=400, detail=error_detail(REWARD_TARGET_NOT_MEMBER))

    txn = TokenTransaction(
        family_id=payload.family_id, currency_id=payload.currency_id,
        user_id=payload.target_user_id, kind="earn", amount=payload.amount,
        status="confirmed", note=payload.note,
        source_rule_id=payload.source_rule_id,
        confirmed_by_user_id=user.id, confirmed_at=utcnow(),
    )
    db.add(txn)
    db.commit()
    db.refresh(txn)
    _invalidate_balance(payload.family_id, payload.target_user_id)
    return txn


@router.post("/transactions/redeem", response_model=TokenTransactionResponse, status_code=201)
def redeem_reward(
    payload: RedeemRequest,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("rewards:write"),
):
    ensure_family_membership(db, user.id, payload.family_id)
    reward = db.query(Reward).filter(Reward.id == payload.reward_id, Reward.family_id == payload.family_id).first()
    if not reward:
        raise HTTPException(status_code=404, detail=error_detail(REWARD_NOT_FOUND))
    if not reward.is_active:
        raise HTTPException(status_code=400, detail=error_detail(REWARD_INACTIVE))

    # Lock membership row to serialize concurrent redeems
    db.query(Membership).filter(
        Membership.user_id == user.id, Membership.family_id == payload.family_id,
    ).with_for_update().first()

    balance = _compute_balance(db, payload.family_id, user.id, include_pending_redeems=True)
    if balance < reward.cost:
        raise HTTPException(status_code=400, detail=error_detail(INSUFFICIENT_BALANCE))

    if reward.kind != "personal":
        raise HTTPException(status_code=400, detail=error_detail(REWARD_NOT_PERSONAL))

    txn = TokenTransaction(
        family_id=payload.family_id, currency_id=reward.currency_id,
        user_id=user.id, kind="redeem", amount=reward.cost,
        status="pending", note=payload.note or reward.name,
        source_reward_id=reward.id,
    )
    db.add(txn)
    adults = (
        db.query(Membership.user_id)
        .filter(Membership.family_id == payload.family_id, Membership.is_adult.is_(True), Membership.user_id != user.id)
        .all()
    )
    for (adult_id,) in adults:
        body = reminder_text(user_language(db, adult_id), "wish_request", name=_first_name(user))
        _notify(db, adult_id, payload.family_id, "reward_request", reward.name, body, "/rewards")
    db.commit()
    db.refresh(txn)
    return txn


@router.patch("/transactions/{txn_id}/confirm", response_model=TokenTransactionResponse)
def confirm_transaction(
    txn_id: int,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("rewards:write"),
):
    txn = db.query(TokenTransaction).filter(TokenTransaction.id == txn_id).first()
    if not txn:
        raise HTTPException(status_code=404, detail=error_detail(REWARD_TRANSACTION_NOT_FOUND))
    ensure_adult(db, user.id, txn.family_id)
    if txn.status != "pending":
        raise HTTPException(status_code=400, detail=error_detail(REWARD_TRANSACTION_NOT_PENDING))
    txn.status = "confirmed"
    txn.confirmed_by_user_id = user.id
    txn.confirmed_at = utcnow()
    if txn.kind == "redeem" and txn.source_reward_id:
        # The wish came true; the next one is up to them.
        db.query(Membership).filter(
            Membership.family_id == txn.family_id,
            Membership.user_id == txn.user_id,
            Membership.reward_goal_id == txn.source_reward_id,
        ).update({Membership.reward_goal_id: None}, synchronize_session=False)
    db.commit()
    db.refresh(txn)
    _invalidate_balance(txn.family_id, txn.user_id)
    return txn


@router.patch("/transactions/{txn_id}/fulfill", response_model=TokenTransactionResponse)
def fulfill_transaction(
    txn_id: int,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("rewards:write"),
):
    """Mark an approved wish as given. Adult only."""
    txn = db.query(TokenTransaction).filter(TokenTransaction.id == txn_id).first()
    if not txn:
        raise HTTPException(status_code=404, detail=error_detail(REWARD_TRANSACTION_NOT_FOUND))
    ensure_adult(db, user.id, txn.family_id)
    if txn.kind != "redeem" or txn.status != "confirmed":
        raise HTTPException(status_code=400, detail=error_detail(REWARD_TRANSACTION_NOT_APPROVED))
    if txn.fulfilled_at is None:
        txn.fulfilled_at = utcnow()
        db.commit()
        db.refresh(txn)
    return txn


@router.patch("/transactions/{txn_id}/reject", response_model=TokenTransactionResponse)
def reject_transaction(
    txn_id: int,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("rewards:write"),
):
    txn = db.query(TokenTransaction).filter(TokenTransaction.id == txn_id).first()
    if not txn:
        raise HTTPException(status_code=404, detail=error_detail(REWARD_TRANSACTION_NOT_FOUND))
    ensure_adult(db, user.id, txn.family_id)
    if txn.status != "pending":
        raise HTTPException(status_code=400, detail=error_detail(REWARD_TRANSACTION_NOT_PENDING))
    txn.status = "rejected"
    txn.confirmed_by_user_id = user.id
    txn.confirmed_at = utcnow()
    db.commit()
    db.refresh(txn)
    return txn


# ── Balances ──────────────────────────────────────────────────


@router.get("/balances", response_model=BalancesResponse)
def get_balances(
    family_id: int = Query(...),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("rewards:read"),
):
    membership = ensure_family_membership(db, user.id, family_id)
    currency = _get_or_create_currency(db, family_id)

    members = (
        db.query(Membership, User)
        .join(User, Membership.user_id == User.id)
        .filter(Membership.family_id == family_id)
        .all()
    )

    balances = []
    for m, u in members:
        # Children only see their own balance
        if not membership.is_adult and m.user_id != user.id:
            continue
        confirmed = _compute_balance(db, family_id, m.user_id)
        pending = db.query(func.coalesce(func.sum(TokenTransaction.amount), 0)).filter(
            TokenTransaction.family_id == family_id,
            TokenTransaction.user_id == m.user_id,
            TokenTransaction.kind == "earn",
            TokenTransaction.status == "pending",
        ).scalar()
        balances.append(MemberBalance(
            user_id=m.user_id, display_name=u.display_name,
            balance=confirmed, pending=int(pending),
            goal_reward_id=m.reward_goal_id,
        ))

    return BalancesResponse(
        family_id=family_id, currency_id=currency.id,
        currency_name=currency.name, currency_icon=currency.icon,
        balances=balances,
    )


# ── Goals ─────────────────────────────────────────────────────


@router.put("/goal", response_model=MemberBalance)
def set_goal(
    payload: RewardGoalSet,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("rewards:write"),
):
    """Choose the personal wish to save for, or clear it."""
    membership = ensure_family_membership(db, user.id, payload.family_id)
    if payload.reward_id is not None:
        reward = _family_reward_or_404(db, payload.reward_id, payload.family_id)
        if reward.kind != "personal":
            raise HTTPException(status_code=400, detail=error_detail(REWARD_NOT_PERSONAL))
        if not reward.is_active:
            raise HTTPException(status_code=400, detail=error_detail(REWARD_INACTIVE))
    membership.reward_goal_id = payload.reward_id
    db.commit()
    pending = db.query(func.coalesce(func.sum(TokenTransaction.amount), 0)).filter(
        TokenTransaction.family_id == payload.family_id,
        TokenTransaction.user_id == user.id,
        TokenTransaction.kind == "earn",
        TokenTransaction.status == "pending",
    ).scalar()
    return MemberBalance(
        user_id=user.id, display_name=user.display_name,
        balance=_compute_balance(db, payload.family_id, user.id), pending=int(pending),
        goal_reward_id=membership.reward_goal_id,
    )


@router.post("/goals/{reward_id}/give", response_model=RewardItemResponse)
def give_to_family_goal(
    reward_id: int,
    payload: RewardGive,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("rewards:write"),
):
    """Put some of one's own stars into a family goal. Never more than the
    goal still needs."""
    ensure_family_membership(db, user.id, payload.family_id)
    reward = _family_reward_or_404(db, reward_id, payload.family_id)
    if reward.kind != "family":
        raise HTTPException(status_code=400, detail=error_detail(REWARD_NOT_FAMILY_GOAL))
    if not reward.is_active or reward.achieved_at is not None:
        raise HTTPException(status_code=400, detail=error_detail(REWARD_INACTIVE))

    db.query(Membership).filter(
        Membership.user_id == user.id, Membership.family_id == payload.family_id,
    ).with_for_update().first()
    progress, _ = _goal_progress(db, reward)
    missing = reward.cost - progress
    if missing <= 0:
        raise HTTPException(status_code=400, detail=error_detail(REWARD_GOAL_FULL))
    amount = min(payload.amount, missing)
    if _compute_balance(db, payload.family_id, user.id, include_pending_redeems=True) < amount:
        raise HTTPException(status_code=400, detail=error_detail(INSUFFICIENT_BALANCE))

    db.add(TokenTransaction(
        family_id=payload.family_id, currency_id=reward.currency_id,
        user_id=user.id, kind="give", amount=amount, status="confirmed",
        note=reward.name, source_reward_id=reward.id,
        confirmed_by_user_id=user.id, confirmed_at=utcnow(),
    ))
    db.commit()
    _invalidate_balance(payload.family_id, user.id)
    db.refresh(reward)
    return _serialize_reward(db, reward)


@router.post("/goals/{reward_id}/achieve", response_model=RewardItemResponse)
def achieve_family_goal(
    reward_id: int,
    family_id: int = Query(...),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("rewards:write"),
):
    """Celebrate a family goal that has all its stars. Adult only."""
    ensure_adult(db, user.id, family_id)
    reward = _family_reward_or_404(db, reward_id, family_id)
    if reward.kind != "family":
        raise HTTPException(status_code=400, detail=error_detail(REWARD_NOT_FAMILY_GOAL))
    progress, _ = _goal_progress(db, reward)
    if progress < reward.cost:
        raise HTTPException(status_code=400, detail=error_detail(REWARD_GOAL_NOT_REACHED))
    if reward.achieved_at is None:
        reward.achieved_at = utcnow()
        reward.is_active = False
        db.commit()
        db.refresh(reward)
    return _serialize_reward(db, reward)


# ── Praise ────────────────────────────────────────────────────


@router.get("/praise", response_model=list[PraiseResponse])
def list_praise(
    family_id: int = Query(...),
    limit: int = Query(30, ge=1, le=100),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("rewards:read"),
):
    """The family's recent thank-yous, newest first. Everyone sees them."""
    ensure_family_membership(db, user.id, family_id)
    return (
        db.query(Praise)
        .filter(Praise.family_id == family_id)
        .order_by(Praise.created_at.desc(), Praise.id.desc())
        .limit(limit)
        .all()
    )


@router.post("/praise", response_model=PraiseResponse, status_code=201)
def create_praise(
    payload: PraiseCreate,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("rewards:write"),
):
    """Praise a family member. Everyone can say thank you; only adults can
    add stars to it."""
    ensure_family_membership(db, user.id, payload.family_id)
    if payload.to_user_id == user.id:
        raise HTTPException(status_code=400, detail=error_detail(PRAISE_SELF))
    target = db.query(Membership).filter(
        Membership.user_id == payload.to_user_id, Membership.family_id == payload.family_id,
    ).first()
    if not target:
        raise HTTPException(status_code=400, detail=error_detail(REWARD_TARGET_NOT_MEMBER))
    message = payload.message.strip()
    txn = None
    if payload.amount > 0:
        ensure_adult(db, user.id, payload.family_id)
        currency = _get_or_create_currency(db, payload.family_id)
        txn = TokenTransaction(
            family_id=payload.family_id, currency_id=currency.id,
            user_id=payload.to_user_id, kind="earn", amount=payload.amount,
            status="confirmed", note=message,
            confirmed_by_user_id=user.id, confirmed_at=utcnow(),
        )
        db.add(txn)
        db.flush()
    praise = Praise(
        family_id=payload.family_id, from_user_id=user.id, to_user_id=payload.to_user_id,
        message=message, amount=payload.amount, transaction_id=txn.id if txn else None,
    )
    db.add(praise)
    title = reminder_text(user_language(db, payload.to_user_id), "praise_from", name=_first_name(user))
    body = f"{message} · +{payload.amount} ★" if payload.amount else message
    _notify(db, payload.to_user_id, payload.family_id, "praise", title, body, "/rewards")
    db.commit()
    db.refresh(praise)
    if txn is not None:
        _invalidate_balance(payload.family_id, payload.to_user_id)
    return praise


@router.delete("/praise/{praise_id}")
def delete_praise(
    praise_id: int,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("rewards:write"),
):
    """Take back a praise, with its stars. The author or an adult."""
    praise = db.query(Praise).filter(Praise.id == praise_id).first()
    if not praise:
        raise HTTPException(status_code=404, detail=error_detail(PRAISE_NOT_FOUND))
    membership = ensure_family_membership(db, user.id, praise.family_id)
    if praise.from_user_id != user.id and not membership.is_adult:
        ensure_adult(db, user.id, praise.family_id)
    if praise.transaction_id:
        db.query(TokenTransaction).filter(TokenTransaction.id == praise.transaction_id).delete(synchronize_session=False)
        _invalidate_balance(praise.family_id, praise.to_user_id)
    db.delete(praise)
    db.commit()
    return {"status": "ok"}
