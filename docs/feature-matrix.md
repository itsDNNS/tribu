# Tribu feature matrix

This page gives visitors and contributors a quick view of what Tribu ships today, what is being evaluated, and what is intentionally outside the current product shape.

## Shipped

| Area | Capability | Notes |
|---|---|---|
| Dashboard | Daily household overview | Events, open tasks, birthdays, activity, quick actions, and family context. |
| Calendar | Shared calendar | Month and week views, recurring events, ICS import and export, external ICS feed import with manual refresh, day detail panels, and phone sync through CalDAV. |
| Tasks | Responsibilities and routines | Assignees, priorities, due dates, recurrence, templates, and overdue tracking. |
| Shopping | Shared lists | Multiple lists, categories, progress, quick add, and real-time updates. |
| Contacts | Family address book | Contact cards, CSV import and export, birthday extraction, and CardDAV sync. |
| Birthdays | Birthday tracking | Lookahead, countdowns, and sync from contacts. |
| Meal planning | Weekly meals | Meal slots, ingredients, and connection to recipes and shopping. |
| Recipes | Household recipe library | Recipe cards, ingredient scaling, and push-to-shopping support. |
| School timetables | School schedule planning | Timetable views for school routines. |
| Templates | Repeatable household plans | Reusable task and routine templates. |
| Gifts | Gift planning | Gift ideas and planning around family dates. |
| Rewards | Family motivation | Token economy, reward catalog, earning rules, and progress. |
| Notifications | In-app, browser push, and external reminder destinations | Household activity, overdue tasks, upcoming events, and Apprise-backed human reminder channels with encrypted destination URLs and private-host guardrails. |
| Activity | Household timeline | Recent changes and quick context. |
| Search | Global search | Fast lookup across core household data. |
| Shared Home Display | Read-only household screen | Pairable device tokens for kitchen tablets, hallway screens, and wall displays. |
| Phone sync | CalDAV and CardDAV | Calendar and contact sync for phones and DAV-compatible clients. |
| Integrations | Home Assistant, webhooks, API tokens | Automation hooks for self-hosted homes. |
| Self-hosting | Docker Compose and GHCR images | PostgreSQL, Valkey, frontend, backend, backups, reverse proxy, and update docs. |
| Security model | Family boundaries | httpOnly cookies, scoped PATs, display tokens, a non-root frontend container, backend privilege drop when supported, and security policy. |
| Internationalization | 24 UI languages | Bundled locale packs across the app. |

## Planned or under evaluation

These are product areas worth evaluating as focused follow-up issues. They should keep Tribu's family-boundary model, access control, privacy posture, and self-hosting simplicity intact.

| Area | Direction to evaluate | Guardrails |
|---|---|---|
| Family documents | Store household PDFs, images, and school or medical files with categories and visibility controls. | No broad file dump without access-control rules, size limits, archive behavior, and backup expectations. |
| Household notes | Lightweight notes for family knowledge, checklists, and pinned reminders. | Keep notes close to household workflows and avoid becoming a full wiki clone. |
| Budget tracking | Recurring income and expenses, monthly trends, and CSV export. | Treat financial data as sensitive and design export, visibility, and retention carefully. |
| Calendar attachments | Attach images, PDFs, and documents to events where useful. | Enforce file limits, allowed types, backup behavior, and DAV/export expectations. |
| Calendar source management | webcal handling, source colors, background polling, visibility controls, and richer external calendar management. | Treat remote calendar input as untrusted and keep source URLs private. |
| Backup controls | Download, restore, scheduling, retention, and status inside admin flows. | Keep restore paths safe, auditable, and hard to trigger accidentally. |
| OpenAPI docs | Public API contract for integrations. | Document scoped tokens, examples, and redaction rules before encouraging automation. |

## Intentionally out of scope for now

- Cloud-hosted accounts operated by the project.
- Advertising, tracking, or telemetry that phones home from private households.
- A shared display that behaves like a normal signed-in user.
- Broad enterprise project-management workflows that do not fit family life.
- A feature race that makes core household planning harder to understand.
