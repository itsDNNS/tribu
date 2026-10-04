# Contributing to Tribu

Thanks for your interest in contributing to Tribu.

This file is the fastest repo-local guide for contributors. Use it to understand how to propose work, run the app locally, verify changes, and decide where code should live.

For contributor workflow inside the repository, treat this file as the canonical source. All other documentation lives in the [GitHub Wiki](https://github.com/itsDNNS/tribu/wiki):

- [Architecture](https://github.com/itsDNNS/tribu/wiki/Architecture)
- [Design and Frontend Guidelines](https://github.com/itsDNNS/tribu/wiki/Design-and-Frontend-Guidelines)
- [Plugin Manifest](https://github.com/itsDNNS/tribu/wiki/Plugin-Manifest)
- [Roadmap](https://github.com/itsDNNS/tribu/wiki/Roadmap)
- [Self-Hosting Guide](https://github.com/itsDNNS/tribu/wiki/Self-Hosting)
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
├── docs/                 # Product page (GitHub Pages) and its images
├── integrations/         # Home Assistant package and dashboard card
├── scripts/              # Local end-to-end test runners
├── tests/                # Repository contract tests (docs, workflows, public surfaces)
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
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
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

### Translations

Tribu ships one checked-in locale bundle per supported UI language under `frontend/i18n/<language>.json`. Edit those bundle files directly when changing user-facing copy.

When adding or changing translation keys:

- Add the key to `frontend/i18n/en.json` first.
- Keep the same key present in every other `frontend/i18n/*.json` file.
- Preserve placeholders and technical literals exactly, for example `{count}`, `{date}`, `openid`, and permission scope names.
- If you add or remove a supported language, update `frontend/lib/i18nLanguages.json` and run `npm run i18n:generate` from `frontend` to refresh the generated bundle index.
- Run `npm run i18n:check` and the i18n unit tests before opening a PR.

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

If Docker/PostgreSQL are not available locally, use the self-contained E2E
runner. It starts a temporary SQLite-backed backend on port 8100 and a Next.js
frontend on port 3100, then runs Playwright against that isolated app:

```bash
cd frontend
npm run e2e:local
```

### Backend

```bash
cd backend
source .venv/bin/activate
pytest
```

If your change touches authentication, DAV, invitations, admin flows, or data integrity, prefer adding or updating backend tests near the affected area.

### Repository contracts

The root `tests/` folder checks the public surfaces: workflow gates, Docker examples, the product page, Home Assistant examples, and the documentation layout. Run it from the repository root after changing docs, workflows, or public examples:

```bash
python3 -m pytest tests -q
```

## Where changes should go

### Product and feature changes

- backend routes and domain logic: `backend/app/`
- backend tests: `backend/tests/`
- frontend screens and UI behavior: `frontend/components/`, `frontend/hooks/`, `frontend/lib/`
- frontend unit tests: `frontend/__tests__/`
- frontend end-to-end coverage: `frontend/e2e/tests/`

### Docs and positioning

The [GitHub Wiki](https://github.com/itsDNNS/tribu/wiki) is the single home for user, operator, and developer documentation. The repository keeps only these Markdown files:

- public first impression and product story: `README.md`
- contributor workflow: `CONTRIBUTING.md`
- security disclosure process: `SECURITY.md`
- pull request template: `.github/pull_request_template.md`

Everything else goes to the matching Wiki page, for example:

- self-hosting and operations: [Self-Hosting](https://github.com/itsDNNS/tribu/wiki/Self-Hosting)
- visual system, design tokens, and layout rules: [Design and Frontend Guidelines](https://github.com/itsDNNS/tribu/wiki/Design-and-Frontend-Guidelines)
- architecture, roadmap, changelog, and plugin details: [Architecture](https://github.com/itsDNNS/tribu/wiki/Architecture), [Roadmap](https://github.com/itsDNNS/tribu/wiki/Roadmap), [Changelog](https://github.com/itsDNNS/tribu/wiki/Changelog), [Plugin Manifest](https://github.com/itsDNNS/tribu/wiki/Plugin-Manifest)

Do not add new Markdown docs or notes to the repository. `docs/` holds only the product page and its images.

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
4. Defensive review notes for auth, integration, export, backup, self-hosted, or shared-device changes
5. Screenshots or recordings for meaningful UI changes

## Documentation updates are part of the job

When you change setup steps, developer workflow, behavior, architecture assumptions, or user-facing flows, update the relevant docs in the same PR. Wiki changes cannot be part of a code PR, so name the Wiki pages that need an update in the PR description.

Do not leave the README, the Wiki, and contributor docs drifting apart.

## Defensive review

Add a short **Defensive review** section to PRs that touch login, sessions, invitations, OIDC, tokens, admin or adult/child boundaries, the Shared Home Display, webhooks and other integrations, server-side fetches, backup, restore, import, export, diagnostics, or self-hosted defaults. Check that:

- the backend enforces the boundary; hiding something in the UI is not enough
- family-scoped queries filter by `family_id` and verify membership or the display device
- payloads, logs, and error messages carry only the fields they need, without emails, tokens, secrets, stack traces, or private deployment details
- display devices keep their own identity and never fall back to a user session
- server-side fetches allow only http and https, check every address and redirect against the private-network setting, and cap size and time
- docs, fixtures, and examples use placeholders, never reusable secrets

```markdown
## Defensive review
- Auth/session boundary: checked, no new user-session behavior.
- Family/device scope: backend queries remain scoped by `family_id` or display token.
- Sensitive data: no emails, tokens, secrets, or private deployment details added to payloads, logs, or docs.
- Follow-ups: none / #123 for the separately scoped gap.
```

When the review finds a gap, open one small, public-safe follow-up issue per gap instead of growing the PR. Do not put exploit steps, tokens, logs, or unvalidated vulnerability claims in public issues.

## Public copy

README, product page, Wiki, and release text are public. Keep them sober and specific:

- describe only what the current release does, backed by source, tests, or current screenshots
- use placeholders for hosts, tokens, and secrets; screenshots use synthetic family data
- do not mention private repositories, private hosts, or internal tooling
- avoid unsupported superlatives, absolute privacy claims, and em dashes

Automated tests cover objective contracts such as metadata, links, assets, and Docker examples. Wording is reviewed by a person, not pinned in tests.

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
