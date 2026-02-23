# Contributing to Tribu

Thank you for your interest in contributing to Tribu! This guide covers everything you need to get started.

## Before You Start

Please open an issue before starting significant work. This prevents duplicate effort and lets us discuss the approach before you invest time. For small fixes (typos, obvious bugs), feel free to submit a PR directly.

## Development Setup

### Prerequisites

- Python 3.12+
- Node.js 20+
- Docker and Docker Compose (for full-stack development)

### Option A: Docker (recommended)

```bash
git clone https://github.com/itsDNNS/tribu.git
cd tribu/infra
cp .env.example .env
# Fill in JWT_SECRET and POSTGRES_PASSWORD (see .env.example for generation commands)
docker compose up --build
```

### Option B: Local Development

**Backend:**

```bash
cd backend
pip install -r requirements.txt

# Required environment variables
export DATABASE_URL="postgresql://tribu:password@localhost:5432/tribu"
export JWT_SECRET="$(openssl rand -hex 32)"

uvicorn app.main:app --reload --port 8000
```

**Frontend:**

```bash
cd frontend
npm install
npm run dev
```

The frontend runs on `localhost:3000` and expects the backend at `localhost:8000`.

### Environment Variables

All required variables are documented in [`infra/.env.example`](infra/.env.example). The backend will refuse to start without `DATABASE_URL` and `JWT_SECRET`.

## Project Structure

```
tribu/
├── backend/
│   └── app/
│       ├── main.py              # FastAPI app, auth routes, rate limiting, startup
│       ├── models.py            # SQLAlchemy models (User, Family, Membership, ...)
│       ├── schemas.py           # Pydantic request/response schemas
│       ├── security.py          # JWT creation, password hashing (PBKDF2-SHA256)
│       ├── database.py          # Engine, session factory
│       ├── core/
│       │   └── deps.py          # Shared dependencies (current_user, get_db, family checks)
│       └── modules/             # Feature modules (one router per feature)
│           ├── calendar_router.py
│           ├── birthdays_router.py
│           ├── contacts_router.py
│           ├── dashboard_router.py
│           └── families_router.py
├── frontend/
│   ├── pages/index.js           # App shell (sidebar, routing, views)
│   ├── lib/
│   │   ├── i18n.js              # i18n loader (core + module packs)
│   │   └── themes.js            # Theme engine (design token system)
│   ├── i18n/
│   │   ├── core/                # Core UI strings (de.json, en.json)
│   │   └── modules/             # Per-module translations
│   └── themes/                  # Theme token files + manifests
├── infra/
│   ├── docker-compose.yml       # Full stack definition
│   └── .env.example             # Required environment variables
└── docs/                        # Architecture, roadmap, changelog, plugin spec
```

## Adding a Module

Tribu uses a modular architecture where each feature is an isolated router.

1. Create `backend/app/modules/your_module_router.py` with a FastAPI `APIRouter`
2. Register the router in `main.py`: `app.include_router(your_router)`
3. Add models to `models.py` and schemas to `schemas.py`
4. Scope all queries to `family_id` (use `ensure_family_membership` from `core/deps.py`)
5. Create a plugin manifest (`plugin.manifest.json`) following the [Plugin Manifest Spec](docs/PLUGIN-MANIFEST.md)
6. Add frontend i18n strings in `frontend/i18n/modules/your_module/`

## i18n

Tribu supports German and English. Translations live in two places:

- **Core strings**: `frontend/i18n/core/{de,en}.json` (shared UI labels)
- **Module strings**: `frontend/i18n/modules/{module}/{de,en}.json` (feature-specific)

When adding or modifying user-facing text, update both language files. Module translations are lazy-loaded when the user navigates to that module.

## Pull Request Guidelines

- **Focused PRs**: One feature or fix per PR. Avoid mixing unrelated changes.
- **Tests**: Add or update tests for any changed behavior.
- **i18n**: All user-facing strings must have both DE and EN translations.
- **Security**: Never commit secrets, default passwords, or disable security checks. See [SECURITY.md](SECURITY.md).
- **Commits**: Write clear commit messages that explain the *why*, not just the *what*.

## External Communication

All communication on GitHub (issues, PRs, comments, release notes) is written in **English**. Avoid em-dashes and en-dashes in GitHub text.

## Questions?

Open an issue or start a discussion. We are happy to help!
