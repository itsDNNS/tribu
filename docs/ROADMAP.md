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
- [x] Theme engine (Light, Dark, Midnight Glass)
- [x] i18n foundation (DE/EN, lazy-loaded module packs)
- [x] App shell with sidebar navigation

## Phase 3.5: Security Hardening

- [x] httpOnly cookie authentication (replaces token-in-response)
- [x] Logout endpoint with cookie clearing
- [x] Cookie-first auth with Bearer fallback for API testing
- [x] Password minimum length (8 characters)
- [x] Rate limiting (10/min register, 20/min login)
- [x] CORS restricted to localhost and LAN
- [x] CSV import validation (row limit, range checks)
- [x] DATABASE_URL and JWT_SECRET required without fallback
- [x] Docker Compose secrets via .env (no hardcoded values)
- [x] Non-root Docker containers (backend + frontend)
- [x] Multi-stage frontend build
- [x] .dockerignore for both services
- [x] PostgreSQL and Redis ports not exposed to host

## Phase 3.6: Frontend Refactor

- [x] Split monolithic `pages/index.js` into Context + Hooks + Views architecture
- [x] AppContext for centralized state management (auth, data, theme, layout)
- [x] Dedicated hooks: `useCalendar` (calendar state, forms), `useTasks` (task filters, forms)
- [x] Individual view components: AppShell, AuthPage, DashboardView, CalendarView, TasksView, ContactsView, SettingsView

## Phase 3.7: UI Redesign + Demo Mode

- [x] CSS design system (`styles/globals.css`) with CSS custom properties and `data-theme` switching
- [x] Glassmorphism, mesh background, grain texture, stagger animations
- [x] Bento grid dashboard (welcome, stats, events, tasks, birthdays)
- [x] Calendar with event dots, day-detail panel, week view
- [x] Task cards with priority/overdue/recurring badges and assignee avatars
- [x] Contact card grid with colored avatars
- [x] Visual theme picker with preview cards
- [x] Three polished themes: Morning Mist (light), Dunkel (dark), Midnight Glass (glassmorphism)
- [x] Responsive layout with mobile bottom nav (768px breakpoint)
- [x] Interactive demo mode with realistic sample data and local mutations

## Phase 3.8: Quality Hardening

- [x] N+1 query fixes (joinedload on family/membership queries)
- [x] Alembic migrations (replace raw SQL on_startup, idempotent initial + tasks migration)
- [x] Pagination on calendar events and tasks (offset/limit, default 50, max 200)
- [x] i18n test suite (key symmetry, empty strings, fallback, buildMessages, t())
- [x] Password strength validation (1 uppercase + 1 digit, max 128 chars)
- [x] Admin demotion feedback (role returned in response, frontend notification)
- [x] AdminView inline styles fully migrated to CSS classes

## Phase 3.9: Token System

- [x] Personal Access Tokens (PATs) with scoped permissions
- [x] Token CRUD API (create, list, revoke) with SHA-256 hash storage
- [x] Scope enforcement on all module endpoints (calendar, tasks, contacts, birthdays, families, profile, shopping)
- [x] PAT prefix detection (`tribu_pat_`) with Bearer auth fallback
- [x] Migration 0003: personal_access_tokens table

## Phase 4: Collaboration

- [x] Shopping lists module (multi-list, tap-to-toggle, name+spec items, checked section, bulk clear)
- [ ] Real-time sync for shopping lists (WebSocket/SSE)
- [ ] Family chat (text, images)

## Phase 5: Smart Features

- [ ] Reminders and push notifications
- [ ] Recurring events
- [ ] Meal planner
- [ ] Budget tracker

## Phase 6: Advanced

- [ ] Location sharing (opt-in)
- [ ] Geofencing notifications
- [ ] File sharing / family vault
- [ ] Plugin marketplace
