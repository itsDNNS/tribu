import os
import threading
import tempfile

from fastapi import APIRouter, HTTPException, Request, UploadFile, File, Depends
from sqlalchemy.orm import Session

from app.core.backup import restore_backup, validate_backup
from app.database import get_db, engine
from app.models import User
from app.schemas import CONFLICT_RESPONSE, ErrorResponse, SetupStatusResponse, RestoreResponse
from app.core.errors import error_detail, SETUP_ALREADY_COMPLETED, INVALID_FILE_FORMAT, RESTORE_IN_PROGRESS, RESTORE_FAILED

router = APIRouter(prefix="/setup", tags=["setup"])

DATABASE_URL = os.getenv("DATABASE_URL", "")

_restore_lock = threading.Lock()


def _needs_setup(db: Session) -> bool:
    return db.query(User).count() == 0


@router.get(
    "/status",
    response_model=SetupStatusResponse,
    summary="Check setup status",
    description="Check whether the instance requires initial setup (no users exist yet). No authentication required.",
    response_description="Setup status flag",
)
def setup_status(db: Session = Depends(get_db)):
    return SetupStatusResponse(needs_setup=_needs_setup(db))


@router.post(
    "/restore",
    response_model=RestoreResponse,
    summary="Restore from backup",
    description="Upload a .tar.gz backup archive and restore the database. Only available during initial setup (no users). No authentication required.",
    response_description="Restore result with backup metadata",
    responses={**CONFLICT_RESPONSE},
)
def setup_restore(
    request: Request,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    if not _needs_setup(db):
        raise HTTPException(status_code=403, detail=error_detail(SETUP_ALREADY_COMPLETED))

    if not file.filename or not file.filename.endswith(".tar.gz"):
        raise HTTPException(status_code=400, detail=error_detail(INVALID_FILE_FORMAT))

    if not _restore_lock.acquire(blocking=False):
        raise HTTPException(status_code=409, detail=error_detail(RESTORE_IN_PROGRESS))

    try:
        with tempfile.NamedTemporaryFile(suffix=".tar.gz", delete=False) as tmp:
            tmp_path = tmp.name
            while chunk := file.file.read(1024 * 1024):
                tmp.write(chunk)

        meta = validate_backup(tmp_path)
        restore_backup(tmp_path, DATABASE_URL)

        engine.dispose()

        return RestoreResponse(
            status="ok",
            alembic_revision=meta.get("alembic_revision"),
            pg_version=meta.get("pg_version"),
            created_at=meta.get("created_at"),
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=error_detail(RESTORE_FAILED, reason=str(e)))
    except Exception as e:
        raise HTTPException(status_code=500, detail=error_detail(RESTORE_FAILED, reason=str(e)))
    finally:
        _restore_lock.release()
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
