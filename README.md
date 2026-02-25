<p align="center">
  <img src="docs/assets/logo.svg" alt="Tribu" width="80" />
</p>

<h1 align="center">Tribu</h1>

<p align="center">
  <strong>Self-hosted family organizer to tame the everyday chaos.</strong><br>
  Calendars, tasks, shopping lists, contacts, birthdays &mdash; one place, your server, your data.
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a>&nbsp;&nbsp;&bull;&nbsp;&nbsp;
  <a href="https://github.com/itsDNNS/tribu/wiki">Wiki</a>&nbsp;&nbsp;&bull;&nbsp;&nbsp;
  <a href="https://github.com/itsDNNS/tribu/wiki/Contributing">Contributing</a>&nbsp;&nbsp;&bull;&nbsp;&nbsp;
  <a href="https://github.com/itsDNNS/tribu/wiki/Roadmap">Roadmap</a>&nbsp;&nbsp;&bull;&nbsp;&nbsp;
  <a href="https://github.com/itsDNNS/tribu/wiki/Changelog">Changelog</a>
</p>

<p align="center">
  <a href="https://ko-fi.com/itsdnns"><img src="https://img.shields.io/badge/Ko--fi-Support%20Tribu-FF5E5B?logo=ko-fi&logoColor=white" alt="Ko-fi"></a>&nbsp;
  <a href="https://paypal.me/itsDNNS"><img src="https://img.shields.io/badge/PayPal-Donate-0070BA?logo=paypal&logoColor=white" alt="PayPal"></a>&nbsp;
  <a href="https://github.com/sponsors/itsDNNS"><img src="https://img.shields.io/badge/GitHub-Sponsor-EA4AAA?logo=github-sponsors&logoColor=white" alt="GitHub Sponsors"></a>
</p>

---

<p align="center">
  <img src="docs/assets/screenshot-dark.png" alt="Dashboard - Midnight Glass theme" width="100%" />
</p>

<p align="center">
  <em>Midnight Glass theme &mdash; glassmorphism, bento grid dashboard, mesh background</em>
</p>

<details>
<summary><strong>More screenshots</strong></summary>

<br>

**Morning Mist (light theme)**

<img src="docs/assets/screenshot-light.png" alt="Dashboard - Morning Mist theme" width="100%" />

**Calendar with day-detail panel**

<img src="docs/assets/screenshot-calendar.png" alt="Calendar view" width="100%" />

**Tasks with priorities, assignees, and overdue tracking**

<img src="docs/assets/screenshot-tasks.png" alt="Tasks view" width="100%" />

**Login page**

<img src="docs/assets/screenshot-auth.png" alt="Login page" width="100%" />

**Mobile (390px)**

<p align="center">
  <img src="docs/assets/screenshot-mobile.png" alt="Mobile dashboard" width="320" />
</p>

See the [Wiki](https://github.com/itsDNNS/tribu/wiki) for screenshots of every view and theme.

</details>

---

## Why Tribu?

Most family organizer apps lock your data in their cloud and charge monthly fees. Tribu runs on your own hardware, gives you full control, and costs nothing.

- **Privacy first** &mdash; all data stays on your server, no third-party services
- **Modular** &mdash; each feature is an isolated plugin, extend what you need
- **Beautiful** &mdash; three polished themes with glassmorphism, animations, and responsive design
- **Bilingual** &mdash; German and English out of the box, lazy-loaded per module
- **Try before you install** &mdash; interactive demo mode with realistic sample data, no backend needed

## Features

| | |
|---|---|
| **Dashboard** | Bento grid with today's events, open tasks, birthday countdowns, and family stats |
| **Calendar** | Month/week view, event dots, day-detail panel, recurring events, ICS import/export |
| **Tasks** | Priorities, due dates, assignees, recurring tasks, overdue tracking |
| **Shopping** | Multiple lists, tap-to-toggle items, real-time sync via WebSocket |
| **Contacts** | Card grid with colored avatars, CSV import/export, birthday extraction |
| **Birthdays** | 4-week lookahead with countdown, auto-synced from contacts |
| **Notifications** | In-app feed with event reminders, overdue tasks, and birthday alerts |
| **Themes** | Morning Mist (light), Dark, Midnight Glass (glassmorphism) |
| **i18n** | English and German out of the box, lazy-loaded per module |
| **Demo mode** | Try the full UI with realistic sample data, no server setup required |
| **Security** | httpOnly cookies, rate limiting, scoped PATs, non-root containers |

## Quick Start

Create a new stack in **Portainer**, **Dockge**, or **Dockhand** and paste:

```yaml
name: tribu

services:
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB: tribu
      POSTGRES_USER: tribu
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - tribu_pg_data:/var/lib/postgresql/data

  valkey:
    image: valkey/valkey:8-alpine
    restart: unless-stopped

  backend:
    image: ghcr.io/itsdnns/tribu-backend:latest
    restart: unless-stopped
    environment:
      DATABASE_URL: postgresql://tribu:${POSTGRES_PASSWORD}@postgres:5432/tribu
      REDIS_URL: redis://valkey:6379/0
      JWT_SECRET: ${JWT_SECRET}
      SECURE_COOKIES: ${SECURE_COOKIES:-false}
    depends_on: [postgres, valkey]
    ports: ["8000:8000"]
    volumes:
      - tribu_backups:/backups

  frontend:
    image: ghcr.io/itsdnns/tribu-frontend:latest
    restart: unless-stopped
    depends_on: [backend]
    ports: ["3000:3000"]

volumes:
  tribu_pg_data:
  tribu_backups:
```

Set two environment variables (generate with `openssl rand -hex 32`):

| Variable | Description |
|----------|-------------|
| `JWT_SECRET` | Random 64-char hex string for JWT signing |
| `POSTGRES_PASSWORD` | Random 32-char hex string for the database |

Deploy the stack, open [localhost:3000](http://localhost:3000), and register.

> The first user to register becomes the family **admin**.
>
> Want to explore first? Click **Try demo** on the login page.

<details>
<summary><strong>CLI alternative</strong></summary>

```bash
mkdir tribu && cd tribu
curl -LO https://raw.githubusercontent.com/itsDNNS/tribu/main/infra/docker-compose.yml
curl -LO https://raw.githubusercontent.com/itsDNNS/tribu/main/infra/.env.example
cp .env.example .env
# Fill in JWT_SECRET and POSTGRES_PASSWORD
docker compose up -d
```

</details>

> **Development setup?** See [Contributing](https://github.com/itsDNNS/tribu/wiki/Contributing) for building from source.

## Tech Stack

**Frontend:** Next.js 16, React 19, Lucide Icons, CSS custom properties<br>
**Backend:** FastAPI, SQLAlchemy, Python 3.13+<br>
**Database:** PostgreSQL 16<br>
**Cache:** Valkey 8<br>
**Deployment:** Docker Compose, multi-arch images (amd64/arm64) on GHCR

## Documentation

| | |
|---|---|
| [Wiki](https://github.com/itsDNNS/tribu/wiki) | Screenshots, features, themes, getting started |
| [Architecture](https://github.com/itsDNNS/tribu/wiki/Architecture) | Backend modules, frontend patterns, security, API reference |
| [Plugin Manifest](https://github.com/itsDNNS/tribu/wiki/Plugin-Manifest) | How to build feature, theme, and language plugins |
| [Roadmap](https://github.com/itsDNNS/tribu/wiki/Roadmap) | Development phases and planned features |
| [Contributing](https://github.com/itsDNNS/tribu/wiki/Contributing) | Dev setup, project structure, PR guidelines |
| [Security](SECURITY.md) | Security policy and responsible disclosure |
| [Changelog](https://github.com/itsDNNS/tribu/wiki/Changelog) | Release history |

## Support

If Tribu helps your family stay organized, consider supporting development:

- [Ko-fi](https://ko-fi.com/itsdnns)
- [PayPal](https://paypal.me/itsDNNS)
- [GitHub Sponsors](https://github.com/sponsors/itsDNNS)

## License

Private project. All rights reserved.

---

<p align="center">
  Built with care by the <a href="https://github.com/itsDNNS">itsDNNS</a> family.
</p>
