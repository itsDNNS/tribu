<p align="center">
  <img src="docs/assets/logo.svg" alt="Tribu" width="80" />
</p>

<h1 align="center">Tribu</h1>

<p align="center">
  <strong>The self-hosted family organizer that makes a busy household feel under control.</strong><br>
  Shared calendar, tasks, shopping lists, contacts, birthdays, and reminders in one calm home base, on your server, with your data.
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a>&nbsp;&nbsp;&bull;&nbsp;&nbsp;
  <a href="#phone-sync">Phone Sync</a>&nbsp;&nbsp;&bull;&nbsp;&nbsp;
  <a href="https://github.com/itsDNNS/tribu/wiki">Wiki</a>&nbsp;&nbsp;&bull;&nbsp;&nbsp;
  <a href="CONTRIBUTING.md">Contributing</a>&nbsp;&nbsp;&bull;&nbsp;&nbsp;
  <a href="https://github.com/itsDNNS/tribu/wiki/Roadmap">Roadmap</a>&nbsp;&nbsp;&bull;&nbsp;&nbsp;
  <a href="https://github.com/itsDNNS/tribu/wiki/Changelog">Changelog</a>
</p>

<p align="center">
  <strong>Self-hosted</strong>&nbsp;&nbsp;&bull;&nbsp;&nbsp;Docker Compose&nbsp;&nbsp;&bull;&nbsp;&nbsp;Demo mode&nbsp;&nbsp;&bull;&nbsp;&nbsp;CalDAV/CardDAV sync&nbsp;&nbsp;&bull;&nbsp;&nbsp;English + German&nbsp;&nbsp;&bull;&nbsp;&nbsp;MIT licensed
</p>

<p align="center">
  <a href="https://ko-fi.com/itsdnns"><img src="https://img.shields.io/badge/Ko--fi-Support%20Tribu-FF5E5B?logo=ko-fi&logoColor=white" alt="Ko-fi"></a>&nbsp;
  <a href="https://paypal.me/itsDNNS"><img src="https://img.shields.io/badge/PayPal-Donate-0070BA?logo=paypal&logoColor=white" alt="PayPal"></a>&nbsp;
  <a href="https://github.com/sponsors/itsDNNS"><img src="https://img.shields.io/badge/GitHub-Sponsor-EA4AAA?logo=github-sponsors&logoColor=white" alt="GitHub Sponsors"></a>
</p>

---

<p align="center">
  <img src="docs/assets/screenshot-hero-mobile.png" alt="Tribu mobile hero" width="100%" />
</p>

<p align="center">
  <em>A calm, shared home screen for what the household needs today: upcoming events, open tasks, shopping lists, and the details nobody wants to miss</em>
</p>

<p align="center">
  <img src="docs/assets/screenshot-light.png" alt="Desktop family dashboard - Morning Mist theme" width="100%" />
</p>

<p align="center">
  <em>On desktop, Tribu becomes the household command center for planning the week, sharing responsibility, and keeping everyone on the same page</em>
</p>

<details>
<summary><strong>Product tour screenshots</strong></summary>

<br>

**1. The shared mobile view built for quick daily check-ins**

<p align="center">
  <img src="docs/assets/screenshot-mobile.png" alt="Mobile dashboard" width="320" />
</p>

**2. A desktop home base for planning the whole week**

<img src="docs/assets/screenshot-light.png" alt="Dashboard - Morning Mist theme" width="100%" />

**3. A shared calendar for school events, appointments, and family routines**

<img src="docs/assets/screenshot-calendar.png" alt="Calendar view" width="100%" />

**4. Shopping lists that stay in sync across the household**

<img src="docs/assets/screenshot-shopping.png" alt="Shopping view" width="100%" />

**5. Tasks with ownership, priorities, and due dates**

<img src="docs/assets/screenshot-tasks.png" alt="Tasks view" width="100%" />

**6. Rewards that help turn routines into momentum**

<img src="docs/assets/screenshot-rewards.png" alt="Rewards view" width="100%" />

**7. A clean sign-in and onboarding flow that gets families started quickly**

<img src="docs/assets/screenshot-auth.png" alt="Login page" width="100%" />

See the [Wiki](https://github.com/itsDNNS/tribu/wiki) for screenshots of every view and theme.

</details>

---

## Why Tribu?

Most family organizer apps split everyday life across too many places: one calendar here, a shopping app there, tasks in chat, birthdays somewhere else, and household knowledge spread across everyone’s heads. Tribu brings those moving parts together in one self-hosted home base your family can actually use.

It is built for the real rhythm of household life: planning the week, sharing responsibility, keeping shopping in sync, and making sure important dates do not quietly disappear.

- **Self-hosted and privacy-respecting:** keep your family data on hardware you control
- **Covers the everyday essentials:** calendar, tasks, shopping, contacts, birthdays, reminders, and rewards in one place
- **Designed for shared visibility:** the things your household needs are visible on both desktop and mobile
- **Syncs with the devices people already use:** CalDAV and CardDAV support for phones and compatible clients
- **Easy to explore before committing:** interactive demo mode with realistic sample data, no backend required
- **Bilingual and extensible:** German and English out of the box, with plugin support for features, themes, and languages

## Best fit for

### Households that want less friction

Tribu is a strong fit if you want a family organizer that:

- replaces a patchwork of calendar apps, shopping apps, chats, and notes
- gives the whole household shared visibility without giving up data ownership
- feels useful on both quick phone check-ins and bigger desktop planning sessions
- helps everyday planning feel calmer instead of more scattered

### Self-hosters who want a product, not just a project

Tribu is also a strong fit if you want something that:

- runs in your own homelab, on your server, or on a NAS you already trust
- ships as a Docker Compose stack with published frontend and backend images
- integrates with phones through CalDAV and CardDAV instead of trapping data in one web UI
- is readable, inspectable, and documented enough that you can actually own it

## What Tribu helps with

- seeing the week at a glance without bouncing between multiple apps
- making responsibility clear for tasks, routines, and family to-dos
- keeping shared shopping lists in sync while everyone is out and about
- keeping contacts, birthdays, and reminders close to the rest of family planning
- replacing a messy stack of chats, notes, and disconnected cloud tools with one calmer system

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

### Everyday household essentials

| | |
|---|---|
| **Dashboard** | Today’s events, open tasks, birthday countdowns, family stats, and quick actions |
| **Calendar** | Month/week view, recurring events, ICS import/export, and a focused day-detail panel |
| **Tasks** | Priorities, due dates, assignees, recurring tasks, and overdue tracking |
| **Shopping** | Multiple lists, tap-to-toggle interactions, progress bars, and real-time sync |
| **Contacts** | Alphabetical card grid, colored avatars, CSV import/export, and birthday extraction |
| **Birthdays** | 4-week lookahead, proximity-based countdown colors, and auto-sync from contacts |
| **Notifications** | In-app reminders and alerts for upcoming events, overdue tasks, and household activity |

### Power-ups that make it feel complete

| | |
|---|---|
| **Rewards** | Family token economy with earning rules, reward catalog, child progress bars, and Lucide icons |
| **Search** | Global search across events, tasks, shopping, contacts, and birthdays (`Cmd+K`) |
| **Themes** | Morning Mist (light) and Dark |
| **i18n** | English and German out of the box, lazy-loaded per module |
| **Demo mode** | Try the full UI with realistic sample data, no server setup required |
| **Security** | httpOnly cookies, rate limiting, scoped PATs, and non-root containers |

## Start in the way that fits you

- **Want to feel the product first?** Open Tribu and click **Try demo** on the login page to explore the UI with realistic sample data.
- **Want it in your stack fast?** Jump to [Quick Start](#quick-start) and run it with Docker Compose on your server, NAS, or mini PC.
- **Want phone integration from day one?** Use [Phone Sync](#phone-sync) for CalDAV and CardDAV setup with supported clients.
- **Want to inspect how it is built before you commit?** Start with the [Architecture](https://github.com/itsDNNS/tribu/wiki/Architecture) and [Self-Hosting Guide](docs/self-hosting.md).
- **Want to contribute or extend it?** Start with [Contributing](CONTRIBUTING.md), then use the [Plugin Manifest](https://github.com/itsDNNS/tribu/wiki/Plugin-Manifest) for extension-specific details.

## Quick Start

Run Tribu with Docker Compose on a server, NAS, mini PC, or homelab box. If you already run self-hosted services, getting Tribu live should feel familiar.

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

> **Development setup?** See [Contributing](CONTRIBUTING.md) for local workflow, testing, and PR expectations.

## Tech Stack

**Frontend:** Next.js 16, React 19, Lucide Icons, CSS custom properties<br>
**Backend:** FastAPI, SQLAlchemy, Python 3.13+<br>
**Database:** PostgreSQL 16<br>
**Cache:** Valkey 8<br>
**Deployment:** Docker Compose, multi-arch images (amd64/arm64) on GHCR

## Why self-hosters and contributors may want to stay

Tribu is not only trying to be pleasant for families using it. It is also set up to be approachable for people who like reading the stack, self-hosting it properly, and improving it over time.

- **Modern, familiar stack:** Next.js, React, FastAPI, PostgreSQL, and Valkey
- **Real self-hosting path:** Docker Compose deployment, GHCR images, reverse proxy and backup guidance in the docs
- **Architecture and plugin docs:** enough structure to inspect how it works before touching anything
- **Open contribution path:** public roadmap, contributing guide, security policy, and MIT license

## Signals that this is a serious project

- **Versioned releases:** published tags such as `v1.6.1`, `v1.6.0`, and earlier releases show an actual shipping cadence
- **Operational docs:** self-hosting, backups, reverse proxy, architecture, and security guidance are already documented
- **Clear extension path:** plugin manifest and contribution docs make it easier to understand where custom work belongs
- **Public roadmap and changelog:** visitors can see both where Tribu is going and what has already shipped

## Documentation

Use the document that matches your intent:

| | |
|---|---|
| [README](README.md) | Product overview, screenshots, positioning, and quick start |
| [Contributing](CONTRIBUTING.md) | Local dev setup, testing, project boundaries, and PR expectations |
| [Self-Hosting Guide](docs/self-hosting.md) | Configuration, reverse proxy, backups, updating, and troubleshooting |
| [Wiki](https://github.com/itsDNNS/tribu/wiki) | Architecture, roadmap, changelog, plugin details, and reference pages |
| [Security](SECURITY.md) | Security policy and responsible disclosure |

## Support

If Tribu helps your family stay organized, consider supporting development.

If you are a self-hoster or contributor, starring the repo, opening issues, improving docs, or contributing code all help make the project stronger too.

- [Ko-fi](https://ko-fi.com/itsdnns)
- [PayPal](https://paypal.me/itsDNNS)
- [GitHub Sponsors](https://github.com/sponsors/itsDNNS)

## License

Tribu is released under the **MIT License**.

See [LICENSE](LICENSE) for the full text.

---

<p align="center">
  Built with care by the <a href="https://github.com/itsDNNS">itsDNNS</a> family.
</p>
