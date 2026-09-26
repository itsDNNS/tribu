# Tribu feature matrix

This page gives visitors and contributors a quick view of what Tribu ships today, what is being evaluated, and what is intentionally outside the current product shape.

## Shipped

| Area | Capability | Notes |
|---|---|---|
| Dashboard | Daily household overview | Events, direct task completion, daily routine progress, today’s meal plan, birthdays, rewards, activity, and quick capture. Saved module orders are preserved; resetting uses the new default layout. |
| Calendar | Shared calendar | Adaptive month/week/agenda views with complete week rows, mobile day dots and detailed day cards, vertical whole-week planning, agenda range loading, multi-day events, member filters, profile-based family colors with manual overrides, native event dialogs, recurring events and occurrence/series deletion, event duplication, ICS import/export and manual feed refresh, and phone sync through CalDAV. |
| Tasks | Responsibilities and routines | Assignees, priorities, date-only or timed due dates, recurrence, templates, overdue tracking, and opt-in VTODO sync. |
| Shopping | Shared visual lists | Illustrated product tiles, quantity-aware quick add, editable details/photos, per-list department order, favorites/catalog/recent products, Undo, completed-trip history, mobile shopping mode, recipe ingredient selection, templates, real-time updates, and family-configured store search links. |
| Contacts | Family address book | Contact cards, CSV import and export, birthday extraction, and CardDAV sync. |
| Birthdays | Birthday tracking | Lookahead, countdowns, and sync from contacts. |
| Meal planning | Weekly meals | Shared compact day/week selection, meal slots, date-based moves, ingredients, and connection to recipes and shopping. |
| Recipes | Household recipe library | Recipe cards, ingredient scaling, and push-to-shopping support. |
| School timetables | School schedule planning | Timetable views for school routines. |
| Templates | Repeatable household plans | Reusable task and routine templates. |
| Gifts | Gift planning | Gift ideas and planning around family dates. |
| Rewards | Family motivation | Token economy, reward catalog, earning rules, and progress. |
| Notifications | In-app, browser push, and external destinations | Household activity, overdue tasks, upcoming events, and Apprise-backed human channels for reminders plus opt-in shopping activity with encrypted destination URLs and private-host guardrails. |
| Activity | Household timeline | Recent changes and quick context. |
| Search | Global search | Fast lookup across core household data. |
| Family administration | Responsive family management | Member search and adult/child groups, permission dialogs, invitations, displays, SSO, backups and audit activity. See [admin layout](admin-layout.md). |
| Shared Home Display | Read-only household screen | Pairable device tokens for kitchen tablets, hallway screens, wall and e-ink displays. Fixed Next up and timeline plus rotating cards for meals, shopping, weather, reminders, school, countdowns, stars, birthdays, people and the week; time-of-day modes and offline copy. QR pairing for the display mode of the Tribu Android app. See [shared display](shared-display.md). |
| Phone sync | CalDAV, CardDAV, and VTODO | Calendar/contact sync plus a separately scoped task collection for Apple Reminders or DAVx5 with Tasks.org/OpenTasks. |
| Integrations | Home Assistant, webhooks, API tokens | Automation hooks for self-hosted homes. |
| Self-hosting | Docker Compose and GHCR images | PostgreSQL, Valkey, frontend, backend, backups, reverse proxy, and update docs. |
| Security model | Family boundaries | httpOnly cookies, scoped PATs, display tokens, a non-root frontend container, backend privilege drop when supported, and security policy. |
| Internationalization | 24 UI languages | Bundled locale packs across the app. |
| Mobile layout | Shared navigation and sheets | Home/calendar/new/shopping/more navigation, quick capture, content-width-based planning, and scrolling forms with reachable save actions. Shopping keeps its own dock. |

### Shopping in the store

Tap a product tile to move it into **Already in the basket**; tap it again to restore it. A successful status change offers **Undo** for six seconds in the current list. Switching lists or families, removing the item, or receiving a conflicting status update makes that Undo unavailable. Completing a shopping trip archives checked products without deleting their details. **Recent** shows purchased products from the selected list and restores the selected record with its quantity, note, photo, category and urgency. Ordinary quick add and template application exclude archived records; clearing the current basket also leaves history intact. Archiving invalidates any pending Undo.

Quick add understands quantities such as `2 kg Äpfel` and `½ l Milch`. The bundled German product catalog supplies illustrations and suggested categories. Open details using the three dots or a long press to edit the quantity, unit, note, photo, urgency, category, or destination list. JPEG, PNG and WebP uploads up to 5 MB are resized in the browser; the stored photo is limited to 700,000 characters and shared only through the existing family-authorized shopping API.

Each list stores its own department order and icon. Empty departments are hidden. Favorites and tile/list display preferences stay in the current browser, scoped to the signed-in family and user. **Shopping mode** hides navigation and keeps the checklist in focus. Children can check or uncheck current products but cannot edit details, archive a trip, restore history, or manage lists.

The meal-plan card matches today’s planned meal name to a family recipe and opens ingredient selection; ingredients already on the list, including those in the basket, start deselected. **Share list** copies or downloads a text snapshot. Signed-in family members continue to receive live changes through the existing connection; the demo remains local. Shopping templates and configured store searches remain available through list options and product details.

The shopping update adds migration `0057_shopping_visual_details`. Run the normal database migration before serving the updated API. Existing list and product rows receive compatible defaults; a migration downgrade removes the new details and history flags. Trip completion and history restoration publish the existing shopping update events to realtime clients, webhooks and opted-in notification destinations.


Shopping interface copy is available in German and English. The other 22 locale bundles include explicit English fallback copy for the new shopping controls; the bundled product names, default units and departments remain German. Custom family product names and categories are preserved. [Browser screenshots and capture provenance](assets/shopping/README.md) document the illustrated layout.

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

See [Responsive UI](responsive-ui.md) for the shared planner components, layout boundaries and validation.
