#!/usr/bin/env bash
set -euo pipefail

# ---------------------------------------------------------------------------
# Tribu Restore Script
# Restores a Tribu instance from a backup archive created by backup.sh.
# ---------------------------------------------------------------------------

CONTAINER="tribu-postgres"
DB_NAME="tribu"
DB_USER="tribu"

# --- Locate docker-compose.yml ---------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INFRA_DIR="${SCRIPT_DIR}/../infra"

# --- Validate arguments -----------------------------------------------------
if [[ $# -lt 1 ]]; then
    echo "Usage: $0 <backup-archive.tar.gz>" >&2
    exit 1
fi

ARCHIVE="$1"
if [[ ! -f "${ARCHIVE}" ]]; then
    echo "ERROR: Archive not found: ${ARCHIVE}" >&2
    exit 1
fi

# --- Extract to temp directory ----------------------------------------------
TMPDIR=$(mktemp -d)

cleanup() {
    rm -rf "${TMPDIR}"
}
trap cleanup EXIT

echo "Extracting archive..."
tar -xzf "${ARCHIVE}" -C "${TMPDIR}"

# Find the backup directory inside (tribu-backup-*)
BACKUP_DIR=$(find "${TMPDIR}" -maxdepth 1 -type d -name 'tribu-backup-*' | head -1)
if [[ -z "${BACKUP_DIR}" ]]; then
    echo "ERROR: Archive does not contain a tribu-backup-* directory." >&2
    exit 1
fi

# --- Validate contents ------------------------------------------------------
if [[ ! -f "${BACKUP_DIR}/metadata.json" ]]; then
    echo "ERROR: metadata.json not found in archive." >&2
    exit 1
fi
if [[ ! -f "${BACKUP_DIR}/database.dump" ]]; then
    echo "ERROR: database.dump not found in archive." >&2
    exit 1
fi

# --- Read and display metadata ----------------------------------------------
META="${BACKUP_DIR}/metadata.json"
BACKUP_TS=$(python3 -c "import json,sys; print(json.load(sys.stdin)['timestamp'])" < "${META}")
ALEMBIC_REV=$(python3 -c "import json,sys; print(json.load(sys.stdin)['alembic_revision'])" < "${META}")
PG_VERSION=$(python3 -c "import json,sys; print(json.load(sys.stdin)['pg_version'])" < "${META}")

echo ""
echo "Backup info:"
echo "  Timestamp: ${BACKUP_TS}"
echo "  Alembic:   ${ALEMBIC_REV}"
echo "  PG:        ${PG_VERSION}"
echo ""

# --- Interactive confirmation -----------------------------------------------
read -rp "This will DROP and recreate the '${DB_NAME}' database. Continue? [y/N] " CONFIRM
if [[ "${CONFIRM}" != "y" && "${CONFIRM}" != "Y" ]]; then
    echo "Aborted."
    exit 0
fi

# --- Start Postgres only ----------------------------------------------------
echo "Starting PostgreSQL..."
docker compose -f "${INFRA_DIR}/docker-compose.yml" up -d postgres

echo "Waiting for PostgreSQL to be ready..."
for i in $(seq 1 30); do
    if docker exec "${CONTAINER}" pg_isready -U "${DB_USER}" -q 2>/dev/null; then
        break
    fi
    if [[ $i -eq 30 ]]; then
        echo "ERROR: PostgreSQL did not become ready in time." >&2
        exit 1
    fi
    sleep 1
done

# --- Drop and recreate database ---------------------------------------------
echo "Dropping and recreating database..."
docker exec "${CONTAINER}" psql -U "${DB_USER}" -d postgres -c \
    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${DB_NAME}' AND pid <> pg_backend_pid();" \
    > /dev/null 2>&1 || true

docker exec "${CONTAINER}" psql -U "${DB_USER}" -d postgres -c \
    "DROP DATABASE IF EXISTS ${DB_NAME};"

docker exec "${CONTAINER}" psql -U "${DB_USER}" -d postgres -c \
    "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};"

# --- Restore from dump ------------------------------------------------------
echo "Restoring database from dump..."
docker exec -i "${CONTAINER}" pg_restore -U "${DB_USER}" -d "${DB_NAME}" --no-owner --no-privileges \
    < "${BACKUP_DIR}/database.dump"

# --- Verify Alembic revision ------------------------------------------------
RESTORED_REV=$(docker exec "${CONTAINER}" psql -U "${DB_USER}" -d "${DB_NAME}" -t -A \
    -c "SELECT version_num FROM alembic_version LIMIT 1" 2>/dev/null || echo "unknown")

if [[ "${RESTORED_REV}" != "${ALEMBIC_REV}" ]]; then
    echo "WARNING: Alembic revision mismatch!" >&2
    echo "  Expected: ${ALEMBIC_REV}" >&2
    echo "  Got:      ${RESTORED_REV}" >&2
    echo "  The backend will attempt to run migrations on startup." >&2
else
    echo "  Alembic revision verified: ${RESTORED_REV}"
fi

# --- Start all services -----------------------------------------------------
echo "Starting all services..."
docker compose -f "${INFRA_DIR}/docker-compose.yml" up -d

echo ""
echo "Restore complete! Tribu should be available shortly."
