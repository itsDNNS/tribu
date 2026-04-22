<p align="center">
  <img src="docs/assets/logo.svg" alt="Tribu" width="80" />
</p>

<h1 align="center">Tribu</h1>

<p align="center">
  <strong>The private family organizer for real everyday life.</strong><br>
  Shared calendar, tasks, shopping lists, contacts, birthdays, and reminders in one calm home. Self-hosted, bilingual, and built for real family workflows.
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a>&nbsp;&nbsp;&bull;&nbsp;&nbsp;
  <a href="#phone-sync">Phone Sync</a>&nbsp;&nbsp;&bull;&nbsp;&nbsp;
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
  <img src="docs/assets/screenshot-light.png" alt="Dashboard - Morning Mist theme" width="100%" />
</p>

<p align="center">
  <em>Morning Mist theme - content-first dashboard with events, tasks, birthdays, and family context at a glance</em>
</p>

<details>
<summary><strong>More screenshots</strong></summary>

<br>

**Morning Mist (light theme)**

<img src="docs/assets/screenshot-light.png" alt="Dashboard - Morning Mist theme" width="100%" />

**Calendar with day-detail panel and create FAB**

<img src="docs/assets/screenshot-calendar.png" alt="Calendar view" width="100%" />

**Tasks with collapsible form, priorities, and assignees**

<img src="docs/assets/screenshot-tasks.png" alt="Tasks view" width="100%" />

**Shopping with real-time sync and progress bars**

<img src="docs/assets/screenshot-shopping.png" alt="Shopping view" width="100%" />

**Rewards system with child progress tracking**

<img src="docs/assets/screenshot-rewards.png" alt="Rewards view" width="100%" />

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

Most family organizer apps lock your data in their cloud. The privacy-friendly alternatives often make you stitch together separate tools for calendars, lists, contacts, and reminders. Tribu gives your household one shared home for everyday coordination, on your own server and under your control.

- **One calm shared home** - calendar, tasks, shopping, contacts, birthdays, and reminders in one place
- **Private by default** - no mandatory cloud, no third-party SaaS dependency, your data stays on your hardware
- **Built for actual family workflows** - shared planning for routines, errands, school life, household tasks, and family events
- **Works today on desktop and mobile** - responsive interface plus CalDAV/CardDAV phone sync
- **Try before you install** - interactive demo mode with realistic sample data, no backend required
- **Bilingual out of the box** - German and English, lazy-loaded per module

## Why families switch to Tribu

- **Less app patchwork** - replace the usual mix of calendar apps, reminder apps, shopping lists, notes, and chat workarounds
- **More family-native than generic productivity tools** - household members, shared context, birthdays, contacts, and routines belong together
- **More private than cloud-first family apps** - your household data stays under your control
- **More cohesive than DIY stacks** - less glue, less context switching, less setup friction

## What Tribu helps with

- keeping appointments, school events, and family routines in one shared calendar
- assigning tasks without losing track of who is responsible
- managing shopping lists together in real time
- keeping contacts and birthdays in one place
- reducing app sprawl across chats, notes apps, and disconnected cloud tools

## Phone Sync

Tribu supports **CalDAV and CardDAV** for bidirectional phone sync, so calendars and contacts can integrate with mobile devices and DAV-compatible clients.

**Works with:**
- **iPhone / iPad** via the built-in Calendar and Contacts apps
- **Android** via DAV-compatible clients such as **DAVx5**

**What you get:**
- create and edit events on your phone and see them in Tribu
- create and edit contacts on your phone and keep them in sync
- one shared family system instead of separate calendar/contact silos

After setup, open **Settings → Phone sync** in Tribu to copy the CalDAV and CardDAV URLs for each family.

[See the full phone sync setup guide →](docs/self-hosting.md#phone-sync-caldav--carddav)

## Features

### Core Family Workflow

| | |
|---|---|
| **Dashboard** | Today’s events, open tasks, birthday countdowns, family stats, and quick actions |
| **Calendar** | Month/week view, recurring events, ICS import/export, and a focused day-detail panel |
| **Tasks** | Priorities, due dates, assignees, recurring tasks, and overdue tracking |
| **Shopping** | Multiple lists, tap-to-toggle interactions, progress bars, and real-time sync |
| **Contacts** | Alphabetical card grid, colored avatars, CSV import/export, and birthday extraction |
| **Birthdays** | 4-week lookahead, proximity-based countdown colors, and auto-sync from contacts |
| **Notifications** | In-app reminders and alerts for upcoming events, overdue tasks, and household activity |

### Extra Capabilities

| | |
|---|---|
| **Rewards** | Family token economy with earning rules, reward catalog, child progress bars, and Lucide icons |
| **Search** | Global search across events, tasks, shopping, contacts, and birthdays (`Cmd+K`) |
| **Themes** | Morning Mist (light) and Dark |
| **i18n** | English and German out of the box, lazy-loaded per module |
| **Demo mode** | Try the full UI with realistic sample data, no server setup required |
| **Security** | httpOnly cookies, OIDC / SSO, rate limiting, scoped PATs, and non-root containers |

## Quick Start

Run Tribu with Docker Compose on your server, NAS, or homelab setup.

### Option A: Stack UI (Portainer, Dockge, Dockhand)

Create a new stack and paste:

```yaml
name: tribu

services:
  postgres:
    image: postgres:16-alpine
    container_name: tribu-postgres
    restart: unless-stopped
    environment:
      POSTGRES_DB: tribu
      POSTGRES_USER: tribu
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - tribu_pg_data:/var/lib/postgresql/data

  valkey:
    image: valkey/valkey:8-alpine
    container_name: tribu-valkey
    restart: unless-stopped

  backend:
    image: ghcr.io/itsdnns/tribu-backend:latest
    container_name: tribu-backend
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
    container_name: tribu-frontend
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
<summary><strong>Option B: CLI alternative</strong></summary>

```bash
mkdir tribu && cd tribu
curl -LO https://raw.githubusercontent.com/itsDNNS/tribu/main/docker/docker-compose.yml
curl -LO https://raw.githubusercontent.com/itsDNNS/tribu/main/docker/.env.example
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
| [Self-Hosting Guide](docs/self-hosting.md) | Configuration, reverse proxy, backups, updating, troubleshooting |
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

Tribu is **source-available**, but it is **not open source** at this time.

**All rights reserved.**

The repository is public for transparency, feedback, and collaboration, but no open-source license is granted by default.

If you need clarification about usage, redistribution, commercial use, or partnership/licensing options, please contact the maintainer first.

---

<p align="center">
  Built with care by the <a href="https://github.com/itsDNNS">itsDNNS</a> family.
</p>
