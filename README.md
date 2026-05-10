<p align="center">
  <img src="docs/assets/logo.svg" alt="Tribu" width="80" />
</p>

<h1 align="center">Tribu</h1>

<p align="center">
  <strong>A calm home base for busy households.</strong><br>
  Calendar, tasks, shopping, contacts, birthdays, routines, meals, rewards, and the everyday details that keep family life moving.
</p>

<p align="center">
  <a href="https://itsdnns.github.io/tribu/"><strong>Product page</strong></a>&nbsp;&nbsp;&bull;&nbsp;&nbsp;
  <a href="#quick-start">Quick Start</a>&nbsp;&nbsp;&bull;&nbsp;&nbsp;
  <a href="https://github.com/itsDNNS/tribu/wiki">Documentation Wiki</a>&nbsp;&nbsp;&bull;&nbsp;&nbsp;
  <a href="#phone-sync">Phone Sync</a>&nbsp;&nbsp;&bull;&nbsp;&nbsp;
  <a href="#shared-home-display">Wall Display</a>&nbsp;&nbsp;&bull;&nbsp;&nbsp;
  <a href="https://github.com/itsDNNS/tribu/wiki/Roadmap">Roadmap</a>
</p>

<p align="center">
  <a href="https://github.com/itsDNNS/tribu/releases"><img src="https://img.shields.io/github/v/release/itsDNNS/tribu?label=release" alt="Latest release"></a>&nbsp;
  <a href="https://github.com/itsDNNS/tribu/pkgs/container/tribu-frontend"><img src="https://img.shields.io/badge/GHCR-frontend-0f766e?logo=github" alt="GHCR frontend image"></a>&nbsp;
  <a href="https://github.com/itsDNNS/tribu/pkgs/container/tribu-backend"><img src="https://img.shields.io/badge/GHCR-backend-0f766e?logo=github" alt="GHCR backend image"></a>&nbsp;
  <a href="docker/docker-compose.yml"><img src="https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white" alt="Docker Compose"></a>&nbsp;
  <a href="frontend/public/manifest.json"><img src="https://img.shields.io/badge/PWA-installable-5A0FC8" alt="Installable PWA"></a>&nbsp;
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT License"></a>
</p>

<p align="center">
  <strong>Self-hosted</strong>&nbsp;&nbsp;&bull;&nbsp;&nbsp;Demo mode&nbsp;&nbsp;&bull;&nbsp;&nbsp;Shared Home Display&nbsp;&nbsp;&bull;&nbsp;&nbsp;CalDAV/CardDAV&nbsp;&nbsp;&bull;&nbsp;&nbsp;Home Assistant&nbsp;&nbsp;&bull;&nbsp;&nbsp;24 languages&nbsp;&nbsp;&bull;&nbsp;&nbsp;MIT licensed
</p>

---

<p align="center">
  <img src="docs/assets/screenshot-hero-mobile.png" alt="Tribu mobile dashboard" width="100%" />
</p>

<p align="center">
  <em>A quick daily view for the things your household needs today.</em>
</p>

<p align="center">
  <img src="docs/assets/screenshot-light.png" alt="Tribu desktop dashboard" width="100%" />
</p>

<p align="center">
  <em>A desktop command center for planning the week, sharing responsibility, and keeping everyone on the same page.</em>
</p>

## Why Tribu?

Family life usually ends up split across calendars, chats, notes, shopping apps, and memory. Tribu brings the daily moving parts into one self-hosted home base your family can actually use.

- Plan the week without bouncing between apps.
- Make tasks, routines, meals, school, gifts, and responsibilities visible.
- Keep shopping lists, contacts, birthdays, rewards, and reminders close to the calendar.
- Put a read-only family dashboard on a kitchen tablet or hallway display.
- Sync calendars and contacts to phones with CalDAV and CardDAV.
- Connect automations through Home Assistant, webhooks, and scoped API tokens.

## Best fit for

### Households that want less scattered planning

Use Tribu when your family needs one shared place for appointments, chores, groceries, birthdays, school details, dinner plans, gifts, and the small reminders that otherwise live in someone's head.

### Self-hosters who want a useful product, not just a stack

Tribu runs with Docker Compose, published GHCR images, PostgreSQL, Valkey, and clear operations docs. You keep the setup on hardware you control, but the product still focuses on the people using it every day.

## Product tour

<details open>
<summary><strong>Open the screenshot tour</strong></summary>

<br>

**1. Shared Home Display**

<img src="docs/assets/screenshot-shared-display.png" alt="Shared Home Display on a kitchen tablet" width="100%" />

A read-only household display for a kitchen tablet or hallway screen. Pair a display device, give it a revocable display token, and show the day without leaving a personal account signed in.

**2. Desktop planning view**

<img src="docs/assets/screenshot-light.png" alt="Dashboard in the Morning Mist theme" width="100%" />

**3. Meals, recipes, and shopping**

<img src="docs/assets/screenshot-meal-plans.png" alt="Meal planning with recipes and ingredients" width="100%" />

Plan meals next to the rest of the week, keep recurring recipes nearby, and move ingredients toward the shopping list without opening another planning app.

**4. School timetables**

<img src="docs/assets/screenshot-school-timetables.png" alt="School timetable planning in Tribu" width="100%" />

Keep each child's school week next to the rest of the family calendar, with lesson times, breaks, and assigned children in one place.

**5. Phone sync**

<img src="docs/assets/screenshot-phone-sync.png" alt="CalDAV and CardDAV phone sync settings" width="100%" />

Sync calendars and contacts through CalDAV and CardDAV. iOS works with the built-in Calendar and Contacts apps. Android works through a DAV-compatible client such as DAVx5.

**6. Home Assistant and webhooks**

<img src="docs/assets/screenshot-home-assistant-webhooks.png" alt="Automation webhook settings for Home Assistant" width="100%" />

Send selected Tribu events to automation tools such as Home Assistant through scoped webhooks with redacted endpoint details and secret headers.

**7. Birthdays and gift ideas**

<img src="docs/assets/screenshot-gifts.png" alt="Gift ideas and birthdays in Tribu" width="100%" />

Keep birthdays and gift ideas close to the rest of household planning instead of maintaining another spreadsheet.

**8. Recipes for the week**

<img src="docs/assets/screenshot-recipes.png" alt="Recipes in Tribu" width="100%" />

Keep family recipes organized, searchable, and ready for meal planning.

See the [Wiki](https://github.com/itsDNNS/tribu/wiki) for setup guides and the broader product documentation.

</details>

## What Tribu covers today

| Household job | Shipped in Tribu |
|---|---|
| See the day | Dashboard, activity, birthdays, reminders, quick actions |
| Plan the week | Calendar, recurring events, school timetables, meal plans |
| Share responsibility | Tasks, assignees, priorities, due dates, recurrence, templates |
| Shop and cook | Shopping lists, recipes, meal plans, ingredient handoff |
| Remember people and dates | Contacts, birthdays, gifts, profile details |
| Motivate routines | Rewards, earning rules, reward catalog, child progress |
| Find things fast | Global search across household data |
| Put it on a shared screen | Pairable Shared Home Display with read-only display tokens |
| Keep phones connected | CalDAV and CardDAV sync for calendars and contacts |
| Automate the household | Home Assistant package, webhooks, scoped API tokens |
| Run it yourself | Docker Compose, GHCR images, backup docs, reverse proxy docs, MIT license |
| Use it in your language | 24 UI languages |

## Phone Sync

Tribu supports CalDAV and CardDAV for bidirectional phone sync, so calendars and contacts can work with mobile devices and DAV-compatible clients.

**Works with:**

- iPhone and iPad through the built-in Calendar and Contacts apps
- Android through DAV-compatible clients such as DAVx5
- DAV servers and clients documented in the [Self-Hosting guide](https://github.com/itsDNNS/tribu/wiki/Self-Hosting#phone-sync-caldav--carddav)

After setup, open **Settings -> Phone sync** in Tribu to copy the CalDAV and CardDAV URLs for each family.

## Shared Home Display

Tribu can turn a kitchen tablet, hallway screen, or wall display into a shared family dashboard without signing in as a real person.

A display is a device, not a fake family member. Admins pair a dedicated display device, the tablet receives a revocable read-only token, and `/display` shows selected household information without loading the normal app shell, profile flows, notifications center, settings, user IDs, emails, or calendar source URLs.

[See the Shared Home Display setup guide](https://github.com/itsDNNS/tribu/wiki/Shared-Home-Display).

## Start in the way that fits you

- **Feel the product first:** open Tribu and click **Try demo** on the login page for realistic sample data.
- **Deploy in your stack:** use the Docker Compose quick start below or paste the stack into Portainer, Dockge, or Dockhand.
- **Set up phone sync:** add the CalDAV and CardDAV URLs to iOS, iPadOS, Android, or a DAV-compatible client.
- **Pair a shared display:** create a display under Admin -> Displays and open the pairing link on the tablet.
- **Connect Home Assistant:** use the [Home Assistant guide](https://github.com/itsDNNS/tribu/wiki/Home-Assistant) for sensors, quick capture, webhooks, and dashboard examples.

## Quick Start

Run Tribu with Docker Compose on a server, NAS, mini PC, or homelab box.

### Option A: stack UI

Use this when you prefer Portainer, Dockge, Dockhand, or another stack editor.

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
      JWT_EXPIRE_HOURS: ${JWT_EXPIRE_HOURS:-24}
      REFRESH_TOKEN_EXPIRE_DAYS: ${REFRESH_TOKEN_EXPIRE_DAYS:-30}
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

Set two environment variables before deploying:

| Variable | Description |
|---|---|
| `JWT_SECRET` | Random 64-character hex string for JWT signing. Keep it stable in the persisted `.env` so routine updates do not end active sessions. |
| `POSTGRES_PASSWORD` | Random 32-character hex string for the database. |

Generate the values and write them into `.env`:

```bash
python3 - <<'PY'
from pathlib import Path
import secrets

env = Path(".env")
text = env.read_text()
text = text.replace("JWT_SECRET=", f"JWT_SECRET={secrets.token_hex(32)}", 1)
text = text.replace("POSTGRES_PASSWORD=", f"POSTGRES_PASSWORD={secrets.token_hex(16)}", 1)
env.write_text(text)
PY
```

Deploy the stack, open [localhost:3000](http://localhost:3000), and register. The first user becomes the family admin.

### Option B: CLI

```bash
mkdir tribu && cd tribu
curl -LO https://raw.githubusercontent.com/itsDNNS/tribu/main/docker/docker-compose.yml
curl -LO https://raw.githubusercontent.com/itsDNNS/tribu/main/docker/.env.example
cp .env.example .env
# Fill in JWT_SECRET and POSTGRES_PASSWORD
docker compose up -d
```

For HTTPS, secure cookies, backups, updates, rollback, phone sync, and troubleshooting, use the [Self-Hosting guide](https://github.com/itsDNNS/tribu/wiki/Self-Hosting).

## Tech stack

- **Frontend:** Next.js 16, React 19, Lucide Icons, CSS custom properties
- **Backend:** FastAPI, SQLAlchemy, Python 3.13+
- **Database:** PostgreSQL 16
- **Cache:** Valkey 8
- **Deployment:** Docker Compose, multi-arch GHCR images for amd64 and arm64

## Project signals

- Versioned releases and release notes
- Published frontend and backend container images
- MIT license
- Security policy and responsible disclosure path
- Public roadmap, changelog, and Discussions
- Wiki guides for self-hosting, backup and restore, Home Assistant, phone sync, shared display, SSO, and architecture

## Documentation

Use the [GitHub Wiki](https://github.com/itsDNNS/tribu/wiki) as the primary documentation entry point for setup, self-hosting, operations, integrations, troubleshooting, roadmap, and release-oriented guides.

| Need | Start here |
|---|---|
| Product overview | [Product page](https://itsdnns.github.io/tribu/) and this README |
| Full docs | [Documentation Wiki](https://github.com/itsDNNS/tribu/wiki) |
| Install and operate | [Self-Hosting](https://github.com/itsDNNS/tribu/wiki/Self-Hosting) |
| Shared display | [Shared Home Display](https://github.com/itsDNNS/tribu/wiki/Shared-Home-Display) |
| Home Assistant | [Home Assistant](https://github.com/itsDNNS/tribu/wiki/Home-Assistant) |
| Contribute | [Contributing](CONTRIBUTING.md) |
| Security reports | [Security Policy](SECURITY.md) |
| Releases | [Releases](https://github.com/itsDNNS/tribu/releases) |

## Support

If Tribu helps your family stay organized, consider supporting development.

If you are a self-hoster or contributor, starring the repo, opening issues, improving docs, joining Discussions, or contributing code all help make the project stronger too.

- [Ko-fi](https://ko-fi.com/itsdnns)
- [PayPal](https://paypal.me/itsDNNS)
- [GitHub Sponsors](https://github.com/sponsors/itsDNNS)

## License

Tribu is released under the **MIT License**. See [LICENSE](LICENSE) for the full text.

---

<p align="center">
  Built with care by the <a href="https://github.com/itsDNNS">itsDNNS</a> family.
</p>
