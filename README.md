<p align="center">
  <img src="docs/assets/logo-placeholder.svg" alt="Tribu" width="80" />
</p>

<h1 align="center">Tribu</h1>

<p align="center">
  <strong>Self-hosted family organizer to tame the everyday chaos.</strong>
</p>

<p align="center">
  <a href="#features">Features</a>&nbsp;&nbsp;&bull;&nbsp;&nbsp;
  <a href="#quick-start">Quick Start</a>&nbsp;&nbsp;&bull;&nbsp;&nbsp;
  <a href="#architecture">Architecture</a>&nbsp;&nbsp;&bull;&nbsp;&nbsp;
  <a href="#plugin-system">Plugins</a>&nbsp;&nbsp;&bull;&nbsp;&nbsp;
  <a href="docs/ROADMAP.md">Roadmap</a>&nbsp;&nbsp;&bull;&nbsp;&nbsp;
  <a href="docs/CHANGELOG.md">Changelog</a>
</p>

---

## What is Tribu?

Tribu is a self-hosted family hub that brings calendars, contacts, birthdays, and daily coordination into one place. Built with a modular plugin architecture, it grows with your family's needs while keeping your data on your own hardware.

## Features

| Module | Description |
|--------|-------------|
| **Auth & Families** | Register, login, JWT sessions. Multi-family support with role-based access (admin, parent, child). |
| **Calendar** | Monthly calendar with clickable days, event CRUD, and dynamic day-detail panels. |
| **Birthdays** | Dedicated birthday tracker. Auto-syncs from contacts. |
| **Contacts** | Family address book with CSV import and automatic birthday extraction. |
| **Dashboard** | At-a-glance summary: upcoming events and birthdays within the next 4 weeks. |
| **Themes** | Switchable design tokens: Light, Dark, and Midnight Glass. Themeable via plugin manifests. |
| **i18n** | German and English out of the box. Module-level language packs, lazy-loaded. |

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | **Next.js 14** (React 18), Lucide Icons |
| Backend | **FastAPI** (Python), SQLAlchemy |
| Database | **PostgreSQL 16** |
| Cache / Realtime | **Redis 7** (prepared) |
| Deployment | **Docker Compose** |

## Quick Start

```bash
git clone https://github.com/itsDNNS/tribu.git
cd tribu/infra
docker compose up --build
```

Once running:

| Service | URL |
|---------|-----|
| Frontend | [localhost:3000](http://localhost:3000) |
| Backend API | [localhost:8000](http://localhost:8000) |
| API Docs (Swagger) | [localhost:8000/docs](http://localhost:8000/docs) |

> The first user to register automatically becomes the family **admin**.

## Architecture

```
tribu/
├── backend/
│   └── app/
│       ├── main.py              # FastAPI app, auth routes, startup
│       ├── models.py            # SQLAlchemy models (User, Family, Membership, ...)
│       ├── schemas.py           # Pydantic request/response schemas
│       ├── security.py          # JWT + password hashing
│       ├── core/
│       │   └── deps.py          # Dependency injection (current_user, db)
│       └── modules/             # Feature modules (one router per feature)
│           ├── calendar_router.py
│           ├── birthdays_router.py
│           ├── contacts_router.py
│           ├── dashboard_router.py
│           └── families_router.py
├── frontend/
│   ├── pages/index.js           # App shell with sidebar navigation
│   ├── lib/
│   │   ├── i18n.js              # i18n loader (core + module packs)
│   │   └── themes.js            # Theme engine (design token system)
│   ├── i18n/                    # Language packs (core + per-module)
│   └── themes/                  # Theme token files + manifests
├── infra/
│   └── docker-compose.yml       # Full stack: PG, Redis, backend, frontend
└── docs/
    ├── ARCHITECTURE.md          # Detailed architecture documentation
    ├── PLUGIN-MANIFEST.md       # Plugin manifest specification v1
    ├── ROADMAP.md               # Development phases
    └── CHANGELOG.md             # Release history
```

Each backend feature is an isolated module with its own router, keeping concerns separated and the codebase easy to extend.

For a deeper dive, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Plugin System

Tribu uses a plugin manifest system for features, themes, and language packs. Each plugin declares its entry points, permissions, and menu placement in a `plugin.manifest.json`.

```jsonc
{
  "id": "tribu.calendar",
  "type": "feature",           // feature | theme | language-pack
  "name": "Calendar",
  "version": "1.0.0",
  "entrypoints": {
    "backend_router": "backend/app/modules/calendar_router.py",
    "frontend_view": "frontend/modules/calendar/view.js",
    "i18n": ["frontend/i18n/modules/calendar/de.json",
             "frontend/i18n/modules/calendar/en.json"]
  },
  "permissions": ["family:read", "family:write"]
}
```

Full spec: [docs/PLUGIN-MANIFEST.md](docs/PLUGIN-MANIFEST.md)

## API Overview

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/auth/register` | Register user + create family |
| `POST` | `/auth/login` | Login, returns JWT |
| `GET` | `/auth/me` | Current user profile |
| `GET` | `/families/me` | User's families + memberships |
| `GET/POST` | `/calendar/events` | List / create calendar events |
| `GET` | `/birthdays` | List birthdays for family |
| `GET` | `/contacts` | List contacts |
| `POST` | `/contacts/import/csv` | Import contacts from CSV |
| `GET` | `/dashboard/summary` | Upcoming events + birthdays (4 weeks) |

Interactive API docs available at `/docs` when running.

## Development

```bash
# Backend (local, without Docker)
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# Frontend (local, without Docker)
cd frontend
npm install
npm run dev
```

## License

Private project. All rights reserved.

---

<p align="center">
  Built with care by the <a href="https://github.com/itsDNNS">itsDNNS</a> family.
</p>
