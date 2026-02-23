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
  <a href="CONTRIBUTING.md">Contributing</a>&nbsp;&nbsp;&bull;&nbsp;&nbsp;
  <a href="SECURITY.md">Security</a>&nbsp;&nbsp;&bull;&nbsp;&nbsp;
  <a href="docs/ROADMAP.md">Roadmap</a>&nbsp;&nbsp;&bull;&nbsp;&nbsp;
  <a href="docs/CHANGELOG.md">Changelog</a>
</p>

---

## What is Tribu?

Tribu is a self-hosted family hub that brings calendars, contacts, birthdays, and daily coordination into one place. Built with a modular plugin architecture, it grows with your family's needs while keeping your data on your own hardware.

## Features

| Module | Description |
|--------|-------------|
| **Auth & Families** | Register, login, httpOnly cookie sessions. Multi-family support with role-based access (admin, parent, child). |
| **Calendar** | Month grid with event dots, day-detail panel, week view, quick event creation. |
| **Birthdays** | Dedicated birthday tracker. Auto-syncs from contacts. 4-week lookahead with countdown. |
| **Contacts** | Family address book with CSV import, colored avatars, and automatic birthday extraction. |
| **Tasks** | Shared task list with priorities, due dates, assignees, recurring tasks, and overdue tracking. |
| **Dashboard** | Bento grid layout with welcome card, family stats, next events, open tasks, and birthday countdown. |
| **Themes** | Three polished themes: Morning Mist (light), Dunkel (dark), Midnight Glass (glassmorphism). CSS design system with custom properties. |
| **Demo Mode** | Try the full UI without registration. Pre-loaded with realistic sample data, fully interactive. |
| **i18n** | German and English out of the box. Module-level language packs, lazy-loaded. |
| **Security** | httpOnly cookies, rate limiting, PBKDF2-SHA256 passwords, non-root Docker containers, CORS restricted to localhost/LAN. |

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | **Next.js 14** (React 18), Lucide Icons, CSS custom properties |
| Backend | **FastAPI** (Python), SQLAlchemy |
| Database | **PostgreSQL 16** |
| Cache / Realtime | **Redis 7** (prepared) |
| Deployment | **Docker Compose** |

## Quick Start

```bash
git clone https://github.com/itsDNNS/tribu.git
cd tribu/infra
cp .env.example .env
```

Generate secrets and fill in `.env`:

```bash
# JWT secret (required)
openssl rand -hex 32

# PostgreSQL password (required)
openssl rand -hex 16
```

Then start the stack:

```bash
docker compose up --build
```

Once running:

| Service | URL |
|---------|-----|
| Frontend | [localhost:3000](http://localhost:3000) |
| Backend API | [localhost:8000](http://localhost:8000) |
| API Docs (Swagger) | [localhost:8000/docs](http://localhost:8000/docs) |

> The first user to register automatically becomes the family **admin**.
>
> Want to explore first? Click **Demo ausprobieren** on the login page to try the full UI with sample data.

## Architecture

```
tribu/
├── backend/
│   └── app/
│       ├── main.py              # FastAPI app, auth routes, startup
│       ├── models.py            # SQLAlchemy models (User, Family, Membership, ...)
│       ├── schemas.py           # Pydantic request/response schemas
│       ├── security.py          # JWT + password hashing (PBKDF2-SHA256)
│       ├── database.py          # Engine, session factory
│       ├── core/
│       │   └── deps.py          # Dependency injection (current_user, db)
│       └── modules/             # Feature modules (one router per feature)
│           ├── calendar_router.py
│           ├── birthdays_router.py
│           ├── contacts_router.py
│           ├── tasks_router.py
│           ├── dashboard_router.py
│           └── families_router.py
├── frontend/
│   ├── pages/
│   │   ├── _app.js              # AppProvider, global CSS import, mesh/grain overlays
│   │   └── index.js             # Root route (AuthPage or AppShell)
│   ├── components/              # View components
│   │   ├── AppShell.js          # Sidebar, mobile nav, view routing
│   │   ├── AuthPage.js          # Login, register, demo mode entry
│   │   ├── DashboardView.js     # Bento grid dashboard
│   │   ├── CalendarView.js      # Month/week calendar with day-detail panel
│   │   ├── TasksView.js         # Task list with filters and quick-add
│   │   ├── ContactsView.js      # Contact cards grid
│   │   └── SettingsView.js      # Theme picker, language, profile
│   ├── contexts/
│   │   └── AppContext.js        # Global state (auth, data, theme, demo mode)
│   ├── hooks/
│   │   ├── useCalendar.js       # Calendar UI state and event forms
│   │   └── useTasks.js          # Task filters, forms, and mutations
│   ├── lib/
│   │   ├── api.js               # Backend API client
│   │   ├── demo-data.js         # Mock data generator for demo mode
│   │   ├── i18n.js              # i18n loader (core + module packs)
│   │   ├── helpers.js           # Date formatting, error text utilities
│   │   └── themes.js            # Theme registry
│   ├── styles/
│   │   └── globals.css          # CSS design system (themes, glassmorphism, animations)
│   ├── i18n/                    # Language packs (core + per-module)
│   └── themes/                  # Theme token files (light, dark, midnight-glass)
├── infra/
│   ├── docker-compose.yml       # Full stack: PG, Redis, backend, frontend
│   └── .env.example             # Required environment variables template
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
| `POST` | `/auth/register` | Register user + create family (sets cookie) |
| `POST` | `/auth/login` | Login, sets httpOnly cookie |
| `POST` | `/auth/logout` | Logout, clears cookie |
| `GET` | `/auth/me` | Current user profile |
| `GET` | `/families/me` | User's families + memberships |
| `GET/POST` | `/calendar/events` | List / create calendar events |
| `GET` | `/birthdays` | List birthdays for family |
| `GET` | `/contacts` | List contacts |
| `POST` | `/contacts/import-csv` | Import contacts from CSV |
| `GET/POST` | `/tasks` | List / create tasks |
| `PATCH` | `/tasks/{id}` | Update task (including toggle done) |
| `DELETE` | `/tasks/{id}` | Delete task |
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

> When running locally, `DATABASE_URL` and `JWT_SECRET` must be set as environment variables. See [infra/.env.example](infra/.env.example) for details.

## Documentation

| Document | Description |
|----------|-------------|
| [CONTRIBUTING.md](CONTRIBUTING.md) | Development setup, project structure, PR guidelines |
| [SECURITY.md](SECURITY.md) | Security policy, features, and responsible disclosure |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Detailed architecture and design decisions |
| [docs/PLUGIN-MANIFEST.md](docs/PLUGIN-MANIFEST.md) | Plugin manifest specification v1 |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Development phases and planned features |
| [docs/CHANGELOG.md](docs/CHANGELOG.md) | Release history |

## License

Private project. All rights reserved.

---

<p align="center">
  Built with care by the <a href="https://github.com/itsDNNS">itsDNNS</a> family.
</p>
