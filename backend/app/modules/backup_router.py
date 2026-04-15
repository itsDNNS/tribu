import os

from app.core.utils import utcnow, ensure_any_admin, get_setting, set_setting

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.backup import create_backup, delete_backup, enforce_retention, get_backup_path, list_backups
from app.core.deps import current_user
from app.core.scopes import require_scope
from app.core.scheduler import configure_backup_schedule
from app.database import get_db
from app.models import User
from app.schemas import ADMIN_RESPONSES, NOT_FOUND_RESPONSE, BackupConfigResponse, BackupConfigUpdate, BackupEntry
from app.core.errors import error_detail, BACKUP_NOT_FOUND, BACKUP_FAILED

router = APIRouter(prefix="/admin/backup", tags=["backup"], responses={**ADMIN_RESPONSES})

BACKUP_DIR = os.getenv("BACKUP_DIR", "/backups")
DATABASE_URL = os.getenv("DATABASE_URL", "")


@router.get(
    "/config",
    response_model=BackupConfigResponse,
    summary="Get backup configuration",
    description="Return current backup schedule, retention policy, and last backup status. Admin role required.",
    response_description="Backup configuration",
)
def get_config(user: User = Depends(current_user), db: Session = Depends(get_db), _scope=require_scope("admin:read")):
    ensure_any_admin(db, user.id)
    schedule = get_setting(db, "backup_schedule", "off")
    retention = get_setting(db, "backup_retention", "7")
    last_backup = get_setting(db, "backup_last_timestamp", "")
    last_status = get_setting(db, "backup_last_status", "")
    return BackupConfigResponse(
        schedule=schedule,
        retention=int(retention),
        last_backup=last_backup if last_backup else None,
        last_backup_status=last_status if last_status else None,
    )


@router.put(
    "/config",
    response_model=BackupConfigResponse,
    summary="Update backup configuration",
    description="Set backup schedule and retention policy. Reconfigures the background scheduler. Admin role required.",
    response_description="Updated backup configuration",
)
def update_config(
    payload: BackupConfigUpdate,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    _scope=require_scope("admin:write"),
):
    ensure_any_admin(db, user.id)
    set_setting(db, "backup_schedule", payload.schedule.value)
    set_setting(db, "backup_retention", str(payload.retention))
    db.commit()

    configure_backup_schedule(payload.schedule.value, DATABASE_URL, BACKUP_DIR, payload.retention)

    return get_config(user, db)


@router.post(
    "/trigger",
    summary="Trigger a manual backup",
    description="Create a database backup immediately and enforce the retention policy. Admin role required.",
    response_description="Backup filename",
)
def trigger_backup(user: User = Depends(current_user), db: Session = Depends(get_db), _scope=require_scope("admin:write")):
    ensure_any_admin(db, user.id)
    try:
        filename = create_backup(DATABASE_URL, BACKUP_DIR)
        retention = int(get_setting(db, "backup_retention", "7"))
        enforce_retention(BACKUP_DIR, retention)
        set_setting(db, "backup_last_timestamp", utcnow().isoformat())
        set_setting(db, "backup_last_status", "success")
        db.commit()
        return {"status": "ok", "filename": filename}
    except Exception as e:
        set_setting(db, "backup_last_timestamp", utcnow().isoformat())
        set_setting(db, "backup_last_status", "failed")
        db.commit()
        raise HTTPException(status_code=500, detail=error_detail(BACKUP_FAILED, reason=str(e)))


@router.get(
    "/list",
    response_model=list[BackupEntry],
    summary="List all backups",
    description="Return metadata for all backup files on disk. Admin role required.",
    response_description="List of backup entries",
)
def list_all_backups(user: User = Depends(current_user), db: Session = Depends(get_db), _scope=require_scope("admin:read")):
    ensure_any_admin(db, user.id)
    entries = list_backups(BACKUP_DIR)
    return [BackupEntry(**e) for e in entries]


@router.get(
    "/{filename}/download",
    summary="Download a backup file",
    description="Download a specific backup archive (.tar.gz). Admin role required.",
    response_description="Backup file download",
    responses={**NOT_FOUND_RESPONSE},
)
def download_backup(filename: str, user: User = Depends(current_user), db: Session = Depends(get_db), _scope=require_scope("admin:read")):
    ensure_any_admin(db, user.id)
    path = get_backup_path(BACKUP_DIR, filename)
    if not path:
        raise HTTPException(status_code=404, detail=error_detail(BACKUP_NOT_FOUND))
    return FileResponse(path, media_type="application/gzip", filename=filename)


@router.delete(
    "/{filename}",
    summary="Delete a backup file",
    description="Permanently delete a specific backup file from disk. Admin role required.",
    response_description="Deletion confirmation",
    responses={**NOT_FOUND_RESPONSE},
)
def delete_single_backup(filename: str, user: User = Depends(current_user), db: Session = Depends(get_db), _scope=require_scope("admin:write")):
    ensure_any_admin(db, user.id)
    if not delete_backup(BACKUP_DIR, filename):
        raise HTTPException(status_code=404, detail=error_detail(BACKUP_NOT_FOUND))
    return {"status": "ok"}
