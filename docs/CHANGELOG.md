# Changelog

All notable changes to Tribu are documented here.

## 2026-02-23

### Added

- **Tasks module**: Family-shared task list with CRUD, priorities (low/normal/high), due dates, assignees, status filter (all/open/done), and recurring tasks (daily/weekly/monthly/yearly). Completing a recurring task auto-creates the next instance.
- **Tasks i18n**: German and English translations for the tasks module
- **Tasks plugin manifest**: `tribu.tasks` feature manifest with menu entry (CheckSquare icon, order 25)

### Security

- **Auth**: Replaced JWT token response with httpOnly cookie authentication (SameSite=Lax)
- **Auth**: Added `/auth/logout` endpoint to clear auth cookie
- **Auth**: Cookie-first authentication with Bearer token fallback for API testing
- **Auth**: Password minimum length of 8 characters enforced via Pydantic validation
- **CORS**: Restricted to localhost, 127.0.0.1, and 192.168.x.x via regex pattern
- **CSV import**: Row limit (500), month/day range validation, email format check
- **Environment**: `DATABASE_URL` and `JWT_SECRET` required without fallback defaults (backend refuses to start)
- **Docker Compose**: Secrets (`JWT_SECRET`, `POSTGRES_PASSWORD`) parametrized via `.env` file

### Infrastructure

- **Docker**: Non-root user (`tribu`) in both backend and frontend containers
- **Docker**: Multi-stage frontend build (build step separated from runtime image)
- **Docker**: `.dockerignore` files for both services
- **Docker**: PostgreSQL and Redis ports no longer exposed to host

### Added

- **Rate limiting**: 10/min for registration, 20/min for login (slowapi)
- **`.env.example`**: Template with generation hints for secrets

## 2026-02-20

### Added

- **Project foundation**: Scaffold with Docker Compose (PostgreSQL 16, Redis 7, FastAPI, Next.js 14)
- **Auth system**: Register, login, JWT sessions, profile image support
- **Family model**: Multi-family memberships with roles (admin, parent, child)
- **Calendar module**: Event CRUD API, monthly grid view with clickable days, dynamic day-detail panels, inline event forms
- **Birthday module**: Dedicated tracker scoped to family, auto-sync from contacts
- **Contacts module**: Family address book, CSV import with automatic birthday extraction
- **Dashboard module**: Summary API showing upcoming events and birthdays within 4 weeks
- **Plugin system**: Manifest spec v1 for features, themes, and language packs
- **Theme engine**: Switchable design tokens (Light, Dark, Midnight Glass)
- **i18n**: German and English, core + module-level language packs with lazy loading
- **App shell**: Modern sidebar navigation with Lucide icons
- **Role model**: First registered user auto-promoted to admin and adult
- **Architecture docs**: Architecture overview, plugin manifest spec, roadmap
