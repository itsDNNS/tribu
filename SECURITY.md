# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability, please report it through [GitHub Security Advisories](https://github.com/itsDNNS/tribu/security/advisories/new). Do **not** open a public issue for security vulnerabilities.

We will acknowledge reports within 48 hours and provide a timeline for fixes.

## Security Features

| Feature | Implementation |
|---------|---------------|
| Password storage | bcrypt (legacy PBKDF2-SHA256 hashes are verified and auto-rehashed on login) |
| Password policy | Minimum 8 characters with at least 1 uppercase letter and 1 digit (enforced via Pydantic schema validation) |
| Authentication | httpOnly cookie (JWT HS256), Bearer token fallback for API testing |
| Rate limiting | 10/min for registration, 20/min for login (slowapi) |
| CORS | Restricted to `localhost`, `127.0.0.1`, and `192.168.x.x` via regex |
| Data isolation | All queries filtered by `family_id` with membership verification |
| Docker containers | Frontend runs as `tribu`; backend creates `tribu` and drops privileges with `gosu` when supported |
| Docker networking | PostgreSQL and Valkey are not exposed to the host and stay inside the Docker network |
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

1. Copy `docker/.env.example` to `docker/.env` and generate strong secrets
2. If exposing Tribu to the internet, put it behind a reverse proxy (nginx, Caddy, Traefik) with TLS
3. Keep Docker images up to date for security patches

## Defensive Review Checklist

Feature work that touches authentication, integrations, exports, backups, self-hosted deployment, or shared-device surfaces should use the [Defensive review checklist](docs/defensive-review-checklist.md).
It gives maintainers a public-safe boundary checklist, links existing coverage, and explains when to create narrow follow-up issues.

## Production Deployment Checklist

Follow these steps before exposing Tribu to the internet:

1. **TLS termination**: Place Tribu behind a reverse proxy (Caddy, nginx, or Traefik) with a valid TLS certificate. Caddy handles this automatically with Let's Encrypt.
2. **Enable secure cookies**: Set `SECURE_COOKIES=true` in your `.env` file. This adds the `Secure` flag to auth cookies so they are only sent over HTTPS.
3. **Generate strong secrets**: Use `openssl rand -hex 32` for `JWT_SECRET` and `openssl rand -hex 16` for `POSTGRES_PASSWORD`. Never reuse secrets across instances.
4. **Restrict CORS** (optional): The default regex allows all `192.168.x.x` addresses. If your instance is public, consider narrowing this to your specific domain by modifying the `allow_origin_regex` in `backend/app/main.py`.
5. **Backups**: Schedule regular PostgreSQL backups and test restore procedures. The [Backup & Restore guide](https://github.com/itsDNNS/tribu/wiki/Backup-&-Restore) documents the supported operations flow.
6. **Keep images updated**: Rebuild Docker images periodically to pick up security patches in base images and dependencies.

## Known Limitations

| Limitation | Context |
|------------|---------|
| No HTTPS in dev | Cookies use `secure=false` for local development. Set `SECURE_COOKIES=true` in `.env` when behind TLS. |
| No CSRF token | `SameSite=Lax` mitigates common cross-origin form submissions. Reassess if cross-site or embedded use cases are added. |
| No email verification | Registration does not require email confirmation. |
| No account lockout | Failed login attempts are rate-limited but do not lock accounts. |

## Docker Security

The frontend image runs as the dedicated non-root `tribu` user. The backend image creates the same user and the entrypoint drops privileges with `gosu` when the runtime supports it; in constrained environments where `gosu` is unavailable, the backend logs that it is running as root. The Docker Compose configuration does not expose database or cache ports to the host, keeping PostgreSQL and Valkey accessible only within the Docker network.

Build artifacts are minimized through:
- Multi-stage builds for the frontend (build step separated from runtime)
- `.dockerignore` files excluding development files, git history, and documentation from images
