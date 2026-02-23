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

## Phase 4: Collaboration

- [ ] Shared todo lists
- [ ] Shopping lists with real-time sync
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
