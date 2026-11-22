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
| Two-step sign-in | Optional authenticator app codes (TOTP, RFC 6238) for password logins, 10 single-use recovery codes stored as hashes, 5 wrong codes pause the second step for 15 minutes. A family admin can reset it for a member; `python -m app.reset_mfa <email>` in the backend container resets it for anyone. Single sign-on accounts use the identity provider's MFA. |
| Account recovery | A family admin can reset a member's password in the app, and an admin who forgot their own can run `python -m app.reset_password <email>` in the backend container. Both give a temporary password that must be changed at the next sign-in, and sign the account out everywhere. |
| Sign-ins | Successful sign-ins (password, two-step code, single sign-on) and wrong two-step codes appear in each family's audit log with the method, not the address. A wrong password writes no audit entry, so it costs no more than an unknown email. Every failed attempt writes `Failed sign-in: ip=<address> method=<password\|two-step>` to the backend log, for banning at the reverse proxy (see below). The address is the last `X-Forwarded-For` hop that isn't a trusted proxy, so entries a client puts in front are ignored. |
| Password guessing | After 3 wrong passwords for an email, further attempts must be at least 1 s, then 2 s, 4 s, ... up to 5 minutes apart, however many addresses the guesses come from; each attempt claims the next wait at once, so parallel guesses get one try per wait. It counts per email whether or not an account uses it, so an unknown email answers the same way, and it lives in the rate-limit storage (Valkey when `REDIS_URL` is set). A right password clears the count. During a wait the right password is not checked either, so someone who knows an email and sends a wrong guess whenever a wait runs out keeps its owner out for as long as they keep going. Every guess that gets through writes the failed sign-in log line, so fail2ban or similar can ban those addresses. |
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

### Banning repeated failed sign-ins

fail2ban, CrowdSec or similar can read the backend log (`docker logs <backend-container>`) and ban addresses that keep failing. For fail2ban:

```ini
[Definition]
failregex = Failed sign-in: ip=<HOST> method=
```

The backend only sees the address of whatever passed the request on: Tribu's own frontend container, and any reverse proxy in front of it. Set `TRUSTED_PROXY_CIDRS` to cover both (for a standard Docker setup, the Docker networks, for example `172.16.0.0/12`), or every line shows the same internal address and a ban locks everyone out. Only do this with a reverse proxy in front that sets `X-Forwarded-For`; without one, clients could put any address there.

## Defensive Review

Feature work that touches authentication, integrations, exports, backups, self-hosted deployment, or shared-device surfaces should include the defensive review described in [CONTRIBUTING.md](CONTRIBUTING.md#defensive-review).
It lists the boundaries to check and explains when to create narrow, public-safe follow-up issues.

## Production Deployment Checklist

Follow these steps before exposing Tribu to the internet:

1. **TLS termination**: Place Tribu behind a reverse proxy (Caddy, nginx, or Traefik) with a valid TLS certificate. Caddy handles this automatically with Let's Encrypt.
2. **Check secure cookies**: With the default `SECURE_COOKIES=auto`, auth cookies get the `Secure` flag whenever the browser reaches Tribu over HTTPS, including behind a proxy that sends `X-Forwarded-Proto`. Set `SECURE_COOKIES=true` to enforce it regardless of what the proxy reports.
3. **Generate strong secrets**: Use `openssl rand -hex 32` for `JWT_SECRET` and `openssl rand -hex 16` for `POSTGRES_PASSWORD`. Never reuse secrets across instances.
4. **Keep direct backend access narrow**: Browsers normally reach the backend through the frontend on the same origin. Only list origins you control in `CORS_ALLOWED_ORIGINS`, and leave `CORS_ALLOW_LAN_ORIGINS` off unless you deliberately serve the backend to `192.168.x.x` browser origins.
5. **Backups**: Schedule regular PostgreSQL backups and test restore procedures. The [Backup & Restore guide](https://github.com/itsDNNS/tribu/wiki/Backup-&-Restore) documents the supported operations flow.
6. **Keep images updated**: Rebuild Docker images periodically to pick up security patches in base images and dependencies.

## Known Limitations

| Limitation | Context |
|------------|---------|
| No HTTPS in dev | Cookies follow the request scheme by default, so plain-HTTP development keeps working without the `Secure` flag. |
| No CSRF token | `SameSite=Lax` plus a Fetch Metadata check: cookie-authenticated requests that another site starts, including other apps on the same host, are rejected. Top-level links, native apps, DAV clients and bearer tokens are not affected; origins in `CORS_ALLOWED_ORIGINS` are trusted. |
| No email verification | Registration does not require email confirmation. |
| No account lockout | Failed login attempts are rate-limited but do not lock accounts. |

## Docker Security

The frontend image runs as the dedicated non-root `tribu` user. The backend image creates the same user and the entrypoint drops privileges with `gosu` when the runtime supports it; in constrained environments where `gosu` is unavailable, the backend logs that it is running as root. The Docker Compose configuration does not expose database or cache ports to the host, keeping PostgreSQL and Valkey accessible only within the Docker network.

Build artifacts are minimized through:
- Multi-stage builds for the frontend (build step separated from runtime)
- `.dockerignore` files excluding development files, git history, and documentation from images
