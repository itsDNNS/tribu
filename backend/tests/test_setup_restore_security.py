from io import BytesIO

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from app.database import Base, get_db
from app.main import app

engine = create_engine(
    "sqlite:///./test-setup-restore.db",
    connect_args={"check_same_thread": False},
)
TestSession = sessionmaker(bind=engine)


@event.listens_for(engine, "connect")
def _set_sqlite_pragma(dbapi_conn, _):
    cursor = dbapi_conn.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


def setup_function():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)

    def _override():
        db = TestSession()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _override


def teardown_function():
    app.dependency_overrides.pop(get_db, None)
    Base.metadata.drop_all(bind=engine)


client = TestClient(app)


def _restore(headers=None, content=b"not-a-backup"):
    return client.post(
        "/setup/restore",
        headers=headers or {},
        files={"file": ("backup.tar.gz", BytesIO(content), "application/gzip")},
    )


def test_setup_restore_requires_configured_bootstrap_token(monkeypatch):
    monkeypatch.delenv("SETUP_RESTORE_TOKEN", raising=False)
    resp = _restore()
    assert resp.status_code == 403
    assert "SETUP_RESTORE_TOKEN_REQUIRED" in str(resp.json())


def test_setup_restore_rejects_wrong_bootstrap_token(monkeypatch):
    monkeypatch.setenv("SETUP_RESTORE_TOKEN", "expected-token")
    resp = _restore(headers={"X-Setup-Restore-Token": "wrong-token"})
    assert resp.status_code == 403
    assert "SETUP_RESTORE_TOKEN_INVALID" in str(resp.json())


def test_setup_restore_accepts_valid_token_before_backup_validation(monkeypatch):
    monkeypatch.setenv("SETUP_RESTORE_TOKEN", "expected-token")
    resp = _restore(headers={"X-Setup-Restore-Token": "expected-token"})
    assert resp.status_code == 400
    assert "RESTORE_FAILED" in str(resp.json())


def test_setup_restore_enforces_upload_size_limit(monkeypatch):
    monkeypatch.setenv("SETUP_RESTORE_TOKEN", "expected-token")
    monkeypatch.setenv("SETUP_RESTORE_MAX_BYTES", "4")
    resp = _restore(headers={"X-Setup-Restore-Token": "expected-token"}, content=b"12345")
    assert resp.status_code == 413
    assert "SETUP_RESTORE_UPLOAD_TOO_LARGE" in str(resp.json())
