# Contributing to Tribu

Thanks for your interest in contributing to Tribu.

This file is the fastest repo-local guide for contributors. Use it to understand how to propose work, run the app locally, verify changes, and decide where code should live.

For contributor workflow inside the repository, treat this file as the canonical source. Use the wiki for deeper architecture, roadmap, changelog, and plugin reference material.

- [Architecture](https://github.com/itsDNNS/tribu/wiki/Architecture)
- [Plugin Manifest](https://github.com/itsDNNS/tribu/wiki/Plugin-Manifest)
- [Roadmap](https://github.com/itsDNNS/tribu/wiki/Roadmap)
- [Self-Hosting Guide](docs/self-hosting.md)
- [Security Policy](SECURITY.md)

## Before you start

- Open an issue before starting significant work so the approach can be aligned early.
- Small fixes like typos, narrow bug fixes, and doc improvements can usually go straight to a PR.
- Keep changes scoped. Tribu is easier to review when one PR solves one clear problem.

## Engineering principles

### 1. Architecture first

Before changing code, read the relevant architecture and module context first.

Do not start by scattering changes across the repo. First decide:

- which layer should own the change
- which files are the right home for it
- whether it belongs in core product code, an existing module, docs, or plugin-related surfaces

A good PR explains file placement clearly before or alongside the implementation.

### 2. Keep boundaries clean

Prefer small, typed, production-ready changes over broad rewrites.

Examples:

- backend API logic belongs in backend modules and supporting backend layers, not in frontend helpers
- frontend view behavior belongs in components, hooks, or lib utilities that already own that concern
- docs changes should update the canonical doc instead of duplicating conflicting instructions in multiple places

### 3. Do not hide uncertainty

If a change conflicts with existing architecture, product direction, or documentation, raise it in the issue or PR instead of guessing.

## Repo map

A simplified map of the main areas:

```text
tribu/
├── backend/              # FastAPI app, models, routers, tests, migrations
├── frontend/             # Next.js app, components, hooks, tests, e2e
├── docker/               # Compose stack and env template
├── docs/                 # Repo-local documentation and assets
├── scripts/              # Backup and restore helpers
├── README.md             # Public product-facing entry page
├── CONTRIBUTING.md       # Repo-local contributor guide
└── SECURITY.md           # Security disclosure policy
```

## Development setup

### Option A: Full stack with Docker Compose

This is the easiest way to boot the whole app locally.

```bash
git clone https://github.com/itsDNNS/tribu.git
cd tribu
cp docker/.env.example docker/.env
# Fill in JWT_SECRET and POSTGRES_PASSWORD
cd docker
docker compose up --build
```

Then open `http://localhost:3000`.

The first registered user becomes the family admin.

### Option B: Local frontend + local backend

### Prerequisites

- Python 3.13+
- Node.js 20+
- Docker with Compose v2 for PostgreSQL/Valkey or for full-stack runs

### Backend

Create and activate a virtual environment inside `backend/`, install dependencies, set required environment variables, and run the API:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
pip install pytest httpx
export DATABASE_URL="postgresql://tribu:***@localhost:5432/tribu"
export JWT_SECRET="your-generated-64-char-hex"  # generate with: openssl rand -hex 32
uvicorn app.main:app --reload --port 8000
```

Required backend environment variables:

- `DATABASE_URL`
- `JWT_SECRET`

If you want a ready database/cache quickly, start the supporting services from the compose stack and point your local backend at them.

Backend tests currently expect `pytest` and `httpx` to be available inside `backend/.venv` in addition to the packages from `requirements.txt`.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The frontend expects the app at `http://localhost:3000` and the backend at `http://localhost:8000`.

## Testing before you open a PR

Run the narrowest relevant checks for your change, then broaden if needed.

### Frontend

```bash
cd frontend
npm test
npm run build
```

For browser coverage:

```bash
cd frontend
npm run e2e
```

### Backend

```bash
cd backend
source .venv/bin/activate
pytest
```

If your change touches authentication, DAV, invitations, admin flows, or data integrity, prefer adding or updating backend tests near the affected area.

## Where changes should go

### Product and feature changes

- backend routes and domain logic: `backend/app/`
- backend tests: `backend/tests/`
- frontend screens and UI behavior: `frontend/components/`, `frontend/hooks/`, `frontend/lib/`
- frontend unit tests: `frontend/__tests__/`
- frontend end-to-end coverage: `frontend/e2e/tests/`

### Docs and positioning

- public first impression and product story: `README.md`
- contributor workflow: `CONTRIBUTING.md`
- self-hosting and operations: `docs/self-hosting.md`
- security disclosure process: `SECURITY.md`
- deeper architecture, roadmap, changelog, and plugin details: wiki pages linked from the README

## PR expectations

A good PR should:

- explain the problem being solved
- explain why the chosen file placement is correct
- keep unrelated changes out of scope
- include tests or a clear reason they were not needed
- update docs when behavior, setup, or contributor expectations changed

Recommended PR structure:

1. Summary
2. File placement / architecture notes
3. Test plan
4. Screenshots or recordings for meaningful UI changes

## Documentation updates are part of the job

When you change setup steps, developer workflow, behavior, architecture assumptions, or user-facing flows, update the relevant docs in the same PR.

Do not leave the README, self-hosting guide, and contributor docs drifting apart.

## Security

Please do not open a public issue for sensitive vulnerabilities. Follow the process in [SECURITY.md](SECURITY.md).

## Ways to help beyond code

Contributions are also welcome in the form of:

- issue triage
- docs improvements
- self-hosting feedback
- bug reproduction steps
- UI polish suggestions
- tests and regression coverage

Thanks for helping make Tribu stronger.
