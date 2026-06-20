#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND_DIR="$ROOT_DIR/frontend"
BACKEND_PORT="${BACKEND_PORT:-8100}"
FRONTEND_PORT="${FRONTEND_PORT:-3100}"
BACKEND_URL="${BACKEND_URL:-http://localhost:${BACKEND_PORT}}"
BASE_URL="${BASE_URL:-http://localhost:${FRONTEND_PORT}}"

(
  cd "$FRONTEND_DIR"
  BACKEND_PORT="$BACKEND_PORT" \
    FRONTEND_PORT="$FRONTEND_PORT" \
    BACKEND_URL="$BACKEND_URL" \
    BASE_URL="$BASE_URL" \
    E2E_BACKEND_HEALTH_URL="$BACKEND_URL/health" \
    E2E_WEB_SERVER_COMMAND="../scripts/e2e-local-services.sh" \
    E2E_WEB_SERVER_URL="$BASE_URL" \
    npx playwright test "$@"
)
