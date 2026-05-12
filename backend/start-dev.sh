#!/bin/sh
set -eu

cd "$(dirname "$0")"

export PYTHONPATH="${PYTHONPATH:-$(pwd)}"

exec "${PYTHON:-python3}" -m uvicorn app.main:app \
  --host "${HOST:-0.0.0.0}" \
  --port "${PORT:-8000}" \
  --reload
