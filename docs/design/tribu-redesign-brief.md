# Tribu UI Redesign Brief

## Goal

Transform Tribu from a module-heavy family organizer into a calm, warm, family-first daily home base.

The redesigned interface should help a household answer four questions quickly:

- What is next?
- What is due today?
- What needs attention?
- What can be captured quickly before it is forgotten?

The redesign must preserve existing backend and API behavior. It is a user interface, interaction, accessibility, and visual hierarchy effort, not a product-scope or data-contract rewrite.

## Reference mockups

Use these images as visual references for spacing, hierarchy, rhythm, and tone:

- `docs/design/tribu-redesign-board.png`: full redesign board with desktop, mobile, calendar, tasks, shopping, shared display, and auth references.
- `docs/design/tribu-desktop-today.png`: desktop Today dashboard reference crop.
- `docs/design/tribu-mobile-flow.png`: mobile Today flow reference crop.

The screenshots are directional references. Keep the implementation faithful to the design language and hierarchy, but prefer existing Tribu behavior, accessible semantics, and reusable components over pixel-copying the mockup.

## Design language

Tribu should feel like a warm family kitchen table, not a corporate SaaS dashboard.

### Mood

- Calm
- Warm
- Clear
- Human
- Practical
- Glanceable
- Trustworthy
- Self-hosted and private without feeling technical

### Visual qualities

Use:

- Warm off-white app backgrounds.
- Soft paper-like surfaces.
- Subtle borders.
- Gentle shadows.
- Rounded cards and controls.
- Softer violet/deep plum as the primary color, used sparingly.
- Sage, sky, amber, and rose accents for household categories and soft state markers.
- Clear, high-contrast text in every theme.
- Icon backgrounds and small badges to make daily status scannable.

Avoid:

- Neon colors.
- Excessive gradients.
- Heavy glass effects.
- Strong blur.
- Glow-heavy active states.
- Corporate analytics-dashboard density.
- Large empty decorative areas that reduce practical usefulness.

## Theme direction

### Light theme

The light theme is the primary redesign target.

- App background: warm off-white, not cold gray.
- Main surfaces: paper-white or soft cream.
- Raised surfaces: slightly warmer/lighter than the page background.
- Borders: low-contrast warm beige or muted lavender-gray.
- Primary: muted plum/violet.
- Primary hover/active: slightly deeper plum, not bright purple.
- Accent colors: quiet sage, sky, amber, rose.
- Shadows: soft and small, mostly for layer separation.

### Dark theme

Dark mode should keep the same family-first calmness.

- Avoid pure black surfaces unless needed for contrast.
- Prefer deep ink, warm charcoal, and muted plum accents.
- Keep surfaces readable and layered without heavy glow.
- Preserve high contrast for text, badges, focus states, and calendar/task status markers.

### Midnight glass theme

Midnight glass should be toned down.

- Keep the special mood, but reduce intense blur, shine, and glow.
- Ensure all text and controls remain readable over translucent surfaces.
- Use opaque fallbacks for navigation, overlays, menus, and mobile panels where readability could suffer.

## Navigation model

The AppShell should make Tribu feel less like a pile of modules and more like a household command center.

### Desktop sidebar grouping

Group the existing navigation around household jobs:

- **Today**
  - Home / Today dashboard
- **Plan**
  - Calendar
  - Routines
- **Lists**
  - Tasks
  - Shopping
  - Meals
  - Recipes
- **People**
  - Family
  - Birthdays
- **Household**
  - Rewards
  - School
  - Contacts
  - Gifts
- **More / System**
  - Files
  - Notes
  - Settings
  - Admin where role visibility allows it

Keep existing view keys, routes, hash behavior, role visibility, badges, and notification behavior.

Settings and Admin should remain visually separate from daily navigation. They can be pinned or grouped as system actions, but they should not compete with the daily household flow.

### Mobile bottom navigation

Prioritize the most common daily actions:

- Today
- Calendar / Plan
- Tasks
- Shopping
- More

Mobile requirements:

- Touch targets must be at least 44px.
- Badges for tasks, shopping, and notifications must remain visible where data supports them.
- `aria-current`, aria labels, focus-visible states, skip link behavior, global search, demo banner, and notification behavior must remain intact.
- Overflow/More behavior must continue to expose lower-frequency modules.

## Today Command Center

The dashboard should become the emotional and practical center of Tribu.

### First viewport priorities

The first viewport should answer:

1. **Next up:** the next meaningful calendar item or a useful all-clear state.
2. **Today status:** a compact count summary for events, tasks, shopping, birthdays, or similar existing data.
3. **Quick capture:** fast entry for household items before they are forgotten.
4. **Today loop:** compact daily modules for meals, shopping, routines/tasks, and attention items.

### Supporting content

Below the primary Today area, keep the existing dashboard modules and customization model:

- Open tasks.
- Upcoming events.
- Birthdays.
- Rewards.
- Setup checklist where relevant.
- Existing role-aware modules.
- Existing demo-mode behavior.

No module should be removed as part of the redesign. Empty states should be useful and action-oriented rather than blank placeholders.

## Calendar direction

The calendar should feel stable and glanceable.

- Keep existing month and week behavior.
- Month day cells should reserve consistent areas for date numbers, indicator rows, event markers, and birthday markers.
- Date numbers should align whether a day has icons, dots, birthdays, events, or nothing.
- Today, selected day, birthdays, and event indicators must remain distinguishable without relying on color alone.
- Accessible labels must include useful event and birthday summaries.
- On mobile, day details should feel like a focused panel or bottom sheet where practical.

## Tasks direction

Tasks should be fast to scan and complete.

- Keep current task behavior.
- Prioritize chips for Due today, Overdue, Mine, and All.
- Keep advanced filters available but visually quieter, especially on mobile.
- Make assignee, priority, recurrence, and due date readable without clutter.
- Completion affordances should be obvious.
- Child views should feel simpler and motivating.

## Shopping direction

Shopping should work well one-handed on mobile.

- Keep current shopping lists, templates, categories, suggestions, and checked/unchecked behavior.
- Use large checkbox rows.
- Keep a clear active-list selector.
- Make category groups easy to scan.
- Templates should not dominate the mobile view. Prefer a collapsible panel or compact sheet where practical.
- Checked items should become visually quieter but remain easy to restore.
- Empty states should make adding the first item obvious.

## Shared Home Display direction

The Shared Home Display at `/display` must remain standalone, read-only, and safe for shared household screens.

Preserve:

- Dedicated display runtime.
- Read-only behavior.
- Display-token/device identity boundaries.
- Existing e-ink or tablet modes if present.
- No normal AppShell.
- No normal AppProvider if the current architecture intentionally avoids it.
- No normal navigation, settings, admin, search, profile, or mutation flows.

Improve glanceability:

- Large current time and date.
- Clear next event or focus item.
- Family agenda.
- Birthdays and celebrations.
- Family member presence/summary where existing data supports it.
- Optional school-today content where existing data supports it.
- High contrast for tablet or wall distance.

## Auth and landing direction

Auth should feel warmer and less generic while preserving all existing flows.

Preserve:

- Login.
- Register.
- SSO.
- Language selector.
- Demo mode.
- SSO error handling.
- Accessibility semantics.

Communicate:

- Bring the household into one calm place.
- Self-hosted.
- Private.
- Built for families.

The demo call-to-action should be prominent, but login/register should stay simple and easy to find.

## Implementation constraints

- Do not introduce a heavy UI framework.
- Do not change backend/API contracts.
- Do not remove existing modules or features.
- Preserve existing routes, view keys, hash behavior, demo mode, roles, i18n, PWA behavior, global search, skip link, focus-visible states, aria labels, and notification behavior.
- Preserve dashboard customization and module ordering.
- Keep `/display` standalone and read-only.
- Avoid many one-off inline styles. Prefer reusable CSS classes and theme tokens.
- Localize new user-facing labels through the existing i18n system where practical.
- Respect `prefers-reduced-motion` for new transitions.

## Quality gates

Before the redesign is considered complete, run the relevant frontend checks from `frontend/package.json`:

- `npm test`
- `npm run build`
- `npm run e2e` where the local environment supports it

There is currently no dedicated `lint` script in `frontend/package.json`; use project-specific static checks if one is added later.

The final quality pass should cover:

- Mobile bottom navigation, badges, More behavior, and touch targets.
- Dashboard module rendering, empty states, and customization/order behavior.
- Calendar month alignment and accessible day summaries.
- Tasks filter chip rendering and completion affordances.
- Shopping mobile rows, active list selector, checked-item reversibility, and category grouping.
- Shared Display standalone/read-only behavior.
- Auth/Landing accessibility and SSO/demo flows.
- i18n key coverage for new visible labels.
- Focus-visible states, skip link, aria labels, and reduced-motion behavior.
