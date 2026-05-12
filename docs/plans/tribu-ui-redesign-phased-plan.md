# Tribu UI Redesign Phased Implementation Plan

**Goal:** Implement the calm, warm Tribu redesign in safe phases while preserving existing product behavior, backend/API contracts, routes, roles, i18n, PWA behavior, and the standalone Shared Home Display runtime.

**Architecture:** Build the redesign from shared tokens and reusable CSS classes first, then apply those primitives to the AppShell, Today dashboard, daily-use screens, Shared Display, and Auth/Landing. Treat `/display` as a separate runtime boundary throughout the work. Keep visual changes testable with existing Jest and Playwright coverage, adding focused tests where current coverage does not protect the redesigned behavior.

**Tech stack:** Next.js, React, existing CSS/theme JSON files, Jest, Testing Library, Playwright.

## Required references

Read before implementation:

- `docs/design/tribu-redesign-brief.md`
- `docs/design/tribu-redesign-board.png`
- `docs/design/tribu-desktop-today.png`
- `docs/design/tribu-mobile-flow.png`
- `AGENTS.md` if present in the worktree
- `frontend/package.json`
- Existing tests near each touched component

Known frontend commands from `frontend/package.json`:

- `npm test`
- `npm run build`
- `npm run e2e`

There is currently no dedicated frontend `lint` script. If one is added before this plan is executed, include it in validation.

## Global rules for every phase

Before editing in each phase:

1. Inspect the current component and test structure.
2. Identify existing behavior that must be preserved.
3. Add or update a failing test first where practical.
4. Keep file placement and runtime boundaries explicit before coding.
5. Do not change backend/API contracts.
6. Do not remove existing features or modules.
7. Avoid one-off inline styles unless extraction would be larger and less clear than the change.
8. Preserve i18n, roles, demo mode, PWA behavior, global search, skip link, aria labels, focus-visible states, and notifications.
9. Check `/display` for global CSS regressions whenever global styles or theme tokens change.
10. If browser/E2E coverage exists for the touched surface, treat it as a required final gate for that surface.

## Phase 0: Discovery, baseline, and guardrails

### Objective

Establish the current UI/runtime contract before changing styles or layout.

### Files to inspect

- `frontend/package.json`
- `frontend/styles/globals.css`
- `frontend/themes/light.json`
- `frontend/themes/dark.json`
- `frontend/themes/midnight-glass.json`
- `frontend/lib/themes.js`
- `frontend/lib/styles.js`
- `frontend/lib/navigation.js`
- `frontend/components/AppShell.js`
- `frontend/components/DashboardView.js`
- `frontend/components/QuickCaptureCard.js`
- `frontend/components/calendar/index.js`
- `frontend/components/TasksView.js`
- `frontend/components/ShoppingView.js`
- `frontend/components/DisplayDashboard.js`
- `frontend/components/AuthPage.js`
- Tests under `frontend/__tests__/components/` and `frontend/__tests__/pages/`
- Playwright config and E2E specs, if relevant to the touched routes

### Tasks

1. Confirm the worktree is clean and create a focused branch for the redesign work.
2. Confirm whether `AGENTS.md` exists in the worktree. If it exists, follow it.
3. Inspect `frontend/package.json` and record available validation commands.
4. Inventory navigation view keys, hash behavior, role visibility, badges, and mobile More behavior.
5. Inventory dashboard modules, customization/order behavior, and setup checklist behavior.
6. Inventory `/display` runtime boundaries and tests that prove it remains standalone.
7. Inventory i18n files and the expected pattern for new labels.
8. Run a baseline targeted test set for the surfaces that already have tests.
9. Record any current failing tests before implementation starts.

### Suggested baseline commands

Run from `frontend/`:

```bash
npm test -- --runTestsByPath \
  __tests__/components/AppShellMobileNav.test.js \
  __tests__/components/DashboardDesktopLayout.test.js \
  __tests__/components/DashboardTodayStatus.test.js \
  __tests__/components/DashboardHero.test.js \
  __tests__/components/QuickCaptureCard.test.js \
  __tests__/components/CalendarViewBirthdayIndicators.test.js \
  __tests__/components/TasksView.test.js \
  __tests__/components/ShoppingView.test.js \
  __tests__/components/DisplayDashboard.test.js \
  __tests__/pages/DisplayPage.test.js \
  __tests__/pages/DisplayAppWrapper.test.js
```

If the command shape needs adjustment for the installed Jest version, update the command but keep the same intent.

### Acceptance criteria

- Existing behavior boundaries are documented for the implementer.
- Known failing tests, if any, are separated from redesign regressions.
- The implementation phases can proceed without guessing view keys or runtime boundaries.

## Phase 1: Design tokens and AppShell navigation

### Objective

Create the calm, warm design foundation and update AppShell navigation without changing backend/API behavior.

### Scope

- `frontend/styles/globals.css`
- `frontend/themes/light.json`
- `frontend/themes/dark.json`
- `frontend/themes/midnight-glass.json`
- `frontend/lib/themes.js` if needed
- `frontend/lib/styles.js` if needed
- `frontend/lib/navigation.js`
- `frontend/components/AppShell.js`
- Relevant AppShell/navigation tests

### Implementation requirements

1. Update light, dark, and midnight theme tokens:
   - Warmer light background.
   - Paper-like surfaces.
   - Subtle borders.
   - Softer primary violet/plum.
   - Supporting household accents: sage, sky, amber, rose.
   - High-contrast readable text.
   - Softer shadows.
   - Reduced glow, blur, intense gradients, and shiny glass.
2. Add reusable CSS classes for:
   - Page shell.
   - Page headers.
   - Cards.
   - Bento modules.
   - Icon buttons.
   - Badges.
   - Pills.
   - Tabs.
   - Filter chips.
   - Inputs.
   - Empty states.
   - List rows.
   - Bottom sheets or compact mobile panels where useful.
3. Redesign AppShell navigation visually:
   - Desktop sidebar grouped around Today, Plan, Lists, People, Household, and More/System.
   - Preserve existing view keys and routing/hash behavior.
   - Keep Settings and Admin pinned or visually separated from daily navigation.
   - Preserve badges for open tasks, shopping items, and unread notifications.
   - Make the active section obvious without loud gradients.
   - Mobile bottom nav prioritizes Today, Calendar/Plan, Tasks, Shopping, More.
   - Touch targets are at least 44px.
   - Preserve search, notifications, demo banner, skip link, aria labels, focus-visible behavior, and global keyboard behavior.
4. Do not alter `/display` behavior in this phase except to prevent global style regressions.

### Test-first targets

Add or update tests before implementation where practical:

- Mobile bottom nav renders the five primary destinations.
- Badges still render for task/shopping/notification data.
- Active route keeps `aria-current` or equivalent accessible state.
- More/overflow exposes lower-frequency modules.
- Touch target class or computed style contract is present for bottom nav items.
- `/display` does not receive normal AppShell navigation because of global style changes.

### Validation

Run from `frontend/`:

```bash
npm test -- --runTestsByPath __tests__/components/AppShellMobileNav.test.js
npm test -- --runTestsByPath __tests__/pages/DisplayPage.test.js __tests__/pages/DisplayAppWrapper.test.js
npm run build
```

Run relevant Playwright specs for AppShell/mobile navigation if they exist.

### Final phase report must include

- Changed files.
- How tokens improved calmness and hierarchy.
- How navigation grouping works while preserving view keys and badges.
- Commands run and results.

## Phase 2: Dashboard as Today Command Center

### Objective

Transform the existing dashboard into a calm, warm, family-first Today Command Center while preserving all existing dashboard behavior and customization.

### Scope

- `frontend/components/DashboardView.js`
- `frontend/components/QuickCaptureCard.js`
- `frontend/styles/globals.css`
- Related dashboard module components if needed
- Relevant dashboard tests

### Preserve

- Existing dashboard modules.
- Dashboard customization/order.
- Quick Capture behavior.
- Daily Loop behavior.
- Events, tasks, birthdays, rewards, setup checklist.
- Role-aware UI.
- Demo mode.
- i18n.
- Existing data/API behavior.

### Implementation requirements

1. Add a warm greeting header:
   - Family name.
   - Date.
   - Small today status summary.
   - Calm weather/status area if already available.
2. Add a prominent Next up card:
   - Show the next event if available.
   - Show a useful all-clear state otherwise.
   - Include time, title, family member, and location if available.
3. Keep Quick Capture near the top:
   - Optimize for fast entry.
   - Use clear action buttons for task, event, shopping, meal, and note where existing behavior supports them.
   - Avoid visual overload.
4. Build the Today loop section:
   - Meals today.
   - Open shopping items.
   - Due routines/tasks.
   - Use compact bento cards.
5. Keep supporting cards below:
   - Open tasks.
   - Upcoming events.
   - Birthdays.
   - Rewards.
   - Setup checklist where relevant.
6. Improve empty states:
   - Useful and action-oriented.
   - No blank placeholder cards.
7. Preserve edit/customization mode:
   - Existing behavior remains intact.
   - Visual treatment becomes calmer and cleaner.

### Test-first targets

Add or update tests before implementation where practical:

- Dashboard renders next-up event from existing data.
- Dashboard renders useful all-clear state when there is no next event.
- Quick Capture remains operational and near the top.
- Daily Loop cards render the expected existing module data.
- Module customization/order still affects supporting modules.
- Empty states render without hiding existing actions.

### Validation

Run from `frontend/`:

```bash
npm test -- --runTestsByPath \
  __tests__/components/DashboardDesktopLayout.test.js \
  __tests__/components/DashboardTodayStatus.test.js \
  __tests__/components/DashboardHero.test.js \
  __tests__/components/QuickCaptureCard.test.js
npm run build
```

Run relevant dashboard Playwright/browser smoke tests if they exist. Include a real browser visual check for the first viewport on desktop and mobile if the local environment supports it.

### Final phase report must include

- Changed files.
- How the first viewport answers what is next, due today, needs attention, and can be captured quickly.
- How customization/order behavior was preserved.
- Commands run and results.

## Phase 3: Calendar, Tasks, and Shopping usability

### Objective

Improve Calendar stability, Tasks speed, and Shopping real-world mobile usability while preserving existing behavior.

### Scope

- `frontend/components/calendar/index.js`
- `frontend/components/TasksView.js`
- `frontend/components/ShoppingView.js`
- `frontend/styles/globals.css`
- Relevant tests

### Calendar requirements

- Keep existing month and week functionality.
- Make the month grid visually stable.
- Every day cell reserves the same area for:
  - Date number.
  - Indicator row.
  - Event markers.
  - Birthday markers.
- Date numbers align consistently whether the day has icons, birthdays, dots, or nothing.
- Keep accessible labels with event/birthday summaries.
- Make selected day, today, and event indicators calmer and clearer.
- Ensure states remain distinguishable without color alone.
- On mobile, day details should feel like a focused panel or bottom sheet where practical.

### Tasks requirements

- Keep current task behavior.
- Prioritize filter chips:
  - Due today.
  - Overdue.
  - Mine.
  - All.
- Keep advanced filters but de-emphasize them on mobile.
- Make assignee, priority, recurrence, and due date readable without clutter.
- Use clear completion affordances.
- Child view should feel simpler and motivating.

### Shopping requirements

- Keep current shopping lists, templates, categories, suggestions, and checked/unchecked behavior.
- Optimize for one-handed mobile operation.
- Use big checkbox rows.
- Add or preserve a clear active list selector.
- Make category groups easy to scan.
- Templates should not dominate mobile; use a collapsible panel or bottom sheet where practical.
- Checked items should be visually quieter but reversible.
- Add useful empty states and clearer add-first-item behavior.

### Test-first targets

Add or update tests before implementation where practical:

- Calendar day cells render stable date and indicator containers for empty and populated days.
- Calendar accessible labels include event and birthday summaries.
- Today/selected/event states expose non-color-only markers or labels.
- Task primary filter chips render in the required order.
- Advanced filters remain available.
- Shopping active list selector renders.
- Shopping rows keep large checkbox/tap targets.
- Checked shopping items remain reversible.

### Validation

Run from `frontend/`:

```bash
npm test -- --runTestsByPath \
  __tests__/components/CalendarViewBirthdayIndicators.test.js \
  __tests__/components/TasksView.test.js \
  __tests__/components/ShoppingView.test.js
npm run build
```

Run relevant Playwright/browser checks for calendar layout and mobile shopping if available. Calendar alignment should be verified in a real browser where practical, because geometry regressions are hard to prove with Jest alone.

### Final phase report must include

- Changed files.
- How calendar alignment improved.
- How task filtering became faster.
- How shopping mobile usability improved.
- Commands run and results.

## Phase 4: Shared Home Display and Auth/Landing

### Objective

Make the Shared Home Display more glanceable and the Auth/Landing screen warmer while preserving security and standalone behavior.

### Scope

- `frontend/components/DisplayDashboard.js`
- `frontend/components/AuthPage.js`
- `frontend/styles/globals.css`
- i18n files if hard-coded display/auth labels need localization
- Relevant tests

### Shared Home Display requirements

Preserve:

- Standalone and read-only model.
- Dedicated display runtime.
- No normal navigation.
- No settings, search, profile flows, admin UI, or mutation actions.
- No normal AppShell.
- No normal AppProvider if the existing display architecture intentionally avoids it.
- Existing e-ink/tablet modes if currently supported.

Improve readability from tablet/wall distance:

- Big current time/date.
- Clear next event/focus.
- Family agenda.
- Birthdays/celebrations.
- Family members.
- Optional school-today data if existing data supports it.
- High contrast.

Localize hard-coded English labels through the existing i18n system where practical.

### Auth/Landing requirements

Preserve:

- Login.
- Register.
- SSO.
- Language selector.
- Demo mode.
- SSO error handling.
- Accessibility.

Communicate:

- Bring the household into one calm place.
- Self-hosted.
- Private.
- Built for families.

The demo CTA should be prominent. Login/register should remain simple and easy to find.

### Test-first targets

Add or update tests before implementation where practical:

- `/display` renders without normal AppShell navigation.
- `/display` does not expose settings/admin/search/profile flows.
- Display dashboard exposes read-only content and no mutation controls.
- Display high-level agenda/next-up sections render from existing data.
- Auth page renders demo CTA, login/register, SSO, and language selector.
- SSO error handling remains visible and accessible.

### Validation

Run from `frontend/`:

```bash
npm test -- --runTestsByPath \
  __tests__/components/DisplayDashboard.test.js \
  __tests__/pages/DisplayPage.test.js \
  __tests__/pages/DisplayAppWrapper.test.js \
  __tests__/components/AuthPageSso.test.js \
  __tests__/components/SsoSection.test.js
npm run build
```

Run relevant Playwright/browser smokes for `/display` and Auth/Landing if available.

### Final phase report must include

- Changed files.
- Confirmation that `/display` remains standalone and read-only.
- How landing/auth now feels less generic.
- Commands run and results.

## Phase 5: Quality pass, tests, and cleanup

### Objective

Review the redesigned UI implementation for regressions, accessibility, mobile behavior, i18n, role visibility, visual consistency, and test coverage.

### Scope

- Add or update tests where practical.
- Clean up duplicated styles.
- Remove unnecessary one-off inline styles.
- Ensure theme tokens are consistently used.
- Fix regressions found during validation.
- Check public-facing text for clarity and tone.

### Required checks

1. Mobile bottom navigation:
   - Main items render.
   - Badges still render where data supports them.
   - Touch targets are not visually tiny.
   - Overflow/More behavior still works.
   - Active/current state is accessible.
2. Dashboard:
   - Key modules render.
   - Customization/order behavior remains intact.
   - Empty states render.
   - Quick Capture remains usable.
3. Calendar:
   - Month day cells reserve stable areas for date and indicators.
   - Today/selected/event states remain distinguishable without color alone.
   - Accessible labels include useful summaries.
4. Tasks:
   - Primary filter chips render.
   - Advanced filters remain available.
   - Completion controls remain obvious.
5. Shopping:
   - Active list selector renders.
   - Mobile rows are large and scannable.
   - Checked items are quiet but reversible.
   - Templates do not dominate mobile.
6. Shared Display:
   - `/display` remains standalone.
   - Normal AppProvider/AppShell is not mounted where the current architecture forbids it.
   - Read-only behavior is preserved.
7. Auth/Landing:
   - Demo, login, register, SSO, and language selector remain available.
   - Error states remain accessible.
8. Accessibility:
   - Skip link remains.
   - `aria-current` and aria labels remain where relevant.
   - Focus-visible states are present.
   - Dialogs and panels retain accessible behavior.
   - `prefers-reduced-motion` is respected.
9. i18n:
   - New visible labels use locale keys where practical.
   - No missing keys.
   - No accidental English-only labels in non-English flows unless explicitly documented.
10. PWA/static assets:
   - If the service worker precaches changed static assets, bump the cache version in the same change.

### Validation

Run from `frontend/`:

```bash
npm test
npm run build
npm run e2e
```

If full E2E cannot run locally, document the exact blocker and run the strongest available targeted browser checks. Do not treat Jest-only validation as complete for browser-visible layout changes when Playwright coverage exists and is runnable.

Also run from the repository root:

```bash
git diff --check
```

### Cleanup checklist

- Remove dead CSS classes and unused helper code introduced during redesign.
- Remove duplicate tokens or one-off inline styles that should be shared classes.
- Remove temporary screenshots, state files, generated artifacts, or debug output.
- Verify `git status --short` before final report.
- Verify final diff only contains intended redesign files and tests.

### Final phase report must include

- Changed files.
- Tests added or updated.
- Commands run and results.
- Browser/E2E status.
- Remaining limitations or blockers, if any.

## Suggested branch and commit structure

Use a focused branch such as:

```bash
git switch -c redesign/calm-today-ui
```

Suggested commits:

1. `docs: add Tribu UI redesign brief and phased plan`
2. `style: refresh theme tokens and AppShell navigation`
3. `feat: reshape dashboard into Today command center`
4. `style: improve calendar tasks and shopping usability`
5. `style: refine shared display and auth landing`
6. `test: harden redesign regression coverage`

Keep each commit small enough to review. If a phase becomes too large, split it by surface while preserving the phase acceptance criteria.
