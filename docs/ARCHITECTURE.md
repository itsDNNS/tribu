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
├── main.py              # App factory, auth routes, module registration
├── models.py            # SQLAlchemy models
├── schemas.py           # Pydantic schemas
├── security.py          # JWT creation, password hashing (PBKDF2-SHA256)
├── database.py          # Engine, session factory
├── core/
│   └── deps.py          # Shared dependencies (current_user, get_db)
└── modules/
    ├── calendar_router.py
    ├── birthdays_router.py
    ├── contacts_router.py
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
       └── Contact (scoped to family)
```

- First user to register becomes **admin** and **is_adult** automatically
- Calendar events, birthdays, and contacts are always scoped to exactly one family

### Security

| Concern | Implementation |
|---------|---------------|
| Password storage | PBKDF2-SHA256 |
| Session tokens | JWT (HS256) |
| Authorization | Role check per family membership |
| Data isolation | All queries filtered by family_id |
| CORS | Restricted to localhost and LAN IPs |

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

| Service | Image | Port |
|---------|-------|------|
| `postgres` | postgres:16-alpine | 5433 |
| `redis` | redis:7-alpine | 6380 |
| `backend` | Custom (FastAPI) | 8000 |
| `frontend` | Custom (Next.js) | 3000 |

Persistent data is stored in the `tribu_pg_data` Docker volume.

## API Structure

```
/auth/register          POST    Create user + family
/auth/login             POST    Get JWT token
/auth/me                GET     Current user profile
/auth/me/profile-image  PATCH   Update profile image

/families/me            GET     User's families
/families/{id}/members  GET     Family members

/calendar/events        GET     List events
/calendar/events        POST    Create event
/calendar/events/{id}   PUT     Update event
/calendar/events/{id}   DELETE  Delete event

/birthdays              GET     List birthdays
/birthdays              POST    Create birthday

/contacts               GET     List contacts
/contacts               POST    Create contact
/contacts/import/csv    POST    Import from CSV

/dashboard/summary      GET     Upcoming events + birthdays
```
