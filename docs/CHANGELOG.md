# Changelog

All notable changes to Tribu are documented here.

## v0.7.0 — 2026-02-25

### Milestone 0.6: Collaboration

- **Family invitation links (#38)**: Admins create shareable invite URLs with configurable expiry (1-90 days) and max uses. Public endpoint for invite validation, rate-limited registration with preset role and adult status.
- **Child role restrictions (#37)**: Backend `ensure_adult()` enforcement on write endpoints. Children can view data, toggle own task status, and check/uncheck shopping items.
- **WebSocket shopping sync (#36)**: Real-time shopping list updates via WebSocket broadcast. HTTP mutations remain source of truth; WebSocket pushes to all connected clients.

### Milestone 0.7: Infrastructure & Performance

- **First-run setup wizard (#41)**: Fresh deployments show guided setup — start fresh or restore from backup. Theme/language preferences step included.
- **Valkey caching (#43)**: Cached hot endpoints (dashboard, unread count, members, nav order, preferences) with automatic invalidation on writes. Graceful DB fallback.
- **API reference documentation (#45)**: All 69 endpoints with summaries, descriptions, error responses. Schema field descriptions and JSON examples. Auth guide, rate limits, error format, permissions model, PAT scope matrix. 16 tag descriptions.

### Infrastructure

- Docker Compose project name set to `tribu`
- Valkey service renamed from `redis`

---

## 2026-02-25

### Added

- **Child role restrictions (#37)**: Age-appropriate access control for child family members. Backend `ensure_adult()` dependency returns 403 on write endpoints for children. Nuanced PATCH: children can toggle task status on their own tasks and check/uncheck shopping items, but cannot create, edit, or delete anything else. Token router uses separate `_ensure_user_is_adult()` since PATs are user-scoped. Frontend `isChild` flag in AppContext hides create/delete buttons, Data Management, and API Tokens sections. Role label shows "Kind"/"Child" in sidebar and settings.
- **WebSocket shopping list sync (#36)**: Real-time updates across devices using unidirectional broadcast pattern. Mutations go through HTTP (single source of truth), WebSocket pushes events to all connected clients. Backend: `ConnectionManager` (in-memory), `ws_broadcast` (fire-and-forget via `asyncio.run_coroutine_threadsafe`), JWT cookie auth on WS endpoint. Frontend: `useWebSocket` hook with reconnecting exponential backoff (1s-30s) and keepalive ping (25s), `useShopping` with optimistic UI and HTTP fallback.
### Changed

- **GET /tasks**: Children see only tasks assigned to them (filtered by `assigned_to_user_id`).
- **Shopping item PATCH**: Children can only update `checked` field, all other fields return 403.
- **Task PATCH**: Children can only update `status` on tasks assigned to them, all other fields or other users' tasks return 403.

## 2026-02-24 (late)

### Added

- **Admin member creation**: Admins can create family members directly from the Admin view with a generated temporary password. New members must change their password on first login (`must_change_password` flag). Includes `ForcePasswordChange` overlay component, `PATCH /auth/me/password` endpoint, and `POST /families/{id}/members` endpoint.
- **Alembic migration 0009**: `must_change_password` boolean column on users table.

### Changed

- **Stack upgrades** (#23-#29): Replaced passlib with bcrypt (legacy PBKDF2-SHA256 hashes auto-migrated on login). Replaced python-jose with PyJWT. Upgraded Node.js 20 to 22 (Dockerfile), Python 3.12 to 3.13 (Dockerfile), Next.js 14 to 16 (Turbopack now default), React 18 to 19.2, Redis 7 to Valkey 8. All backend dependencies bumped to latest.
- **Architecture docs**: Updated tech stack versions, security details, migration list, API endpoints, and deployment table across README, ARCHITECTURE.md, Wiki, CHANGELOG, and ROADMAP.

## 2026-02-24

### Added

- **In-app notifications (#7)**: Scheduler-driven notification engine checks every 5 minutes for event reminders (configurable lead time), overdue tasks, and upcoming birthdays. Deduplication via `notification_sent_log`. Per-user preferences: reminder toggle, reminder minutes (15/30/60), quiet hours. Full REST API with 8 endpoints. Frontend: NotificationCenter view with type-specific icons, relative timestamps, mark read, delete, and mark-all-read. Unread badge on sidebar, mobile header, and bottom nav with 30-second polling.
- **PWA foundation**: Web App Manifest (`manifest.json`), Service Worker with network-first strategy for HTML and cache-first for hashed static assets, app icons (192/512/maskable). iOS standalone mode meta tags. Installable as home screen app.
- **Alembic migration 0007**: `notifications`, `notification_preferences`, and `notification_sent_log` tables with indexes.

### Infrastructure

- **Multi-arch Docker images (#16)**: GitHub Actions workflow (`.github/workflows/docker.yml`) builds `linux/amd64` and `linux/arm64` images for both backend and frontend using Docker Buildx with QEMU emulation. Triggered on semver tags (`v*`) and manual dispatch. Images pushed to GHCR with `latest`, `x.y.z`, and `x.y` tags. GHA build cache for faster rebuilds.
- **Docker Compose GHCR references**: `docker-compose.yml` now includes `image:` fields pointing to `ghcr.io/itsdnns/tribu-backend` and `ghcr.io/itsdnns/tribu-frontend`. `docker compose pull` fetches pre-built images; `docker compose build` falls back to local Dockerfiles.

### Security

- **Cookie hardening**: Replaced hardcoded `secure=False` with configurable `SECURE_COOKIES` environment variable. Set to `true` when running behind a TLS reverse proxy.

### Changed

- **ARCHITECTURE.md**: Added notifications router, scheduler, PWA, notification models, multi-arch deployment details.
- **ROADMAP.md**: Restructured to align with vision document. Release 0.4-0.7 milestones replace old Phase 4-6 buckets. Marked notifications (#7) and backup/restore (#15) as complete.
- **SECURITY.md**: Added production deployment checklist (TLS, secure cookies, secrets, backups).

## 2026-02-23 (late)

### Added

- **Funding**: `.github/FUNDING.yml` with Ko-fi, PayPal, and GitHub Sponsors. Funding badges in README.
- **Issues**: #15 (Backup/Restore), #16 (Multi-Arch Docker), #17 (Customizable Nav) created.

### Fixed

- **Mobile shell quality** (#10): `viewport-fit=cover` for iOS safe area support, `_document.js` with `lang="de"`, safe area insets on bottom nav/sidebar/header, 44px touch targets on all interactive elements, bottom nav CSS grid with badge bubbles, overflow fixes on contacts grid/calendar/shopping panel. Tested at 375px and 390px.

## 2026-02-23

### Added

- **Shopping lists module**: Multi-list support (e.g. Grocery, Drugstore) with minimal item model (name + optional spec freetext). Tap-to-toggle between active and checked states. Checked items shown at bottom with count divider (Google Keep style). Bulk clear checked items. 8 REST endpoints with family membership checks. `shopping:read` and `shopping:write` scopes. Alembic migration 0004 for `shopping_lists` and `shopping_items` tables.
- **Shopping frontend**: ShoppingView with 2-column desktop layout (lists panel + items panel), horizontal scroll lists on mobile. `useShopping` hook with full demo mode support. i18n translations (EN/DE). Nav badge showing unchecked item count. Demo data with 2 sample lists (12 items total).
- **Personal Access Tokens**: Scoped PAT system with SHA-256 hash storage, prefix detection (`tribu_pat_`), expiration, and last-used tracking. Token CRUD API (create with plain token response, list, revoke). Max 25 tokens per user. Scope validation on all module endpoints. Alembic migration 0003.

### Security

- **Password validation**: Registration requires min 8 chars, 1 uppercase letter, 1 digit (max 128 chars, bcrypt-safe). Login enforces same length bounds. Frontend hint text shown below register password field.

### Changed

- **Admin demotion feedback**: Backend returns `role` in adult-toggle response. Frontend detects when setting a member to child demotes them from admin and shows an i18n notification.
- **AdminView CSS**: Last two inline styles migrated to `.admin-error` and `.admin-actions` CSS classes.

### Infrastructure

- **Alembic migrations**: Replaced raw SQL `on_startup()` with two idempotent Alembic migrations (initial schema + tasks extension). Fixed `sys.path` for Docker compatibility.
- **N+1 query fix**: Added `joinedload` to family member and membership queries in `families_router.py`.
- **Pagination**: Calendar events and tasks endpoints support `offset`/`limit` (default 50, max 200). Frontend shimmed to handle paginated responses.
- **Test fixes**: TasksView tests updated for redesigned component markup (checkbox divs, assignee initials, Lucide X icon).

### Added

- **UI redesign**: Complete visual overhaul based on approved prototype. CSS design system with glassmorphism, bento grid dashboard, stagger animations, mesh background, and grain texture. Three polished themes: Morning Mist (light), Dark, Midnight Glass (glassmorphism).
- **Complete i18n overhaul**: English as default language. All hardcoded German strings replaced with `t()` calls across every view, hook, and component (AuthPage, AppShell, DashboardView, CalendarView, TasksView, ContactsView, SettingsView, AdminView, useCalendar, useTasks).
- **Bilingual demo data**: `buildDemoData(lang)` generates locale-appropriate sample data for both English and German.
- **DOCSight-style sidebar**: Collapsible navigation (240px to 70px) with tooltips on collapsed icons and mobile overlay drawer.
- **Demo mode**: Interactive demo accessible from the auth page. Pre-loaded with realistic family data (4 members, 12 events, 10 tasks, 7 contacts, 3 birthdays). All CRUD operations work locally without a backend.
- **Frontend refactor**: Monolithic `pages/index.js` split into Context + Hooks + Views architecture. AppContext for global state, dedicated hooks for calendar and task logic, individual view components per screen.
- **CSS design system**: Global stylesheet (`styles/globals.css`) with CSS custom properties, `data-theme` attribute switching, responsive breakpoints (768px, 1100px), and utility classes for glass effects and animations.
- **Loading states**: Skeleton shimmer placeholders while initial data loads and during family switch. CSS `@keyframes shimmer` animation with dedicated `.skeleton-*` utility classes and `.loading-spinner`.
- **Tasks module**: Family-shared task list with CRUD, priorities (low/normal/high), due dates, assignees, status filter (all/open/done), and recurring tasks (daily/weekly/monthly/yearly). Completing a recurring task auto-creates the next instance.
- **Tasks i18n**: German and English translations for the tasks module
- **Tasks plugin manifest**: `tribu.tasks` feature manifest with menu entry (CheckSquare icon, order 25)

### Changed

- **AdminView**: Migrated from inline styles (`ui.card`, `ui.smallCard`, `ui.secondaryBtn`) to CSS classes (`glass-sm`, `settings-section`, `btn-ghost`, `profile-row`, etc.)
- **Theme rename**: Dark theme display name changed from "Dunkel" to "Dark" for consistency with English-first approach
- **Calendar locale**: Month labels and date formatting now respect the active language (was hardcoded `de-DE`)
- **Settings theme picker**: Visual preview cards with locale-aware descriptions instead of plain dropdown

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
