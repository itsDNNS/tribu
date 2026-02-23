# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability, please report it through [GitHub Security Advisories](https://github.com/itsDNNS/tribu/security/advisories/new). Do **not** open a public issue for security vulnerabilities.

We will acknowledge reports within 48 hours and provide a timeline for fixes.

## Security Features

| Feature | Implementation |
|---------|---------------|
| Password storage | PBKDF2-SHA256 via passlib |
| Password policy | Minimum 8 characters (enforced via Pydantic schema validation) |
| Authentication | httpOnly cookie (JWT HS256), Bearer token fallback for API testing |
| Rate limiting | 10/min for registration, 20/min for login (slowapi) |
| CORS | Restricted to `localhost`, `127.0.0.1`, and `192.168.x.x` via regex |
| Data isolation | All queries filtered by `family_id` with membership verification |
| Docker containers | Non-root user (`tribu`) in both backend and frontend images |
| Docker networking | PostgreSQL and Redis not exposed to host, only accessible within Docker network |
| Build process | Multi-stage frontend build, `.dockerignore` files for both services |
| CSV import | Row limit (500), range checks on month/day fields, email format validation |

## Running Securely

### Required Environment Variables

The backend will **refuse to start** without these variables set:

- `JWT_SECRET`: Used for signing authentication tokens. Generate with `openssl rand -hex 32`.
- `DATABASE_URL`: PostgreSQL connection string. In Docker Compose, this is constructed from `POSTGRES_PASSWORD`.
- `POSTGRES_PASSWORD`: Database password. Generate with `openssl rand -hex 16`.

Never use default or placeholder values for these secrets.

### Recommended Setup

1. Copy `infra/.env.example` to `infra/.env` and generate strong secrets
2. If exposing Tribu to the internet, put it behind a reverse proxy (nginx, Caddy, Traefik) with TLS
3. Keep Docker images up to date for security patches

## Known Limitations

| Limitation | Context |
|------------|---------|
| No HTTPS in dev | Cookies use `secure=False` for local development. Enable `secure=True` when behind TLS. |
| No audit log | User actions are not logged for review. Planned for a future release. |
| No CSRF token | `SameSite=Lax` on cookies provides sufficient protection against cross-origin form submissions. |
| No email verification | Registration does not require email confirmation. |
| No account lockout | Failed login attempts are rate-limited but do not lock accounts. |

## Docker Security

Both the backend and frontend Dockerfiles create a dedicated non-root user (`tribu`) and run all processes under that user. The Docker Compose configuration does not expose database or cache ports to the host, keeping PostgreSQL and Redis accessible only within the Docker network.

Build artifacts are minimized through:
- Multi-stage builds for the frontend (build step separated from runtime)
- `.dockerignore` files excluding development files, git history, and documentation from images
