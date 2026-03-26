# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Run

```bash
# Full stack (Docker)
cd docker && docker compose up -d
# Requires: JWT_SECRET, POSTGRES_PASSWORD in .env

# Backend only (local dev)
cd backend
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# Frontend only (local dev)
cd frontend
npm install
npm run dev    # Port 3000, proxies /api/* to backend
```

Frontend proxy target configurable via `BACKEND_URL` env var (default: `http://backend:8000`).

## Testing

```bash
# Backend (pytest)
cd backend && pytest

# Frontend unit tests (Jest + React Testing Library)
cd frontend && npm test

# Frontend E2E (Playwright — Desktop Chrome + Mobile Chrome)
cd frontend
npm run e2e              # Headless
npm run e2e:headed       # With browser
npm run e2e:ui           # Interactive Playwright UI
```

E2E global setup auto-creates test user (`setup@example.com`) if DB is empty.

## Database Migrations

```bash
cd backend
alembic upgrade head                              # Apply all
alembic revision --autogenerate -m "description"  # New migration
```

15 migrations in `backend/alembic/versions/`. PostgreSQL 16.

## Architecture

**Next.js 16 (React 19) frontend + FastAPI backend + PostgreSQL + Valkey (Redis)**

Self-hosted family organizer: calendars, tasks, shopping lists, contacts, birthdays.

### Backend (`backend/app/`)
- **main.py**: FastAPI setup, auth endpoints, router registration
- **models.py**: SQLAlchemy ORM (users, families, memberships, events, tasks, shopping, contacts, etc.)
- **schemas.py**: Pydantic request/response models
- **security.py**: JWT + bcrypt auth
- **core/**: deps (DI), cache (Redis/Valkey), scheduler (background jobs), recurrence, ics/vcf utils, WebSocket manager, backup, scopes (PAT permissions)
- **modules/**: Feature routers — calendar, tasks, shopping (+ WebSocket for real-time), contacts, birthdays, notifications, families, backup, tokens, invitations

### Frontend (`frontend/`)
- **pages/**: Next.js pages
- **components/**: React components (admin, calendar, settings)
- **hooks/**: 50+ custom hooks for state/API logic
- **lib/**: API client (fetch wrapper), demo data, i18n, helpers
- **contexts/**: React Context state management
- **i18n/**: German + English translations (core + per-module)
- **themes/**: light, dark, midnight-glass (JSON configs)

### Backup/Restore
Scripts in `scripts/`: `backup.sh` (pg_dump + metadata), `restore.sh` (pg_restore + revision check).

## Key Environment Variables

Required: `JWT_SECRET`, `POSTGRES_PASSWORD`
Optional: `SECURE_COOKIES`, `BASE_URL`, `VAPID_*` (push notifications), `JWT_EXPIRE_HOURS`

## No linting configured
