# Self-hosted directory submission draft

Use this as source copy when submitting Tribu to self-hosted directories, community lists, launch posts, or package catalogs. Adjust the format to each directory's rules.

## Basic listing

- **Name:** Tribu
- **Website:** https://itsdnns.github.io/tribu/
- **Source code:** https://github.com/itsDNNS/tribu
- **License:** MIT
- **Demo:** Built-in demo mode is available from the login screen after running the app.
- **Install:** Docker Compose with published GHCR frontend and backend images
- **Primary audience:** Families and small households that want a self-hosted organizer

## Short description

Self-hosted family organizer for calendars, tasks, shopping, contacts, birthdays, meal planning, rewards, reminders, phone sync, Home Assistant, and a read-only shared home display.

## Longer description

Tribu is a self-hosted family organizer for busy households. It brings shared calendars, tasks, shopping lists, contacts, birthdays, reminders, rewards, school timetables, recipes, meal plans, gifts, activity, and search into one calm home base.

It runs with Docker Compose, uses published frontend and backend images, and keeps family data on infrastructure you control. Tribu also supports CalDAV and CardDAV phone sync, Home Assistant integrations, webhooks, scoped API tokens, 24 UI languages, and a pairable read-only Shared Home Display for kitchen tablets or wall screens.

## Suggested tags

- Self-hosted
- Family organizer
- Calendar
- Tasks
- Shopping list
- Meal planning
- Contacts
- Birthdays
- Home Assistant
- CalDAV
- CardDAV
- Docker Compose
- PWA
- Homelab

## Platform and requirements

- Docker and Docker Compose
- PostgreSQL 16
- Valkey 8
- Frontend image: `ghcr.io/itsdnns/tribu-frontend`
- Backend image: `ghcr.io/itsdnns/tribu-backend`
- Works behind a reverse proxy for HTTPS and secure cookies

## Data and privacy notes

- Runs on the operator's own server or NAS.
- Uses httpOnly cookies for browser sessions.
- Supports scoped personal access tokens for integrations.
- Shared Home Display uses dedicated display tokens instead of normal user accounts.
- Backup and restore guidance is documented in the Wiki.
- No public cloud account is required by the project.

## Screenshot list

Use these repo-local screenshots or regenerate current ones before submission:

- `docs/assets/screenshot-hero-mobile.png`
- `docs/assets/screenshot-mobile.png`
- `docs/assets/screenshot-light.png`
- `docs/assets/screenshot-dark.png`
- `docs/assets/screenshot-calendar.png`
- `docs/assets/screenshot-shopping.png`
- `docs/assets/screenshot-tasks.png`
- `docs/assets/screenshot-rewards.png`
- `docs/assets/screenshot-auth.png`
- `docs/assets/og-image.png`

## Directory checklist

- [ ] Directory allows projects younger than its minimum age requirement.
- [ ] Installation instructions work from a clean host.
- [ ] Latest release is current.
- [ ] README and product page use the same short description.
- [ ] Screenshots are current and do not expose real family data.
- [ ] Tags match the directory taxonomy.
- [ ] Submission copy does not compare against another named project.
