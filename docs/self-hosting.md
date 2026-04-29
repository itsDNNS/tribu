# Self-Hosting Guide

Everything you need to run Tribu on your own server.

## Use this guide for

- installing Tribu on your own infrastructure
- configuring environment variables, reverse proxy, and phone sync
- backups, updates, and troubleshooting in production-like setups

If you want the public overview, start with the [README](../README.md).
If you want local development workflow, tests, and PR expectations, use [CONTRIBUTING.md](../CONTRIBUTING.md).

## Prerequisites

- **Docker** with **Compose v2** (`docker compose`, not the legacy `docker-compose`)
- **512 MB RAM** minimum, **1 GB disk** for the database volume
- A **domain with TLS** if you plan to expose Tribu to the internet (see [Reverse Proxy](#reverse-proxy))

## Quick Start

The fastest path is the stack snippet in the [README](../README.md#quick-start). It works with Portainer, Dockge, Dockhand, or the CLI.

```bash
mkdir tribu && cd tribu
curl -LO https://raw.githubusercontent.com/itsDNNS/tribu/main/docker/docker-compose.yml
curl -LO https://raw.githubusercontent.com/itsDNNS/tribu/main/docker/.env.example
cp .env.example .env
# Fill in JWT_SECRET and POSTGRES_PASSWORD (see below)
docker compose up -d
```

Open [localhost:3000](http://localhost:3000) and register. The first user becomes the family admin.

## Configuration Reference

All configuration is done through environment variables in your `.env` file.

### Required

| Variable | Description | Generate with |
|----------|-------------|---------------|
| `JWT_SECRET` | Secret key for signing JWT auth tokens | `openssl rand -hex 32` |
| `POSTGRES_PASSWORD` | PostgreSQL database password | `openssl rand -hex 16` |

The backend refuses to start if these are missing.

### Optional

| Variable | Default | Description |
|----------|---------|-------------|
| `SECURE_COOKIES` | `false` | Set to `true` when running behind a TLS reverse proxy. Enables the `Secure` flag on auth cookies. |
| `BASE_URL` | *(auto-detect)* | Public URL of your instance (e.g. `https://tribu.example.com`). Used for push notification payloads. Auto-detected from request headers if not set. |
| `JWT_EXPIRE_HOURS` | `24` | Session lifetime in hours for Tribu's auth tokens and cookies. |
| `ALLOW_OPEN_REGISTRATION` | `false` | Enables public registration after initial setup. Keep disabled for normal self-hosted instances and invite users instead. |
| `SETUP_RESTORE_TOKEN` | empty | Required for initial setup restore. Leave empty to disable setup restore, or set a one-time secret and enter it in the restore screen. |
| `SETUP_RESTORE_MAX_BYTES` | `104857600` | Maximum setup restore archive size in bytes. |
| `VAPID_PUBLIC_KEY` | *(empty)* | VAPID public key for push notifications. See [Push Notifications](#push-notifications-optional). |
| `VAPID_PRIVATE_KEY` | *(empty)* | VAPID private key for push notifications. |
| `VAPID_CLAIMS_EMAIL` | *(empty)* | Contact email for VAPID claims (e.g. `mailto:admin@example.com`). |
| `REDIS_URL` | `redis://valkey:6379/0` | Optional Valkey-compatible cache connection string override. |

### Docker Compose Internals

These variables are constructed in `docker-compose.yml` and normally don't need manual changes:

| Variable | Value |
|----------|-------|
| `DATABASE_URL` | Built from `POSTGRES_PASSWORD`: `postgresql://tribu:<password>@postgres:5432/tribu` |
| `REDIS_URL` | `redis://valkey:6379/0` (overridable, see above) |

## Reverse Proxy

Running behind a reverse proxy gives you TLS (HTTPS), a clean domain, and is **required** for secure cookies. Set `SECURE_COOKIES=true` in your `.env` when using any of these.

> All examples assume Tribu runs on the same host with the default ports (backend: 8000, frontend: 3000). `/api` must be forwarded to the backend **without** the `/api` prefix, while `/dav` and `/.well-known/{caldav,carddav}` must reach the backend unchanged. The `/ws` examples below are required for shopping live sync.
>
> Shopping live sync uses the current frontend origin and the proxied `/ws/shopping/...` path. Ensure your reverse proxy forwards `/ws/*` to the backend with WebSocket upgrade headers.

### Caddy (recommended)

Caddy handles TLS certificates automatically via Let's Encrypt.

```
tribu.example.com {
	handle_path /api/* {
		reverse_proxy localhost:8000
	}
	handle /ws/* {
		reverse_proxy localhost:8000
	}
	handle /dav {
		reverse_proxy localhost:8000
	}
	handle /dav/* {
		reverse_proxy localhost:8000
	}
	handle /.well-known/caldav {
		reverse_proxy localhost:8000
	}
	handle /.well-known/carddav {
		reverse_proxy localhost:8000
	}
	handle {
		reverse_proxy localhost:3000
	}
}
```

### Nginx

If you want the simplest setup, proxy everything to the frontend on port `3000`. Tribu's frontend already rewrites `/api/*`, `/dav*`, and `/.well-known/{caldav,carddav}` to the backend.

```nginx
upstream tribu-app {
    zone tribu-app 64k;
    server 127.0.0.1:3000;
    keepalive 2;
}

map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      "";
}

server {
    listen 443 ssl;
    http2 on;
    server_name tribu.example.com;

    ssl_certificate     /etc/letsencrypt/live/tribu.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/tribu.example.com/privkey.pem;
    client_max_body_size 10M;

    location / {
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_pass http://tribu-app;
        proxy_read_timeout 180s;
    }
}
```

If you prefer handling backend routes directly in nginx, this split setup also works. Keep the trailing slash on `proxy_pass http://127.0.0.1:8000/;` inside `location /api/` so nginx strips the `/api` prefix before forwarding to the backend.

```nginx
server {
    listen 443 ssl;
    http2 on;
    server_name tribu.example.com;

    ssl_certificate     /etc/letsencrypt/live/tribu.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/tribu.example.com/privkey.pem;
    client_max_body_size 10M;

    location /api/ {
        proxy_pass http://127.0.0.1:8000/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /ws/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location = /dav {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /dav/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location = /.well-known/caldav {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location = /.well-known/carddav {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Traefik

Add these labels to the `frontend` service in your `docker-compose.yml`:

```yaml
frontend:
  labels:
    - "traefik.enable=true"
    - "traefik.http.routers.tribu.rule=Host(`tribu.example.com`)"
    - "traefik.http.routers.tribu.entrypoints=websecure"
    - "traefik.http.routers.tribu.tls.certresolver=letsencrypt"
    - "traefik.http.services.tribu.loadbalancer.server.port=3000"
```

And for the `backend` service:

```yaml
backend:
  labels:
    - "traefik.enable=true"
    - "traefik.http.middlewares.tribu-api-strip.stripprefix.prefixes=/api"
    - "traefik.http.routers.tribu-api.rule=Host(`tribu.example.com`) && PathPrefix(`/api`)"
    - "traefik.http.routers.tribu-api.entrypoints=websecure"
    - "traefik.http.routers.tribu-api.tls.certresolver=letsencrypt"
    - "traefik.http.routers.tribu-api.middlewares=tribu-api-strip"
    - "traefik.http.routers.tribu-ws.rule=Host(`tribu.example.com`) && PathPrefix(`/ws`)"
    - "traefik.http.routers.tribu-ws.entrypoints=websecure"
    - "traefik.http.routers.tribu-ws.tls.certresolver=letsencrypt"
    - "traefik.http.routers.tribu-ws.service=tribu-api"
    - "traefik.http.routers.tribu-dav.rule=Host(`tribu.example.com`) && (PathPrefix(`/dav`) || Path(`/.well-known/caldav`) || Path(`/.well-known/carddav`))"
    - "traefik.http.routers.tribu-dav.entrypoints=websecure"
    - "traefik.http.routers.tribu-dav.tls.certresolver=letsencrypt"
    - "traefik.http.routers.tribu-dav.service=tribu-api"
    - "traefik.http.services.tribu-api.loadbalancer.server.port=8000"
```

When using Traefik, remove the `ports` sections from both services since Traefik handles routing. Shopping live sync uses the proxied `/ws` route, so the backend port does not need to be exposed publicly when Traefik handles `/ws`.

## Single Sign-On (OIDC)

Tribu speaks OpenID Connect, so you can delegate authentication to an existing identity provider (Authentik, Zitadel, Keycloak, or any other OIDC-compatible stack).

### 1. Create a client at your provider

Set these values when you register Tribu as an OIDC client:

- **Redirect URI / Callback URL**: `https://<your-tribu-domain>/auth/oidc/callback`
- **Client type**: Confidential (Tribu stores a client secret).
- **Grant type**: Authorization Code with **PKCE (S256)**.
- **Scopes**: `openid profile email` (Tribu needs the `email` + `email_verified` claims to match a login to an existing family member).

Provider-specific hints:

| Provider | Issuer URL shape | Notes |
|----------|------------------|-------|
| Authentik | `https://auth.example.com/application/o/tribu/` | Copy the value of "OpenID Configuration Issuer" from the provider page. The trailing slash matters. |
| Zitadel | `https://<instance>.zitadel.cloud` | Register a "Web" application with PKCE. The issuer is your instance root URL. |
| Keycloak | `https://keycloak.example.com/realms/<realm>` | Create a confidential OIDC client in the realm hosting your users. If the client's `token_endpoint_auth_method` is pinned to `client_secret_basic`, Tribu will fall back to HTTP Basic automatically. |
| Generic | `https://idp.example.com` | Any OIDC-conformant provider with a `/.well-known/openid-configuration` document. |

### 2. Enable SSO in Tribu

Sign in as an admin, open **Admin settings > Single Sign-On**, and fill in:

- **Provider preset**: Pick your provider for better placeholders and the default button label.
- **Issuer URL**: From the table above.
- **Client ID / Client secret**: From your provider.
- **Scopes**: Leave at `openid profile email` unless your provider is unusual.
- **Allow new accounts via SSO**: Required only if you also share SSO-backed invitation links (see below).
- **Disable password login**: Optional. Only takes effect once SSO is fully configured so you cannot lock yourself out.

Use **Test discovery** to verify the provider is reachable before saving.

### 3. User onboarding paths

- **Matching an existing account by email.** When an SSO login arrives for an email that already belongs to a Tribu user, Tribu links the new identity and logs them in. The provider must mark the email as verified (`email_verified=true` in the ID token), otherwise Tribu refuses to link.
- **Invitation-bound signup.** If **Allow new accounts via SSO** is enabled, creating an invitation link via **Admin > Invitations** and sharing it with a new family member lets them finish onboarding entirely through the IdP. The link's preset role + adult flag apply on creation.
- **Local admin recovery.** Password login is preserved as long as **Disable password login** is unchecked. Even if you flip it on, Tribu's `/auth/register-with-invite` and `/auth/login` endpoints only refuse password auth when SSO is *ready* (enabled + issuer + client configured), so mis-configurations never lock out the admin.

### 4. Reverse proxy

All Tribu reverse-proxy examples in this guide already forward `/auth/oidc/*` to the Tribu frontend, which proxies it to the backend. No extra rules are needed. If you use a custom split setup that routes `/api/*` directly to the backend, do **not** route `/auth/oidc/*` directly. Keep it going through the frontend so the callback URL (`/auth/oidc/callback`) matches what your IdP has registered.

### 5. Secret storage

The client secret is stored in Tribu's `system_settings` table as plaintext, the same trust model as `JWT_SECRET` in your `.env`. Put the database volume on encrypted storage if your threat model requires it, and rotate the secret by editing the admin form and clicking **Clear secret** before pasting a new one.

## Push Notifications (Optional)

Tribu supports browser push notifications for event reminders, overdue tasks, and birthday alerts.

### 1. Generate VAPID Keys

```bash
# Requires Node.js
npx web-push generate-vapid-keys
```

This outputs a public key, private key, and a subject line.

### 2. Add to `.env`

```
VAPID_PUBLIC_KEY=BPxr...your-public-key
VAPID_PRIVATE_KEY=your-private-key
VAPID_CLAIMS_EMAIL=mailto:admin@example.com
```

### 3. Restart

```bash
docker compose up -d
```

Users can then enable push notifications from their profile settings. Push notifications require HTTPS (a reverse proxy with TLS).

## Phone Sync (CalDAV / CardDAV)

Tribu can sync calendars and contacts with phones and DAV-compatible clients via **CalDAV** and **CardDAV**.

### Requirements

- A running Tribu instance with a reachable public or local URL
- HTTPS if you want to connect phones outside a trusted local-only setup
- A user account that already belongs to the relevant family
- A **Personal Access Token (PAT)** for DAV login

### Where to find the sync URLs

After signing in to Tribu:

1. Open **Settings**
2. Go to **Phone sync**
3. Copy the **CalDAV** and **CardDAV** URLs for the family you want to sync

Tribu shows one calendar URL and one address book URL per family.

### Authentication

DAV clients use **HTTP Basic Auth** with:

- **Username:** your Tribu email address
- **Password:** a Tribu Personal Access Token (PAT)

Recommended PAT scopes:

- `calendar:read` / `calendar:write`
- `contacts:read` / `contacts:write`

Use read-only scopes if you only want a subscription-style setup. Use write scopes if events and contacts should sync back into Tribu.

### iPhone / iPad setup

For calendars:

1. Open **Settings → Apps → Calendar → Calendar Accounts → Add Account → Other → Add CalDAV Account**
2. Paste the CalDAV URL from **Settings → Phone sync** in Tribu
3. Enter your Tribu email address and PAT
4. Save and allow the device to sync

For contacts:

1. Open **Settings → Apps → Contacts → Contacts Accounts → Add Account → Other → Add CardDAV Account**
2. Paste the CardDAV URL from Tribu
3. Enter your Tribu email address and PAT
4. Save and allow the device to sync

### Android setup

The most common setup is **DAVx5**:

1. Install **DAVx5**
2. Add a new account
3. Choose login with URL and credentials
4. Paste the CalDAV/CardDAV URL from Tribu
5. Sign in with your Tribu email address and PAT
6. Select the collections you want to sync

### What to expect

Once connected, you can:

- create and edit events on your phone and see them in Tribu
- create and edit contacts on your phone and keep them in sync
- use Tribu as the shared source of truth for family calendars and contacts

### Troubleshooting

- Make sure the PAT has the scopes required for the DAV collection you want to use
- If login works in the browser but not in the DAV client, double-check that you are using the **PAT**, not your normal account password
- If you are exposing Tribu through a reverse proxy, confirm HTTPS is working correctly and the public URL is stable
- If the client appears stale after reconnecting, force a refresh/resync in the DAV app once before troubleshooting deeper

## Backup & Restore

Tribu has a built-in backup system accessible from the Admin panel.

### Automatic Backups

Configure automatic backups in **Settings > Admin > Backup**:

- **Schedule**: daily, weekly, or monthly
- **Retention**: how many backups to keep (oldest are deleted automatically)

### Backup Format

Each backup is a `tribu-backup-YYYY-MM-DD-HHMMSS.tar.gz` archive containing:

- `database.dump`: PostgreSQL dump (`pg_dump -Fc` custom format)
- `metadata.json`: backup version, Alembic revision, PostgreSQL version, timestamp

The export is a database backup. It includes Tribu household data such as calendars, tasks, contacts, shopping lists, meal plans, recipes, rewards, gifts, families, members, and app settings stored in the database.

It does not include deployment-level secrets or host files such as `JWT_SECRET`, OIDC client secrets, reverse proxy configuration, TLS certificates, or files outside the database and configured backup volume. Keep your `.env`, Compose file, and reverse proxy configuration in your normal server backup.

### Manual Backup

Trigger a backup from the Admin panel or via API:

```bash
curl -X POST http://localhost:8000/admin/backup/trigger \
  -H "Cookie: tribu_token=<your-jwt>"
```

### Restore

Backups can be restored during the **Setup Wizard** on a fresh installation. Upload a backup archive and Tribu restores the database and runs any pending migrations automatically.

### External Backup Storage

By default, backups are stored in a Docker volume. To store them on a NAS or external drive, replace the volume with a bind mount in your `docker-compose.yml`:

```yaml
backend:
  volumes:
    - /mnt/nas/backups/tribu:/backups
```

### API Endpoints

All backup endpoints require admin privileges.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/admin/backup/config` | Get backup configuration |
| `PUT` | `/admin/backup/config` | Update schedule and retention |
| `POST` | `/admin/backup/trigger` | Trigger manual backup |
| `GET` | `/admin/backup/list` | List all backups |
| `GET` | `/admin/backup/{filename}/download` | Download backup file |
| `DELETE` | `/admin/backup/{filename}` | Delete backup file |

## Updating

```bash
docker compose pull
docker compose up -d
```

Database migrations run automatically on startup via Alembic. No manual migration steps needed.

> **Tip:** Check the [Changelog](https://github.com/itsDNNS/tribu/wiki/Changelog) before updating for any breaking changes.

## Troubleshooting

### Container won't start

Check logs for the failing service:

```bash
docker compose logs backend
docker compose logs frontend
docker compose logs postgres
```

Common causes:
- Missing `JWT_SECRET` or `POSTGRES_PASSWORD`: the backend exits immediately with an error message
- Port 8000 or 3000 already in use: change the host port in `docker-compose.yml` (e.g. `"8080:8000"`)

### Database connection errors

```bash
# Check if PostgreSQL is running
docker compose ps postgres

# Test connection from the backend container
docker compose exec backend python -c "from app.database import engine; engine.connect()"
```

The backend waits for PostgreSQL on startup, but if the database takes too long to initialize (first run), restart the backend:

```bash
docker compose restart backend
```

### Cookies not working behind a reverse proxy

If you can log in but get redirected back to the login page:

1. Make sure `SECURE_COOKIES=true` is set in `.env`
2. Verify your reverse proxy forwards the `X-Forwarded-Proto` header
3. Confirm your browser receives the cookie with the `Secure` flag (DevTools > Application > Cookies)

If running locally without TLS, keep `SECURE_COOKIES=false`.

### Push notifications not working

- VAPID keys must be set in `.env` **and** the backend must be restarted
- Push notifications require HTTPS, so they will not work over plain HTTP
- The user must explicitly enable notifications in their profile settings
- Check browser permissions (Settings > Site permissions > Notifications)

### Rate limiting

The backend applies rate limits to auth endpoints:

| Endpoint | Limit |
|----------|-------|
| `POST /auth/register` | 10 requests/minute |
| `POST /auth/login` | 20 requests/minute |
| `POST /auth/register-with-invite` | 10 requests/minute |

If you hit rate limits during testing, wait 60 seconds or restart the backend container (resets the in-memory rate limiter).
