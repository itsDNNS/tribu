#!/usr/bin/env bash
set -euo pipefail

# ---------------------------------------------------------------------------
# Tribu Backup Script
# Creates a full backup archive of the Tribu PostgreSQL database.
# ---------------------------------------------------------------------------

CONTAINER="tribu-postgres"
DB_NAME="tribu"
DB_USER="tribu"
TIMESTAMP=$(date +%Y-%m-%d-%H%M%S)
BACKUP_DIR="tribu-backup-${TIMESTAMP}"

# --- Locate docker-compose.yml (needed for docker compose context) ---------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INFRA_DIR="${SCRIPT_DIR}/../infra"

# --- Parse arguments --------------------------------------------------------
OUTPUT_DIR="."
while [[ $# -gt 0 ]]; do
    case "$1" in
        --output-dir|-o)
            OUTPUT_DIR="$2"
            shift 2
            ;;
        -h|--help)
            echo "Usage: $0 [--output-dir <path>]"
            echo "  -o, --output-dir  Directory to write the backup archive to (default: .)"
            exit 0
            ;;
        *)
            echo "Unknown option: $1" >&2
            echo "Usage: $0 [--output-dir <path>]" >&2
            exit 1
            ;;
    esac
done

if [[ ! -d "${OUTPUT_DIR}" ]]; then
    echo "ERROR: Output directory does not exist: ${OUTPUT_DIR}" >&2
    exit 1
fi

ARCHIVE="${OUTPUT_DIR}/tribu-backup-${TIMESTAMP}.tar.gz"

# --- Preflight check -------------------------------------------------------
if ! docker inspect "${CONTAINER}" --format '{{.State.Running}}' 2>/dev/null | grep -q true; then
    echo "ERROR: Container '${CONTAINER}' is not running." >&2
    echo "Start it first:  cd ${INFRA_DIR} && docker compose up -d postgres" >&2
    exit 1
fi

# --- Create temp directory --------------------------------------------------
TMPDIR=$(mktemp -d)
WORK="${TMPDIR}/${BACKUP_DIR}"
mkdir -p "${WORK}"

cleanup() {
    rm -rf "${TMPDIR}"
}
trap cleanup EXIT

echo "Creating Tribu backup..."

# --- Database dump (custom format) ------------------------------------------
echo "  Dumping database..."
docker exec "${CONTAINER}" pg_dump -Fc -U "${DB_USER}" "${DB_NAME}" > "${WORK}/database.dump"

# --- Read Alembic revision --------------------------------------------------
ALEMBIC_REV=$(docker exec "${CONTAINER}" psql -U "${DB_USER}" -d "${DB_NAME}" -t -A \
    -c "SELECT version_num FROM alembic_version LIMIT 1" 2>/dev/null || echo "unknown")

# --- Read PostgreSQL version ------------------------------------------------
PG_VERSION=$(docker exec "${CONTAINER}" psql -U "${DB_USER}" -d "${DB_NAME}" -t -A \
    -c "SHOW server_version" 2>/dev/null || echo "unknown")

# --- Write metadata ---------------------------------------------------------
cat > "${WORK}/metadata.json" <<EOF
{
  "backup_version": 1,
  "alembic_revision": "${ALEMBIC_REV}",
  "pg_version": "${PG_VERSION}",
  "timestamp": "$(date -Iseconds)",
  "tribu_db": "${DB_NAME}"
}
EOF

# --- Create archive ---------------------------------------------------------
echo "  Packing archive..."
tar -czf "${ARCHIVE}" -C "${TMPDIR}" "${BACKUP_DIR}"

# --- Summary ----------------------------------------------------------------
SIZE=$(du -h "${ARCHIVE}" | cut -f1)
echo ""
echo "Backup complete!"
echo "  Archive: ${ARCHIVE}"
echo "  Size:    ${SIZE}"
echo "  Alembic: ${ALEMBIC_REV}"
echo "  PG:      ${PG_VERSION}"
