from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import case, func
from sqlalchemy.orm import Session

from app.core import cache
from app.core.deps import current_user, ensure_adult, ensure_family_membership
from app.core.scopes import require_scope
from app.core.utils import utcnow
from app.database import get_db
from app.models import (
    EarningRule, Membership, Reward, RewardCurrency, TokenTransaction, User,
)
from app.schemas import (
    BalancesResponse, EarningRuleCreate, EarningRuleResponse, EarningRuleUpdate,
    ManualEarnRequest, MemberBalance, PaginatedTransactions,
    RedeemRequest, RewardCurrencyCreate, RewardCurrencyResponse, RewardCurrencyUpdate,
    RewardItemCreate, RewardItemResponse, RewardItemUpdate,
    TokenTransactionResponse,
)
from app.schemas import AUTH_RESPONSES, NOT_FOUND_RESPONSE
from app.core.errors import (
    error_detail,
    REWARD_CURRENCY_NOT_FOUND, REWARD_CURRENCY_ALREADY_EXISTS,
    EARNING_RULE_NOT_FOUND, REWARD_NOT_FOUND,
    REWARD_TRANSACTION_NOT_FOUND, REWARD_TRANSACTION_NOT_PENDING,
    REWARD_TARGET_NOT_MEMBER, INSUFFICIENT_BALANCE, REWARD_INACTIVE,
)

router = APIRouter(prefix="/rewards", tags=["Rewards"], responses={**AUTH_RESPONSES})


def _get_currency_or_404(db: Session, family_id: int) -> RewardCurrency:
    currency = db.query(RewardCurrency).filter(RewardCurrency.family_id == family_id).first()
    if not currency:
        raise HTTPException(status_code=404, detail=error_detail(REWARD_CURRENCY_NOT_FOUND))
    return currency


def _compute_balance(db: Session, family_id: int, user_id: int, include_pending_redeems: bool = False) -> int:
    """Compute token balance. If include_pending_redeems=True, also subtract pending redemptions."""
    statuses = ["confirmed"]
    if include_pending_redeems:
        # Include pending redeems so they count against available balance
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
    return _get_currency_or_404(db, family_id)


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
    return db.query(Reward).filter(Reward.family_id == family_id).order_by(Reward.cost).all()


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
        name=payload.name, cost=payload.cost, icon=payload.icon,
    )
    db.add(reward)
    db.commit()
    db.refresh(reward)
    return reward


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
    return reward


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
    # Verify target is a family member
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

    txn = TokenTransaction(
        family_id=payload.family_id, currency_id=reward.currency_id,
        user_id=user.id, kind="redeem", amount=reward.cost,
        status="pending", note=payload.note,
        source_reward_id=reward.id,
    )
    db.add(txn)
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
    db.commit()
    db.refresh(txn)
    _invalidate_balance(txn.family_id, txn.user_id)
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
    currency = _get_currency_or_404(db, family_id)

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
        ))

    return BalancesResponse(
        family_id=family_id, currency_id=currency.id,
        currency_name=currency.name, currency_icon=currency.icon,
        balances=balances,
    )
