# Self-Hosting Guide

Everything you need to run Tribu on your own server.

## Prerequisites

- **Docker** with **Compose v2** (`docker compose` — not the legacy `docker-compose`)
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
| `VAPID_PUBLIC_KEY` | *(empty)* | VAPID public key for push notifications. See [Push Notifications](#push-notifications-optional). |
| `VAPID_PRIVATE_KEY` | *(empty)* | VAPID private key for push notifications. |
| `VAPID_CLAIMS_EMAIL` | *(empty)* | Contact email for VAPID claims (e.g. `mailto:admin@example.com`). |
| `REDIS_URL` | `redis://valkey:6379/0` | Connection URL for the Valkey/Redis instance. Only change this if you use an external cache. |
| `JWT_EXPIRE_HOURS` | `24` | How long JWT tokens stay valid, in hours. |

### Docker Compose Internals

These variables are constructed in `docker-compose.yml` and normally don't need manual changes:

| Variable | Value |
|----------|-------|
| `DATABASE_URL` | Built from `POSTGRES_PASSWORD`: `postgresql://tribu:<password>@postgres:5432/tribu` |
| `REDIS_URL` | `redis://valkey:6379/0` (overridable, see above) |

## Reverse Proxy

Running behind a reverse proxy gives you TLS (HTTPS), a clean domain, and is **required** for secure cookies. Set `SECURE_COOKIES=true` in your `.env` when using any of these.

> All examples assume Tribu runs on the same host with the default ports (backend: 8000, frontend: 3000). WebSocket support is needed for real-time shopping list sync.

### Caddy (recommended)

Caddy handles TLS certificates automatically via Let's Encrypt.

```
tribu.example.com {
	handle /api/* {
		reverse_proxy localhost:8000
	}
	handle /ws/* {
		reverse_proxy localhost:8000
	}
	handle {
		reverse_proxy localhost:3000
	}
}
```

### Nginx

```nginx
server {
    listen 443 ssl http2;
    server_name tribu.example.com;

    ssl_certificate     /etc/letsencrypt/live/tribu.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/tribu.example.com/privkey.pem;

    location /api/ {
        proxy_pass http://127.0.0.1:8000;
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
    - "traefik.http.routers.tribu-api.rule=Host(`tribu.example.com`) && (PathPrefix(`/api`) || PathPrefix(`/ws`))"
    - "traefik.http.routers.tribu-api.entrypoints=websecure"
    - "traefik.http.routers.tribu-api.tls.certresolver=letsencrypt"
    - "traefik.http.services.tribu-api.loadbalancer.server.port=8000"
```

When using Traefik, remove the `ports` sections from both services since Traefik handles routing.

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

## Backup & Restore

Tribu has a built-in backup system accessible from the Admin panel.

### Automatic Backups

Configure automatic backups in **Settings > Admin > Backup**:

- **Schedule**: daily, weekly, or monthly
- **Retention**: how many backups to keep (oldest are deleted automatically)

### Backup Format

Each backup is a `tribu-backup-YYYY-MM-DD-HHMMSS.tar.gz` archive containing:

- `database.dump` — PostgreSQL dump (`pg_dump -Fc` custom format)
- `metadata.json` — backup version, Alembic revision, PostgreSQL version, timestamp

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
- Missing `JWT_SECRET` or `POSTGRES_PASSWORD` — the backend exits immediately with an error message
- Port 8000 or 3000 already in use — change the host port in `docker-compose.yml` (e.g. `"8080:8000"`)

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
- Push notifications require HTTPS — they won't work over plain HTTP
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
