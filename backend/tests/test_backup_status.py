from app.core.backup import build_backup_status


def test_backup_status_describes_empty_postgres_install(tmp_path):
    status = build_backup_status(
        "postgresql://postgres.example.invalid/tribu",
        str(tmp_path),
        backups=[],
    )

    assert status["database_backend"] == "postgresql"
    assert status["backup_dir"] == "configured_backup_volume"
    assert status["latest_backup"] is None
    assert status["has_backups"] is False
    assert "calendar" in status["included_domains"]
    assert "jwt_secret" in status["excluded_domains"]
    assert status["restore_supported"] == "setup_wizard"
    assert status["restore_runbook"] == "self_hosting_backup_restore"


def test_backup_status_reports_latest_export_without_secrets(tmp_path):
    backups = [
        {
            "filename": "tribu-backup-2026-04-29-090000.tar.gz",
            "created_at": "2026-04-29T09:00:00",
            "size_bytes": 2048,
            "alembic_revision": "0039",
            "pg_version": "16.3",
        }
    ]

    status = build_backup_status(
        "postgresql://postgres.example.invalid/tribu",
        str(tmp_path),
        backups=backups,
    )

    assert status["has_backups"] is True
    assert status["latest_backup"] == {
        "filename": "tribu-backup-2026-04-29-090000.tar.gz",
        "created_at": "2026-04-29T09:00:00",
        "size_bytes": 2048,
    }
    assert "alembic_revision" not in status["latest_backup"]
    assert "pg_version" not in status["latest_backup"]
    assert "super-secret" not in repr(status)
    assert "postgresql://" not in repr(status)
