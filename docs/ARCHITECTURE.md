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
                    │   Valkey     │
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
backend/
├── alembic/                # Database migrations (Alembic)
│   ├── env.py
│   └── versions/
│       ├── 0001_initial_schema.py
│       ├── 0002_add_is_adult_and_profile_image.py
│       ├── 0003_add_personal_access_tokens.py
│       ├── 0004_add_shopping_lists.py
│       ├── 0005_add_calendar_recurrence.py
│       ├── 0006_add_system_settings.py
│       ├── 0007_add_notifications.py
│       ├── 0008_add_nav_order.py
│       └── 0009_add_must_change_password.py
└── app/
    ├── main.py              # App factory, auth routes, rate limiting, module registration
    ├── models.py            # SQLAlchemy models
    ├── schemas.py           # Pydantic schemas (with input validation)
    ├── security.py          # JWT (PyJWT), bcrypt hashing, legacy hash migration, PAT generation, temp passwords
    ├── database.py          # Engine, session factory (requires DATABASE_URL)
    ├── core/
    │   ├── deps.py          # Shared dependencies (current_user, get_db, family checks)
    │   ├── scopes.py        # PAT scope validation (require_scope, has_scope)
    │   └── scheduler.py     # APScheduler jobs (backups, notification checks)
    └── modules/
        ├── calendar_router.py
        ├── birthdays_router.py
        ├── contacts_router.py
        ├── tasks_router.py
        ├── shopping_router.py
        ├── dashboard_router.py
        ├── families_router.py
        ├── tokens_router.py   # Personal Access Token CRUD
        └── notifications_router.py  # Notification feed, preferences, SSE stream
```

### Domain Model

```
User ──┬── Membership ──── Family
       │       │                │
       │       ├── role         ├── CalendarEvent
       │       └── is_adult     ├── Birthday
       │                        ├── Contact
       ├── PersonalAccessToken  ├── Task (optional assignee, recurring)
       │   ├── scopes           ├── ShoppingList
       │   └── expires_at       │   └── ShoppingItem
       │                        └── Notification
       ├── NotificationPreference
       ├── NotificationSentLog
       │
       └── (created_by on events, tasks, lists)
```

- First user to register becomes **admin** and **is_adult** automatically
- Admins can create family members with temporary passwords (`must_change_password` flag forces password change on first login)
- Calendar events, birthdays, contacts, tasks, and shopping lists are always scoped to exactly one family
- Personal Access Tokens are user-scoped (not family-scoped) with granular permission scopes

### Security

| Concern | Implementation |
|---------|---------------|
| Password storage | bcrypt (min 8 characters, legacy PBKDF2-SHA256 auto-migrated on login) |
| Auth | httpOnly cookie (JWT HS256), Bearer fallback for API testing |
| Rate limiting | 10/min register, 20/min login (slowapi) |
| Authorization | Role check per family membership |
| Data isolation | All queries filtered by family_id |
| CORS | Restricted to localhost and LAN IPs (regex pattern) |
| Environment | `DATABASE_URL` and `JWT_SECRET` required, no fallback defaults |
| CSV import | 500 row limit, month/day range checks, email format validation |
| PAT scopes | `require_scope()` dependency on all module endpoints |
| Cookie security | `SECURE_COOKIES` env var controls Secure flag (enable behind TLS) |

### Environment Variables

The backend requires the following environment variables and will not start without them:

- `DATABASE_URL`: PostgreSQL connection string
- `JWT_SECRET`: Secret key for JWT signing

Optional:
- `JWT_EXPIRE_HOURS`: Token expiration (default: 24)
- `REDIS_URL`: Valkey/Redis connection string (prepared for future use)
- `SECURE_COOKIES`: Set to `true` when behind TLS reverse proxy (default: `false`)

## Frontend

**Framework**: Next.js 16 (Turbopack), React 19

### Architecture

The frontend uses a Context + Hooks + Views pattern:

- **AppContext** (`contexts/AppContext.js`): Central state management for auth, family data, theme, and demo mode. All data flows through a single React Context.
- **Hooks** (`hooks/`): Encapsulate UI-local state and form logic. `useCalendar` manages calendar navigation, event forms, and computed month cells. `useTasks` manages task filters, form state, and filtered task lists. `useShopping` manages list selection, item CRUD, and checked-state toggling.
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
| ShoppingView | 2-column layout (lists panel + items), tap-to-toggle, checked section with bulk clear. |
| NotificationCenter | Notification feed with type icons, relative timestamps, mark read/delete, mark all read. |
| SettingsView | Profile section, visual theme picker cards, language toggle, notification preferences, PAT management, privacy info. |
| ForcePasswordChange | Full-screen overlay forcing password change for admin-created members on first login. |

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

## PWA

Tribu is installable as a Progressive Web App. The frontend includes:

- **Web App Manifest** (`public/manifest.json`): standalone display, purple theme, app icons
- **Service Worker** (`public/sw.js`): network-first for HTML pages (ensures fresh content after deploys), cache-first for `_next/static/` assets (content-hashed filenames), network-first for API calls
- **App icons**: 192px, 512px, and 512px maskable PNG icons
- **iOS support**: `apple-mobile-web-app-capable` and `apple-touch-icon` meta tags

## Deployment

Docker Compose stack (`infra/docker-compose.yml`):

| Service | Image | Architectures | Exposed Port |
|---------|-------|---------------|--------------|
| `postgres` | postgres:16-alpine | amd64, arm64 | Internal only |
| `valkey` | valkey/valkey:8-alpine | amd64, arm64 | Internal only |
| `backend` | ghcr.io/itsdnns/tribu-backend | amd64, arm64 | 8000 |
| `frontend` | ghcr.io/itsdnns/tribu-frontend | amd64, arm64 | 3000 |

All images support `linux/amd64` and `linux/arm64`. Multi-arch images are built via GitHub Actions (`.github/workflows/docker.yml`) using Docker Buildx with QEMU emulation and pushed to GHCR on tagged releases. `docker compose pull` automatically selects the correct architecture.

For local development, `docker compose build` uses the Dockerfiles in `backend/` and `frontend/` as fallback.

PostgreSQL and Redis are only accessible within the Docker network. Persistent data is stored in the `tribu_pg_data` Docker volume.

A `.env` file in `infra/` is required before starting. See [`infra/.env.example`](../infra/.env.example) for the template.

## API Structure

```
/auth/register          POST    Create user + family (sets httpOnly cookie)
/auth/login             POST    Authenticate, sets httpOnly cookie
/auth/logout            POST    Clear auth cookie
/auth/me                GET     Current user profile
/auth/me/profile-image  PATCH   Update profile image
/auth/me/password       PATCH   Change password (required on first login for admin-created members)

/families/me            GET     User's families
/families/{id}/members  GET     Family members
/families/{id}/members/{uid}/role   PATCH  Update member role (admin only)
/families/{id}/members/{uid}/adult  PATCH  Update adult status (admin only)
/families/{id}/members  POST   Create member with temp password (admin only)

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

/shopping/lists                     GET     List shopping lists
/shopping/lists                     POST    Create shopping list
/shopping/lists/{id}                PATCH   Rename shopping list
/shopping/lists/{id}                DELETE  Delete shopping list
/shopping/lists/{id}/items          GET     List items in shopping list
/shopping/lists/{id}/items          POST    Add item
/shopping/lists/{id}/items/{iid}    PATCH   Update item (toggle checked, rename)
/shopping/lists/{id}/items/{iid}    DELETE  Delete item

/tokens                 GET     List user's PATs
/tokens                 POST    Create PAT (returns plain token once)
/tokens/{id}            DELETE  Revoke PAT

/notifications              GET     List notifications (limit/offset)
/notifications/unread-count GET     Unread notification count
/notifications/{id}/read    PATCH   Mark notification as read
/notifications/read-all     POST    Mark all notifications as read
/notifications/{id}         DELETE  Delete notification
/notifications/stream       GET     SSE stream for real-time notifications
/notifications/preferences  GET     Get notification preferences
/notifications/preferences  PUT     Update notification preferences
```
