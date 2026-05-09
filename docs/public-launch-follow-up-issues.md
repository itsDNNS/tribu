# Public launch follow-up issues

These are focused follow-up issues that can be created from the public launch refresh. Keep each one narrow enough to design, review, test, and ship on its own.

## 1. Add missing screenshot coverage for launch pages

**Problem:** The public surface has strong screenshots for dashboard, calendar, shopping, tasks, rewards, mobile, and auth, but it does not yet show every workflow that now matters to Tribu's positioning.

**Scope:** Add current screenshots for Shared Home Display, recipes, meal plans, school timetables, gifts, templates, activity, settings/admin, and Home Assistant setup examples where safe.

**Acceptance criteria:** Screenshots use demo data, avoid real personal data, render well in README and GitHub Pages, and are referenced from the screenshot tour or feature matrix.

## 2. Evaluate family documents

**Problem:** Some households need one place for school forms, identity documents, medical PDFs, contracts, and other family files.

**Scope:** Explore a documents module with categories, visibility, archive/download, size limits, safe previews, and backup behavior.

**Acceptance criteria:** Access control, file limits, supported types, audit/activity behavior, backup/restore impact, and deletion semantics are defined before implementation.

## 3. Evaluate household notes

**Problem:** Families keep lightweight knowledge in chats and sticky notes: packing lists, house rules, recurring reminders, school notes, and quick checklists.

**Scope:** Explore pinned notes or lightweight Markdown notes tied to family visibility rules.

**Acceptance criteria:** Notes stay simple, searchable, permission-aware, and clearly distinct from tasks, templates, and wiki-style documentation.

## 4. Evaluate budget tracking

**Problem:** Budget and recurring cost tracking can fit household planning, but it introduces sensitive data and must not make Tribu feel like a finance product first.

**Scope:** Explore income/expense tracking, recurring entries, monthly trends, CSV export, and currency handling.

**Acceptance criteria:** Visibility, export, deletion, backups, and sensitive-data handling are explicit. The first slice stays useful without becoming a full accounting system.

## 5. Evaluate richer calendar inputs and attachments

**Problem:** Family calendars often include school PDFs, appointment files, public ICS subscriptions, and source-specific colors.

**Scope:** Explore event attachments, webcal handling, background feed polling, per-source color and visibility, and multi-account external calendar management beyond the current manual external ICS feed support and phone sync story.

**Acceptance criteria:** Remote inputs are treated as untrusted, source URLs do not leak to display surfaces, file limits are defined, and DAV/export behavior is documented.

## 6. Strengthen backup and API confidence

**Problem:** Self-hosters need confidence that data can be backed up, restored, automated, and integrated safely.

**Scope:** Explore admin backup download/restore/schedule controls and a documented OpenAPI surface for integrations.

**Acceptance criteria:** Restore actions are hard to trigger accidentally, secrets are not exposed, token scopes are documented, and examples use placeholders.
