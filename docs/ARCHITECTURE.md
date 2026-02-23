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

### Architecture

The frontend uses a Context + Hooks + Views pattern:

- **AppContext** (`contexts/AppContext.js`): Central state management for auth, family data, theme, and demo mode. All data flows through a single React Context.
- **Hooks** (`hooks/`): Encapsulate UI-local state and form logic. `useCalendar` manages calendar navigation, event forms, and computed month cells. `useTasks` manages task filters, form state, and filtered task lists.
- **Views** (`components/`): Pure rendering components that consume context and hooks. Each view handles one screen (Dashboard, Calendar, Tasks, Contacts, Settings).

### Key Components

| Component | Description |
|-----------|-------------|
| AppShell | Sidebar with brand, family switcher, nav items with badges, user area. Mobile: floating bottom nav pill + header. |
| AuthPage | Login/register forms with glass card styling. Demo mode entry button. |
| DashboardView | Bento grid (12-column CSS grid): welcome card, family stats, next events, open tasks, birthday countdown. |
| CalendarView | Month grid with event dots, today marker, day-detail side panel (desktop) or stacked (mobile), week view, quick-add forms. |
| TasksView | Quick-add bar, expanded form fields, filter tabs (all/open/done), task cards with priority/overdue/recurring badges. |
| ContactsView | Responsive card grid with colored avatars, CSV import section. |
| SettingsView | Profile section, visual theme picker cards, language toggle, privacy info. |

### CSS Design System

The UI uses a global CSS file (`styles/globals.css`) with CSS custom properties for theming. Theme switching sets a `data-theme` attribute on `<html>`, which activates the corresponding CSS variable set.

```css
:root { /* Midnight Glass (default) */
  --void: #06080f;
  --glass: rgba(17, 22, 40, 0.65);
  --amethyst: #7c3aed;
  /* ... */
}

[data-theme="light"] {
  --void: #f8f6f3;
  --glass: rgba(255, 255, 255, 0.72);
  /* ... */
}
```

Key design elements: glassmorphism (`backdrop-filter: blur`), mesh background with animated gradients, grain texture overlay, stagger animations on view enter, bento grid layout, and responsive breakpoints at 1100px and 768px.

### Theme System

Each theme is a JSON file with design tokens and a `dataTheme` field that maps to the CSS selector:

```json
{
  "id": "tribu.theme.midnight-glass",
  "name": "Midnight Glass",
  "dataTheme": "midnight-glass",
  "tokens": {
    "bg": "#06080f", "surface": "#111628", "text": "#e8edff",
    "primary": "#7c3aed", "primaryText": "#ffffff",
    "sidebar": "rgba(10,13,24,0.85)", "sidebarActive": "rgba(124,58,237,0.12)"
  }
}
```

Available themes: **Morning Mist** (light), **Dunkel** (dark), **Midnight Glass** (glassmorphism)

### Demo Mode

The app includes an interactive demo mode accessible from the auth page. When activated:

- `enterDemo()` in AppContext injects realistic mock data (4 family members, 12 events, 10 tasks, 7 contacts, 3 birthdays)
- All data loaders become no-ops (no API calls)
- Mutations (create/toggle/delete tasks, create events) update local state directly
- A gradient banner indicates demo mode is active
- Logout cleanly exits demo mode and returns to the auth page

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
