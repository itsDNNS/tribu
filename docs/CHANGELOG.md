# Changelog

All notable changes to Tribu are documented here.

## 2026-02-20

### Added

- **Project foundation**: Scaffold with Docker Compose (PostgreSQL 16, Redis 7, FastAPI, Next.js 14)
- **Auth system**: Register, login, JWT sessions, profile image support
- **Family model**: Multi-family memberships with roles (admin, parent, child)
- **Calendar module**: Event CRUD API, monthly grid view with clickable days, dynamic day-detail panels, inline event forms
- **Birthday module**: Dedicated tracker scoped to family, auto-sync from contacts
- **Contacts module**: Family address book, CSV import with automatic birthday extraction
- **Dashboard module**: Summary API showing upcoming events and birthdays within 4 weeks
- **Plugin system**: Manifest spec v1 for features, themes, and language packs
- **Theme engine**: Switchable design tokens (Light, Dark, Midnight Glass)
- **i18n**: German and English, core + module-level language packs with lazy loading
- **App shell**: Modern sidebar navigation with Lucide icons
- **Role model**: First registered user auto-promoted to admin and adult
- **Architecture docs**: Architecture overview, plugin manifest spec, roadmap
