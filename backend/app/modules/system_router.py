from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core import process_health
from app.core.deps import current_user
from app.core.scopes import require_scope
from app.core.utils import ensure_instance_admin
from app.database import get_db
from app.models import User
from app.schemas import ADMIN_RESPONSES, SystemStatusResponse

router = APIRouter(prefix="/admin/system", tags=["admin-settings"], responses={**ADMIN_RESPONSES})


@router.get(
    "/status",
    response_model=SystemStatusResponse,
    summary="Get backend health",
    description=(
        "Return the running version, memory use and processes that stopped without "
        "shutting down, for example after exceeding the memory limit. Instance admin only."
    ),
    response_description="Backend health",
)
def get_system_status(user: User = Depends(current_user), db: Session = Depends(get_db), _scope=require_scope("admin:read")):
    ensure_instance_admin(db, user.id)
    return SystemStatusResponse(**process_health.build_status(db, process_health.current_run_id()))
