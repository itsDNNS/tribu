#!/bin/bash
export PATH="/opt/homebrew/bin:/opt/homebrew/sbin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
export VIRTUAL_ENV="/Users/brauden/Documents/Claude/tribu/backend/.venv"
export PYTHONPATH="/Users/brauden/Documents/Claude/tribu/backend"
export PATH="$VIRTUAL_ENV/bin:$PATH"
cd /Users/brauden/Documents/Claude/tribu/backend
exec python3.12 -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
