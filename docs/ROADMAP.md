# Roadmap

## Phase 0: Foundation

- [x] Project scaffold (backend, frontend, infra)
- [x] Docker Compose setup (PostgreSQL, Redis, FastAPI, Next.js)
- [x] Health endpoint

## Phase 1: Auth & Families

- [x] User registration and login (JWT)
- [x] Family data model with memberships
- [x] Role system (admin, parent, child)
- [x] Protected API routes
- [x] First user auto-promoted to admin

## Phase 2: Core Modules

- [x] Calendar with event CRUD and month view
- [x] Birthday tracker with family scoping
- [x] Contacts with CSV import
- [x] Dashboard summary (events + birthdays, 4-week lookahead)

## Phase 3: Platform Features

- [x] Plugin manifest spec v1
- [x] Modular backend (one router per feature)
- [x] Theme engine (Morning Mist, Dark, Midnight Glass)
- [x] i18n foundation (DE/EN, lazy-loaded module packs)
- [x] App shell with sidebar navigation

## Phase 3.5: Security Hardening

- [x] httpOnly cookie authentication (replaces token-in-response)
- [x] Logout endpoint with cookie clearing
- [x] Cookie-first auth with Bearer fallback for API testing
- [x] Password minimum length (8 characters, 1 uppercase, 1 digit)
- [x] Rate limiting (10/min register, 20/min login)
- [x] CORS restricted to localhost and LAN
- [x] CSV import validation (row limit, range checks)
- [x] DATABASE_URL and JWT_SECRET required without fallback
- [x] Docker Compose secrets via .env (no hardcoded values)
- [x] Non-root Docker containers (backend + frontend)
- [x] Multi-stage frontend build
- [x] PostgreSQL and Redis ports not exposed to host

## Phase 3.6: Frontend Refactor

- [x] Split monolithic `pages/index.js` into Context + Hooks + Views architecture
- [x] AppContext for centralized state management (auth, data, theme, layout)
- [x] Dedicated hooks: `useCalendar`, `useTasks`, `useShopping`
- [x] Individual view components per screen

## Phase 3.7: UI Redesign + Demo Mode

- [x] CSS design system with custom properties and `data-theme` switching
- [x] Glassmorphism, mesh background, grain texture, stagger animations
- [x] Bento grid dashboard with welcome, stats, events, tasks, birthdays
- [x] Calendar with event dots, day-detail panel, week view
- [x] Task cards with priority/overdue/recurring badges and assignee avatars
- [x] Contact card grid with colored avatars
- [x] Three polished themes: Morning Mist, Dark, Midnight Glass
- [x] Responsive layout with mobile bottom nav (768px breakpoint)
- [x] Interactive demo mode with realistic bilingual sample data

## Phase 3.8: Quality Hardening

- [x] N+1 query fixes (joinedload on family/membership queries)
- [x] Alembic migrations (4 idempotent migrations, replaces raw SQL on_startup)
- [x] Pagination on calendar events and tasks (offset/limit, default 50, max 200)
- [x] i18n test suite (key symmetry, empty strings, fallback, buildMessages, t())
- [x] Password strength validation (1 uppercase + 1 digit, max 128 chars)
- [x] Admin demotion feedback (role in response, frontend notification)

## Phase 3.9: Token System + Shopping Lists

- [x] Personal Access Tokens (PATs) with scoped permissions (SHA-256 hash storage)
- [x] Scope enforcement on all module endpoints
- [x] Shopping lists module (multi-list, tap-to-toggle, checked section, bulk clear)
- [x] Mobile shell quality (safe areas, 44px touch targets, bottom nav badges)
- [x] Configurable `SECURE_COOKIES` env var for production TLS deployments

## Phase 4.0: Admin & Member Management

- [x] Admin member creation with temporary passwords
- [x] Forced password change on first login (`must_change_password`)
- [x] `PATCH /auth/me/password` and `POST /families/{id}/members` endpoints
- [x] Admin password reset for family members (#30)
- [x] Admin member removal with confirmation (#35)
- [x] Admin audit log: append-only trail for all admin actions (#33)
- [x] Self-protection guards (no self-demotion, no self-removal)

## Phase 4.1: Dependency Modernization (#23-#29)

- [x] Replace passlib with bcrypt (legacy PBKDF2-SHA256 auto-migrated on login)
- [x] Replace python-jose with PyJWT
- [x] Upgrade Node.js 20 to 22, Python 3.12 to 3.13
- [x] Upgrade Next.js 14 to 16 (Turbopack default), React 18 to 19.2
- [x] Replace Redis 7 with Valkey 8
- [x] All backend dependencies bumped to latest

## Phase 4.2: UX Polish

- [x] Customizable bottom nav with overflow menu (#17)
- [x] Multi-arch Docker images (#16)
- [x] Dashboard stats link to respective views (#32)
- [x] Active view persists across page refreshes (sessionStorage)
- [x] Favicon and PWA icon (#31)
- [x] Clipboard copy fallback for non-HTTPS deployments
- [x] Mobile nav label truncation (#34)

---

## Release 0.4: Everyday MVP

Goal: A family can run their daily life through Tribu without needing an external app.

- [x] Recurring calendar events (#6) with RRULE-compatible rules
- [x] Accessibility baseline (#14): contrast, focus, keyboard, screen reader labels
- [x] Notifications (#7): in-app feed with scheduler-driven reminders, polling, per-user preferences
- [x] Import/Export (#8): ICS calendar import/export, CSV contacts import/export
- [x] Instance backup and restore (#15): CLI scripts + admin UI with scheduling and retention
- [x] PWA foundation: Web App Manifest, Service Worker, installable home screen app

## Release 0.5: Admin & Modernization

Goal: Full admin control over family members, modernized stack, polished UX.

- [x] Admin member lifecycle: create, remove, reset password, change role/adult status
- [x] Admin audit log with pagination (#33)
- [x] Dependency modernization: Python 3.13, Node 22, Next.js 16, React 19, Valkey 8
- [x] Security: bcrypt + PyJWT replace legacy libs
- [x] UX: customizable nav, persistent view, clickable dashboard stats, clipboard fallback

## Release 0.5.1: UI Platform

- [x] Theme pack registry with version, author, active badge (#13)
- [x] Language pack registry with completeness tracking (#13)

---

## Road to 1.0 (EPIC #46)

### Release 0.6: Collaboration ✅

Goal: Make Tribu work for families who use it simultaneously.

- [x] Real-time shopping list sync via WebSocket (#36)
- [x] Child role restrictions and limited visibility (#37)
- [x] Family invitation via shareable link (#38)

### Release 0.7: Infrastructure & Performance ✅

Goal: Harden the backend before adding major features.

- [x] First-run setup wizard with backup restore (#41)
- [x] Valkey caching for hot queries (#43)
- [x] API reference documentation (#45)

### Release 0.8: Integration

Goal: Connect Tribu with external devices and standards.

- [ ] Web Push notifications via Service Worker (#40)
- [ ] CalDAV and CardDAV bidirectional sync (#39)

### Release 0.9: Production Readiness

Goal: Final quality gate before 1.0.

- [ ] Self-hosting documentation (#44)
- [ ] E2E test suite with Playwright (#42)

### Release 1.0: Stable

Goal: All of the above complete. Tribu is ready for any family to deploy, configure, and rely on daily.

---

## Future (post-1.0)

- [ ] Family chat (text, images)
- [ ] Home Assistant integration (events as automation triggers)
- [ ] Plugin registry and dynamic module loading
- [ ] Optional MQTT for IoT scenarios
