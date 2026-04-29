from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.deps import current_user, ensure_adult
from app.core.scopes import require_scope
from app.core.webhooks import deliver_to_endpoint, endpoint_response
from app.database import get_db
from app.models import User, WebhookDelivery, WebhookEndpoint
from app.schemas import (
    AUTH_RESPONSES,
    NOT_FOUND_RESPONSE,
    WebhookDeliveryResponse,
    WebhookEndpointCreate,
    WebhookEndpointResponse,
    WebhookEndpointUpdate,
    WebhookTestResponse,
)

router = APIRouter(prefix="/webhooks", tags=["webhooks"], responses={**AUTH_RESPONSES})


def _get_endpoint_or_404(db: Session, endpoint_id: int) -> WebhookEndpoint:
    endpoint = db.query(WebhookEndpoint).filter(WebhookEndpoint.id == endpoint_id).first()
    if not endpoint:
        raise HTTPException(status_code=404, detail="Webhook endpoint not found")
    return endpoint


@router.get(
    "",
    response_model=list[WebhookEndpointResponse],
    summary="List webhook endpoints",
    description="Return configured outbound webhook endpoints for a family. Adult only. Scope: `admin:read`.",
)
def list_webhooks(
    family_id: int = Query(...),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("admin:read"),
):
    ensure_adult(db, user.id, family_id)
    endpoints = (
        db.query(WebhookEndpoint)
        .filter(WebhookEndpoint.family_id == family_id)
        .order_by(WebhookEndpoint.created_at.desc(), WebhookEndpoint.id.desc())
        .all()
    )
    return [endpoint_response(endpoint) for endpoint in endpoints]


@router.post(
    "",
    response_model=WebhookEndpointResponse,
    summary="Create webhook endpoint",
    description="Create an outbound webhook endpoint. Adult only. Scope: `admin:write`.",
)
def create_webhook(
    payload: WebhookEndpointCreate,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("admin:write"),
):
    ensure_adult(db, user.id, payload.family_id)
    endpoint = WebhookEndpoint(
        family_id=payload.family_id,
        name=payload.name.strip(),
        url=payload.url,
        events=payload.events,
        active=payload.active,
        secret_header_name=payload.secret_header_name,
        secret_header_value=payload.secret_header_value,
        created_by_user_id=user.id,
    )
    db.add(endpoint)
    db.commit()
    db.refresh(endpoint)
    return endpoint_response(endpoint)


@router.patch(
    "/{endpoint_id}",
    response_model=WebhookEndpointResponse,
    summary="Update webhook endpoint",
    description="Update an outbound webhook endpoint. Adult only. Scope: `admin:write`.",
    responses={**NOT_FOUND_RESPONSE},
)
def update_webhook(
    endpoint_id: int,
    payload: WebhookEndpointUpdate,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("admin:write"),
):
    endpoint = _get_endpoint_or_404(db, endpoint_id)
    ensure_adult(db, user.id, endpoint.family_id)
    updates = payload.model_dump(exclude_unset=True)
    if "name" in updates and payload.name is not None:
        endpoint.name = payload.name.strip()
    if "url" in updates and payload.url is not None:
        endpoint.url = payload.url
    if "events" in updates and payload.events is not None:
        endpoint.events = payload.events
    if "active" in updates and payload.active is not None:
        endpoint.active = payload.active
    if "secret_header_name" in updates:
        endpoint.secret_header_name = payload.secret_header_name
    if "secret_header_value" in updates:
        endpoint.secret_header_value = payload.secret_header_value
    db.commit()
    db.refresh(endpoint)
    return endpoint_response(endpoint)


@router.delete(
    "/{endpoint_id}",
    summary="Delete webhook endpoint",
    description="Delete an outbound webhook endpoint and its delivery history. Adult only. Scope: `admin:write`.",
    responses={**NOT_FOUND_RESPONSE},
)
def delete_webhook(
    endpoint_id: int,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("admin:write"),
):
    endpoint = _get_endpoint_or_404(db, endpoint_id)
    ensure_adult(db, user.id, endpoint.family_id)
    db.delete(endpoint)
    db.commit()
    return {"status": "deleted", "endpoint_id": endpoint_id}


@router.get(
    "/{endpoint_id}/deliveries",
    response_model=list[WebhookDeliveryResponse],
    summary="List webhook delivery status",
    description="Return recent redacted delivery attempts for an endpoint. Adult only. Scope: `admin:read`.",
    responses={**NOT_FOUND_RESPONSE},
)
def list_deliveries(
    endpoint_id: int,
    limit: int = Query(20, ge=1, le=100),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("admin:read"),
):
    endpoint = _get_endpoint_or_404(db, endpoint_id)
    ensure_adult(db, user.id, endpoint.family_id)
    deliveries = (
        db.query(WebhookDelivery)
        .filter(WebhookDelivery.endpoint_id == endpoint.id)
        .order_by(WebhookDelivery.created_at.desc(), WebhookDelivery.id.desc())
        .limit(limit)
        .all()
    )
    return deliveries


@router.post(
    "/{endpoint_id}/test",
    response_model=WebhookTestResponse,
    summary="Send test webhook",
    description="Send a redacted test payload to one endpoint. Adult only. Scope: `admin:write`.",
    responses={**NOT_FOUND_RESPONSE},
)
def test_webhook(
    endpoint_id: int,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("admin:write"),
):
    endpoint = _get_endpoint_or_404(db, endpoint_id)
    ensure_adult(db, user.id, endpoint.family_id)
    delivery = deliver_to_endpoint(
        db,
        endpoint,
        event_type="webhook.test",
        data={"message": "Tribu webhook test", "endpoint_id": endpoint.id},
    )
    return {"status": delivery.status, "delivery": delivery}
