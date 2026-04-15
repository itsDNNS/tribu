import json
import os
import subprocess
import tarfile
import tempfile
from datetime import UTC, datetime

from app.core.utils import utcnow
from pathlib import Path
from urllib.parse import urlparse

import logging

logger = logging.getLogger(__name__)


def _parse_db_url(db_url: str) -> dict:
    parsed = urlparse(db_url)
    return {
        "host": parsed.hostname or "localhost",
        "port": str(parsed.port or 5432),
        "user": parsed.username or "tribu",
        "password": parsed.password or "",
        "dbname": parsed.path.lstrip("/") or "tribu",
    }


def _get_alembic_revision(db_params: dict) -> str:
    try:
        env = os.environ.copy()
        env["PGPASSWORD"] = db_params["password"]
        result = subprocess.run(
            [
                "psql", "-h", db_params["host"], "-p", db_params["port"],
                "-U", db_params["user"], "-d", db_params["dbname"],
                "-t", "-A", "-c", "SELECT version_num FROM alembic_version ORDER BY version_num DESC LIMIT 1",
            ],
            capture_output=True, text=True, timeout=10, env=env,
        )
        return result.stdout.strip() if result.returncode == 0 else "unknown"
    except Exception:
        return "unknown"


def _get_pg_version(db_params: dict) -> str:
    try:
        env = os.environ.copy()
        env["PGPASSWORD"] = db_params["password"]
        result = subprocess.run(
            [
                "psql", "-h", db_params["host"], "-p", db_params["port"],
                "-U", db_params["user"], "-d", db_params["dbname"],
                "-t", "-A", "-c", "SHOW server_version",
            ],
            capture_output=True, text=True, timeout=10, env=env,
        )
        return result.stdout.strip() if result.returncode == 0 else "unknown"
    except Exception:
        return "unknown"


def create_backup(db_url: str, backup_dir: str) -> str:
    db = _parse_db_url(db_url)
    timestamp = utcnow().strftime("%Y-%m-%d-%H%M%S")
    archive_name = f"tribu-backup-{timestamp}.tar.gz"
    archive_path = os.path.join(backup_dir, archive_name)

    with tempfile.TemporaryDirectory() as tmpdir:
        dump_path = os.path.join(tmpdir, "database.dump")

        env = os.environ.copy()
        env["PGPASSWORD"] = db["password"]
        result = subprocess.run(
            [
                "pg_dump", "-Fc",
                "-h", db["host"], "-p", db["port"],
                "-U", db["user"], "-d", db["dbname"],
                "-f", dump_path,
            ],
            capture_output=True, text=True, timeout=300, env=env,
        )
        if result.returncode != 0:
            raise RuntimeError(f"pg_dump failed: {result.stderr}")

        alembic_rev = _get_alembic_revision(db)
        pg_version = _get_pg_version(db)

        metadata = {
            "backup_version": 1,
            "alembic_revision": alembic_rev,
            "pg_version": pg_version,
            "created_at": utcnow().isoformat(),
        }
        meta_path = os.path.join(tmpdir, "metadata.json")
        with open(meta_path, "w") as f:
            json.dump(metadata, f, indent=2)

        with tarfile.open(archive_path, "w:gz") as tar:
            tar.add(dump_path, arcname="database.dump")
            tar.add(meta_path, arcname="metadata.json")

    logger.info("Backup created: %s", archive_name)
    return archive_name


def _read_metadata(archive_path: str) -> dict:
    try:
        with tarfile.open(archive_path, "r:gz") as tar:
            member = tar.getmember("metadata.json")
            f = tar.extractfile(member)
            if f:
                return json.load(f)
    except Exception:
        pass
    return {}


def list_backups(backup_dir: str) -> list[dict]:
    backups = []
    backup_path = Path(backup_dir)
    if not backup_path.exists():
        return backups

    for entry in backup_path.glob("tribu-backup-*.tar.gz"):
        meta = _read_metadata(str(entry))
        stat = entry.stat()
        backups.append({
            "filename": entry.name,
            "size_bytes": stat.st_size,
            "created_at": meta.get("created_at", datetime.fromtimestamp(stat.st_mtime, UTC).replace(tzinfo=None).isoformat()),
            "alembic_revision": meta.get("alembic_revision"),
            "pg_version": meta.get("pg_version"),
        })

    backups.sort(key=lambda b: b["created_at"], reverse=True)
    return backups


def _safe_filename(filename: str) -> bool:
    return (
        "/" not in filename
        and "\\" not in filename
        and ".." not in filename
        and filename.startswith("tribu-backup-")
        and filename.endswith(".tar.gz")
    )


def delete_backup(backup_dir: str, filename: str) -> bool:
    if not _safe_filename(filename):
        return False
    path = Path(backup_dir) / filename
    if path.exists() and path.is_file():
        path.unlink()
        logger.info("Backup deleted: %s", filename)
        return True
    return False


def enforce_retention(backup_dir: str, max_count: int) -> int:
    backups = list_backups(backup_dir)
    deleted = 0
    while len(backups) > max_count:
        oldest = backups.pop()
        if delete_backup(backup_dir, oldest["filename"]):
            deleted += 1
    return deleted


def get_backup_path(backup_dir: str, filename: str) -> str | None:
    if not _safe_filename(filename):
        return None
    path = Path(backup_dir) / filename
    if path.exists() and path.is_file():
        return str(path)
    return None


def validate_backup(archive_path: str) -> dict:
    meta = _read_metadata(archive_path)
    if not meta:
        raise ValueError("Invalid backup: missing or unreadable metadata.json")
    with tarfile.open(archive_path, "r:gz") as tar:
        names = tar.getnames()
        if "database.dump" not in names:
            raise ValueError("Invalid backup: missing database.dump")
    return meta


def restore_backup(archive_path: str, db_url: str) -> dict:
    meta = validate_backup(archive_path)
    db = _parse_db_url(db_url)

    with tempfile.TemporaryDirectory() as tmpdir:
        with tarfile.open(archive_path, "r:gz") as tar:
            tar.extractall(tmpdir, filter="data")
        dump_path = os.path.join(tmpdir, "database.dump")
        if not os.path.exists(dump_path):
            raise RuntimeError("database.dump not found in archive")

        env = os.environ.copy()
        env["PGPASSWORD"] = db["password"]
        pg_args = ["-h", db["host"], "-p", db["port"], "-U", db["user"]]

        subprocess.run(
            ["psql", *pg_args, "-d", "postgres", "-c",
             f"SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '{db['dbname']}' AND pid <> pg_backend_pid()"],
            capture_output=True, text=True, timeout=15, env=env,
        )

        subprocess.run(
            ["psql", *pg_args, "-d", "postgres", "-c",
             f"DROP DATABASE IF EXISTS {db['dbname']}"],
            capture_output=True, text=True, timeout=15, env=env, check=True,
        )
        subprocess.run(
            ["psql", *pg_args, "-d", "postgres", "-c",
             f"CREATE DATABASE {db['dbname']}"],
            capture_output=True, text=True, timeout=15, env=env, check=True,
        )

        result = subprocess.run(
            ["pg_restore", "-Fc", "--no-owner", "--no-privileges",
             *pg_args, "-d", db["dbname"], dump_path],
            capture_output=True, text=True, timeout=600, env=env,
        )
        if result.returncode not in (0, 1):
            raise RuntimeError(f"pg_restore failed: {result.stderr}")

        alembic_result = subprocess.run(
            ["alembic", "upgrade", "head"],
            capture_output=True, text=True, timeout=120, env=env,
            cwd="/app",
        )
        if alembic_result.returncode != 0:
            logger.warning("alembic upgrade after restore: %s", alembic_result.stderr)

    logger.info("Backup restored from: %s", archive_path)
    return meta
