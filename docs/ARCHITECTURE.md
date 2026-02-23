# Architecture

## Overview

Tribu is a self-hosted family organizer built as a modular monolith. The backend exposes a RESTful API consumed by a Next.js frontend. Everything runs in Docker Compose.

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│   Frontend   │────▶│   Backend    │────▶│  PostgreSQL   │
│   Next.js    │     │   FastAPI    │     │              │
└─────────────┘     └──────┬───────┘     └──────────────┘
                           │
                    ┌──────▼───────┐
                    │    Redis     │
                    │  (prepared)  │
                    └──────────────┘
```

## Core Principles

- **Modular by design**: Each feature (calendar, contacts, birthdays, ...) is an isolated module with its own router, models, and schemas. Changes to one module do not affect others.
- **Plugin manifests**: Every module, theme, and language pack declares itself through a `plugin.manifest.json`, enabling future dynamic registration and a plugin marketplace.
- **Family isolation**: All data is scoped to a family. Users can belong to multiple families. Role-based access controls who can read and write.
- **Self-hosted first**: No external dependencies, no cloud services. Everything runs on your hardware.

## Backend

**Framework**: FastAPI with SQLAlchemy ORM

### Module Structure

```
backend/app/
├── main.py              # App factory, auth routes, rate limiting, module registration
├── models.py            # SQLAlchemy models
├── schemas.py           # Pydantic schemas (with input validation)
├── security.py          # JWT creation, password hashing (PBKDF2-SHA256)
├── database.py          # Engine, session factory (requires DATABASE_URL)
├── core/
│   └── deps.py          # Shared dependencies (current_user, get_db, family checks)
└── modules/
    ├── calendar_router.py
    ├── birthdays_router.py
    ├── contacts_router.py
    ├── tasks_router.py
    ├── dashboard_router.py
    └── families_router.py
```

### Domain Model

```
User ──┬── Membership ──── Family
       │       │
       │       ├── role: admin | parent | child
       │       └── is_adult: bool
       │
       ├── CalendarEvent (scoped to family)
       ├── Birthday (scoped to family)
       ├── Contact (scoped to family)
       └── Task (scoped to family, optional assignee, recurring)
```

- First user to register becomes **admin** and **is_adult** automatically
- Calendar events, birthdays, and contacts are always scoped to exactly one family

### Security

| Concern | Implementation |
|---------|---------------|
| Password storage | PBKDF2-SHA256 (min 8 characters) |
| Auth | httpOnly cookie (JWT HS256), Bearer fallback for API testing |
| Rate limiting | 10/min register, 20/min login (slowapi) |
| Authorization | Role check per family membership |
| Data isolation | All queries filtered by family_id |
| CORS | Restricted to localhost and LAN IPs (regex pattern) |
| Environment | `DATABASE_URL` and `JWT_SECRET` required, no fallback defaults |
| CSV import | 500 row limit, month/day range checks, email format validation |

### Environment Variables

The backend requires the following environment variables and will not start without them:

- `DATABASE_URL`: PostgreSQL connection string
- `JWT_SECRET`: Secret key for JWT signing

Optional:
- `JWT_EXPIRE_HOURS`: Token expiration (default: 24)
- `REDIS_URL`: Redis connection string (prepared for future use)

## Frontend

**Framework**: Next.js 14, React 18

### Key Components

| Component | Description |
|-----------|-------------|
| App Shell | Sidebar navigation with Lucide icons, responsive layout |
| Theme Engine | Design token system with runtime theme switching |
| i18n | Core + module-level language packs, lazy-loaded on module activation |
| Calendar View | Month grid with clickable days, dynamic detail panels, event forms |
| Dashboard | Welcome screen with upcoming events and birthdays summary |
| Cookie Auth | Auto-login on mount via `/auth/me`, logout clears httpOnly cookie |

### Theme System

Themes are JSON files containing design tokens:

```json
{
  "bg": "#090c18",
  "surface": "#12182b",
  "text": "#e8edff",
  "primary": "#7c3aed",
  "sidebar": "#0f1426"
}
```

Available themes: **Light**, **Dark**, **Midnight Glass**

### i18n

```
frontend/i18n/
├── core/
│   ├── de.json          # German core strings
│   └── en.json          # English core strings
└── modules/
    ├── calendar/
    │   ├── de.json
    │   └── en.json
    └── ...
```

Module translations are loaded on demand when the user navigates to a module.

## Deployment

Docker Compose stack (`infra/docker-compose.yml`):

| Service | Image | Exposed Port |
|---------|-------|--------------|
| `postgres` | postgres:16-alpine | Internal only |
| `redis` | redis:7-alpine | Internal only |
| `backend` | Custom (FastAPI, non-root) | 8000 |
| `frontend` | Custom (Next.js, multi-stage build, non-root) | 3000 |

PostgreSQL and Redis are only accessible within the Docker network. Persistent data is stored in the `tribu_pg_data` Docker volume.

A `.env` file in `infra/` is required before starting. See [`infra/.env.example`](../infra/.env.example) for the template.

## API Structure

```
/auth/register          POST    Create user + family (sets httpOnly cookie)
/auth/login             POST    Authenticate, sets httpOnly cookie
/auth/logout            POST    Clear auth cookie
/auth/me                GET     Current user profile
/auth/me/profile-image  PATCH   Update profile image

/families/me            GET     User's families
/families/{id}/members  GET     Family members
/families/{id}/members/{uid}/role   PATCH  Update member role (admin only)
/families/{id}/members/{uid}/adult  PATCH  Update adult status (admin only)

/calendar/events        GET     List events
/calendar/events        POST    Create event
/calendar/events/{id}   PATCH   Update event
/calendar/events/{id}   DELETE  Delete event

/birthdays              GET     List birthdays
/birthdays              POST    Create birthday

/contacts               GET     List contacts
/contacts               POST    Create contact
/contacts/import-csv    POST    Import from CSV (max 500 rows)

/tasks                  GET     List tasks (filter by family_id, status)
/tasks                  POST    Create task
/tasks/{id}             PATCH   Update task (toggle done triggers recurring)
/tasks/{id}             DELETE  Delete task

/dashboard/summary      GET     Upcoming events + birthdays
```
