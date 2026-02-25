import os
import threading
import tempfile

from fastapi import APIRouter, HTTPException, Request, UploadFile, File, Depends
from sqlalchemy.orm import Session

from app.core.backup import restore_backup, validate_backup
from app.database import get_db, engine
from app.models import User
from app.schemas import SetupStatusResponse, RestoreResponse

router = APIRouter(prefix="/setup", tags=["setup"])

DATABASE_URL = os.getenv("DATABASE_URL", "")

_restore_lock = threading.Lock()


def _needs_setup(db: Session) -> bool:
    return db.query(User).count() == 0


@router.get("/status", response_model=SetupStatusResponse)
def setup_status(db: Session = Depends(get_db)):
    return SetupStatusResponse(needs_setup=_needs_setup(db))


@router.post("/restore", response_model=RestoreResponse)
def setup_restore(
    request: Request,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    if not _needs_setup(db):
        raise HTTPException(status_code=403, detail="Setup already completed")

    if not file.filename or not file.filename.endswith(".tar.gz"):
        raise HTTPException(status_code=400, detail="File must be a .tar.gz archive")

    if not _restore_lock.acquire(blocking=False):
        raise HTTPException(status_code=409, detail="Restore already in progress")

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
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Restore failed: {e}")
    finally:
        _restore_lock.release()
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
