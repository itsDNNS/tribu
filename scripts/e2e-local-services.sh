#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"
BACKEND_PORT="${BACKEND_PORT:-8100}"
FRONTEND_PORT="${FRONTEND_PORT:-3100}"
BACKEND_URL="${BACKEND_URL:-http://localhost:${BACKEND_PORT}}"
BASE_URL="${BASE_URL:-http://localhost:${FRONTEND_PORT}}"
DATABASE_PATH="${TRIBU_E2E_DB:-$BACKEND_DIR/test-e2e.db}"
DATABASE_URL="${DATABASE_URL:-sqlite:///$DATABASE_PATH}"
DAV_STORAGE_FOLDER="${DAV_STORAGE_FOLDER:-$BACKEND_DIR/test-e2e-dav}"
JWT_SECRET="${JWT_SECRET:-local-e2e-secret-change-me-local-only}"
PYTHON_BIN="${PYTHON_BIN:-python3}"
VENV_DIR="$BACKEND_DIR/.venv"
BACKEND_PID=""
FRONTEND_PID=""

cleanup() {
  if [ -n "$FRONTEND_PID" ] && kill -0 "$FRONTEND_PID" 2>/dev/null; then
    kill "$FRONTEND_PID" 2>/dev/null || true
  fi
  if [ -n "$BACKEND_PID" ] && kill -0 "$BACKEND_PID" 2>/dev/null; then
    kill "$BACKEND_PID" 2>/dev/null || true
  fi
  if [ "${KEEP_E2E_ARTIFACTS:-false}" != "true" ]; then
    rm -rf "$DATABASE_PATH" "$DAV_STORAGE_FOLDER"
  fi
}
trap cleanup EXIT INT TERM

wait_for_url() {
  local url="$1"
  local label="$2"
  local attempts="${3:-60}"

  for _ in $(seq 1 "$attempts"); do
    if "$VENV_DIR/bin/python" - "$url" <<'PY' >/dev/null 2>&1
import sys
from urllib.request import urlopen

with urlopen(sys.argv[1], timeout=2) as response:
    if response.status < 500:
        raise SystemExit(0)
raise SystemExit(1)
PY
    then
      return 0
    fi
    sleep 1
  done

  echo "Timed out waiting for $label at $url" >&2
  return 1
}

if [ ! -x "$VENV_DIR/bin/python" ] || ! "$VENV_DIR/bin/python" -m pip --version >/dev/null 2>&1; then
  rm -rf "$VENV_DIR"
  if command -v uv >/dev/null 2>&1; then
    uv venv --seed "$VENV_DIR"
  else
    "$PYTHON_BIN" -m venv "$VENV_DIR"
  fi
fi

"$VENV_DIR/bin/python" -m pip install -q -r "$BACKEND_DIR/requirements.txt"

rm -f "$DATABASE_PATH"
DATABASE_URL="$DATABASE_URL" PYTHONPATH="$BACKEND_DIR" "$VENV_DIR/bin/python" <<'PY'
from app import models  # noqa: F401
from app.database import Base, engine

Base.metadata.create_all(bind=engine)
PY

(
  cd "$BACKEND_DIR"
  DATABASE_URL="$DATABASE_URL" \
    JWT_SECRET="$JWT_SECRET" \
    ALLOW_OPEN_REGISTRATION=true \
    SECURE_COOKIES=false \
    DAV_STORAGE_FOLDER="$DAV_STORAGE_FOLDER" \
    PYTHONPATH="$BACKEND_DIR" \
    "$VENV_DIR/bin/python" -m uvicorn app.main:app --host 127.0.0.1 --port "$BACKEND_PORT"
) &
BACKEND_PID="$!"

wait_for_url "$BACKEND_URL/health" "backend"

(
  cd "$FRONTEND_DIR"
  BACKEND_URL="$BACKEND_URL" NEXT_DIST_DIR=.next-e2e npx next dev -p "$FRONTEND_PORT"
) &
FRONTEND_PID="$!"

wait "$FRONTEND_PID"
