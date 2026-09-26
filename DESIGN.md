---
version: alpha
name: Tribu
description: A calm, self-hosted home base for busy families.
colors:
  primary: "#8B5E9F"
  primary-deep: "#6F527F"
  secondary: "#6AA6D8"
  success: "#85A887"
  warning: "#D4A24F"
  danger: "#D16D72"
  rose: "#C9828F"
  dark-bg: "#0C101C"
  dark-bg-deep: "#080B14"
  dark-surface: "#161B2B"
  dark-elevated: "#202638"
  dark-hover: "#2A3146"
  dark-border: "rgba(197, 203, 224, 0.13)"
  dark-glass: "rgba(22, 27, 43, 0.78)"
  dark-text: "#F3F0EC"
  dark-text-secondary: "#C9C1D1"
  dark-text-muted: "#9D95AA"
  light-bg: "#FAF8F4"
  light-bg-deep: "#F5F2EE"
  light-surface: "#FFFEFD"
  light-elevated: "#FAF9F7"
  light-hover: "#F3EDF9"
  light-border: "rgba(88, 65, 80, 0.10)"
  light-glass: "rgba(252, 250, 247, 0.96)"
  light-text: "#151828"
  light-text-secondary: "#42414C"
  light-text-muted: "#756F79"
  text-on-primary: "#FFFFFF"
typography:
  display:
    fontFamily: Inter
    fontSize: 56px
    fontWeight: 760
    lineHeight: 1.02
    letterSpacing: -0.04em
  page-title:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: 760
    lineHeight: 1.1
    letterSpacing: -0.03em
  card-title:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: 700
    lineHeight: 1.25
  body:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.55
  body-small:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: 450
    lineHeight: 1.45
  label:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: 700
    lineHeight: 1
    letterSpacing: 0.08em
  metric:
    fontFamily: JetBrains Mono
    fontSize: 22px
    fontWeight: 700
    lineHeight: 1.1
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  2xl: 48px
  shell-gutter-mobile: 16px
  shell-gutter-desktop: 24px
  card-padding: 20px
  dense-row-gap: 10px
rounded:
  sm: 10px
  md: 14px
  lg: 20px
  xl: 28px
  pill: 100px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.text-on-primary}"
    typography: "{typography.body-small}"
    rounded: "{rounded.pill}"
    padding: 14px 24px
  button-secondary:
    backgroundColor: "{colors.dark-elevated}"
    textColor: "{colors.dark-text}"
    typography: "{typography.body-small}"
    rounded: "{rounded.pill}"
    padding: 10px 18px
  card-dark:
    backgroundColor: "{colors.dark-surface}"
    textColor: "{colors.dark-text}"
    rounded: "{rounded.lg}"
    padding: "{spacing.card-padding}"
  card-light:
    backgroundColor: "{colors.light-surface}"
    textColor: "{colors.light-text}"
    rounded: "{rounded.lg}"
    padding: "{spacing.card-padding}"
  sidebar-dark:
    backgroundColor: "{colors.dark-glass}"
    textColor: "{colors.dark-text-secondary}"
    rounded: "{rounded.md}"
  status-success:
    backgroundColor: "{colors.success}"
    textColor: "{colors.dark-bg-deep}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
  status-warning:
    backgroundColor: "{colors.warning}"
    textColor: "{colors.dark-bg-deep}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
  status-danger:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.dark-bg-deep}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
---

# Tribu Design System

## Overview

Tribu is a calm home base for busy households. It should feel like a shared family command center: warm enough for daily home life, structured enough for planning, and trustworthy enough for sensitive family data.

The visual reference is **a softly lit kitchen counter at the start of the day**: a tablet, a notebook, a few color-coded notes, and the family's next actions already visible. It is not an enterprise dashboard, a productivity cockpit, or a decorative lifestyle landing page. The interface should help a parent answer: what is next, who needs to know, what needs doing, and what can safely wait.

The product has two major visual modes:

- **Morning Mist** for light surfaces: warm paper, soft brown text, gentle family-friendly contrast.
- **Velvet Void / Midnight Glass** for dark surfaces: deep navy, restrained glass, muted jewel accents, and readable cards.

Both modes should preserve the same product character. Light mode must not become a plain admin table. Dark mode must not become a neon glassmorphism demo.

The shared implementation source is `frontend/styles/globals.css`; dashboard-specific layout lives in `frontend/styles/dashboard.css`. This `DESIGN.md` describes the intended visual system so design changes stay coherent across the PWA, shared display, screenshots, and future clients.

## Colors

Tribu uses a warm-neutral foundation with restrained jewel accents. Color is functional before decorative: it should identify family areas, show state, and guide the next action.

- **Primary Amethyst (`#8B5E9F`)** is the main interaction color. Use it for primary actions, active navigation, selected controls, focus emphasis, and rare brand moments.
- **Sapphire (`#6AA6D8`)** is the calm planning accent for calendar, information, and neutral progress.
- **Sage (`#85A887`)** signals completion, healthy state, and positive routine progress.
- **Amber (`#D4A24F`)** signals attention, due soon, reminders, and warm household energy.
- **Rose (`#C9828F`)** is emotional and human. Use it for birthdays, gifts, family highlights, and gentle warmth.
- **Danger (`#D16D72`)** is reserved for destructive or overdue states. Do not use it for normal urgency copy.
- **Dark background (`#0C101C`, `#080B14`)** creates a quiet evening dashboard. It needs real contrast, not transparent-on-transparent layering.
- **Light background (`#FAF8F4`, `#FFFEFD`)** should feel like warm paper, not pure white SaaS chrome.

Use gradients sparingly. The existing gradient families are acceptable for brand moments, illustrated dashboard cards, and key CTAs. Do not apply gradients to long-form content, dense tables, or status labels where they reduce scannability.

Status colors must remain semantic. A module accent is not a health state. Do not color a due task green because it belongs to a green module.

## Typography

The signed-in shell uses the native system UI stack (`-apple-system`, `BlinkMacSystemFont`, `Segoe UI`, Arial) from the supplied mockup. Landing and standalone surfaces retain **Inter**. Handwritten dashboard notes use italic Georgia; **JetBrains Mono** remains reserved for compact technical details.

Typography should prioritize fast family scanning:

- Page titles are confident but not huge. A household planning app should not waste the first viewport on marketing-sized headings after sign-in.
- Card titles are short, bold, and close to their content.
- Body text is plain and practical. Avoid clever empty-state prose when the user needs to act.
- Labels may use small uppercase text for section markers, but avoid shouting entire controls or navigation labels.
- Numeric counters can use the mono font when they behave like compact dashboard metrics. Do not use mono for family names, task titles, event titles, or emotional copy.

Copy should say what the family can do next. Prefer `Add task`, `Open shopping`, `Pair display`, and `Review reminders` over abstract phrases such as `Manage`, `Configure`, or `Optimize`.

## Layout

The layout model is **dense, top-aligned family bento**.

Desktop views should use side-by-side cards where the content benefits from comparison or simultaneous scanning. Avoid large full-width panels unless the surface genuinely needs horizontal span, such as calendars, weekly plans, or shared-display layouts.

Dashboard and Today-style surfaces should place the concrete next action in the first viewport:

1. Greeting and date context.
2. Global search or quick capture when relevant.
3. Next up / today status / quick household actions.
4. Secondary cards such as activity, birthdays, rewards, and setup hints.

Cards should align to the top and maintain a compact rhythm. Empty space is acceptable only when it communicates calm or separation. It is not acceptable when it pushes the next household action below the fold.

Mobile views should preserve the same priority but collapse into a single column with large enough touch targets. Bottom navigation and overlays must be opaque and readable in PWA standalone mode.

Shared display views are not normal app pages. They are glanceable, read-only, and should avoid admin chrome, settings concepts, technical IDs, and personal account details.

## Elevation & Depth

Depth is achieved through **tonal layering**, modest borders, and restrained shadows.

Dark mode can use glass surfaces, but only when readability is preserved. Every navigation surface, overlay, popover, sidebar, and bottom sheet must have an opaque enough fallback to stay legible in standalone PWA mode and on mobile browsers.

Light mode should use warm paper surfaces and very soft shadows. Avoid heavy drop shadows that make the app feel like a sales dashboard. Borders should be subtle but present enough to keep cards distinct.

Hover effects may lift or brighten a card slightly. They should never shift layout or make dense cards jump.

## Shapes

Tribu is soft, not bubbly.

- Small controls use `10px` to `14px` radii.
- Dashboard cards use `15px` radii; other major surfaces use `20px` radii.
- Large hero or display surfaces may use `28px` radii.
- Pills are reserved for chips, badges, segmented actions, and compact CTAs.

Do not mix sharp enterprise tables with very rounded mobile cards in the same view. When adding a new component, match the surrounding surface radius first, then choose the token.

Member avatars are friendly identity markers. Keep them circular and visually stable. Do not use avatars as decoration when the person assignment is not meaningful.

## Components

### App shell and navigation

The app shell is a persistent household map. Desktop navigation should be structured and compact. Mobile navigation should keep primary family workflows reachable without covering content or becoming translucent.

Navigation labels should describe the family workflow, not the underlying module architecture. Active state needs visible color and shape, not color alone.

The mobile “More” sheet is a bottom sheet with a grab handle, a short title and a
thumb-reachable close button. It does not repeat Home, Calendar or Shopping from
the bottom navigation. Remaining areas appear as four-column icon tiles grouped
into Plan, Lists & meals and Family, using pastel tones per area and the
existing counters. Tiles may show one short, data-backed hint (overdue or due
tasks, today’s next meal, the next birthday within two weeks); hints never
replace the label. A field at the top filters areas and settings while typing
and offers a hand-off to the global search. Notifications, settings, admin, the
dark-design switch and dashboard layout follow as compact rows, with the
account, family switcher and logout last. The sheet keeps its opening height
while filtering and can be closed by swiping the header down.

The “New” sheet uses the same bottom-sheet frame (`BottomSheet`). Four tiles
open the existing create forms for an event, task, shopping item or meal.
Below them, a compact quick capture field saves text straight to a task, the
shopping list or the quick-note inbox; destinations stay disabled until there
is text, and the sheet stays open after saving so several items can be added in
a row. Demo mode keeps the tiles but hides quick capture.

### Dashboard cards

Dashboard cards are bento modules. Each card should answer one household question:

- What is next?
- What needs doing?
- Who is responsible?
- What changed?
- What should I open?

A good card has a clear title, one primary value or action, and a small number of secondary details. Avoid cards that are only summaries of database counts unless those counts drive an action.

### Family overview

The September 2026 mockup brings lighter paper surfaces, amethyst navigation,
compact mixed-case headings, and a landscape illustration on the next-event card.
At wide desktop sizes, the default dashboard places quick capture across the full
width, events/tasks/today’s meals in three columns, then daily routines, birthdays,
rewards, and household activity in four columns. Tablet views use two columns and
mobile uses one, retaining accessible controls and opaque surfaces in both themes.
Existing saved module orders are preserved; new meal and activity modules are
inserted automatically, and resetting the layout applies the new default.

The meal preview uses the existing meal-plan API (demo mode uses demo meal data).
Loading and failed requests are distinct from empty days. Recurring tasks due today
or earlier appear in the daily loop; their completion and ordinary task completion
use the existing task endpoint. Meal and task details open their owning views.
The sidebar lists the household’s existing members without inventing demo profiles.

Playfulness is part of this dashboard: soft landscape silhouettes, handwritten
notes, a slightly tilted calendar, pastel icon badges, meal thumbnails, routine
progress rings and reward stars. The landscape SVGs and decorative meal photos
in `frontend/public/illustrations` come from the supplied `Tribu.html`. Meal photos
represent slots rather than the exact planned recipe. Completion and reward
progress always reflect app data. Hover movement stays subtle and respects
`prefers-reduced-motion`.

### Quick Capture

Quick Capture is an action surface, not an inbox-first surface. It should be compact, visible, and biased toward adding real household work quickly. The destination mapping must be obvious: task, shopping, note, event, meal.

### Calendar and weekly planning

The calendar follows the supplied September 2026 mockup directly: full-width six-week month grid, right-aligned day numbers, pastel event strips, seven week columns, compact date navigation and member filters. Adjacent-month dates are usable and display their events. The shared welcome/search controls stay above the calendar header.

Day details, event details and create/edit forms use native modal dialogs with a blurred backdrop, focus containment, Escape dismissal and focus restoration. The main form follows the mockup's title/date/time/participants/location/color/notes order. Existing recurrence, multi-day, all-day and icon settings remain under “More options”; editing preserves the existing all-day value. Imported events and birthdays retain their read-only rules. Destructive event actions require confirmation, including separate occurrence/series choices.

Event colors default to the assigned members’ current profile colors, including the same palette fallback as the member legend. Shared events use a segmented accent and a soft background containing all participant colors. An explicit event color overrides automatic colors. The editor exposes this as “Family colors”; no stored event color means automatic, so changing a profile color updates existing events without rewriting them. Unassigned events use lavender.

The calendar presentation is scoped in `frontend/styles/calendar.css`; persistence remains in `useCalendar`. Desktop proportions are taken from the mockup. On small screens the month/week grids scroll inside their own containers and dialogs fit the viewport. Time fields stack on narrow phones to keep native time controls readable. Automatic event stripes use the assigned members’ existing profile colors, including multiple color segments; choosing a manual color overrides them, and “Family colors” restores automatic colors. Loading and failed requests remain distinct from empty days, and household changes discard pending calendar views and drafts.

Calendar views need density and confidence. Preserve clear date hierarchy, today indication, selected state, assigned people, and location/time metadata. Recurring events and all-day context must not look like errors.

Weekly Plan and printable surfaces may use lighter card treatments, but foreground and background tokens must be paired locally so contrast survives dark themes.

### Tasks and shopping

Tasks and shopping lists are action lists. Rows should make owner, due state, priority, completion, and next action scannable. Avoid decorative icons that compete with checkbox or completion affordances.

Shopping should feel quick and cooperative. Do not hide add-item affordances behind large empty states.

Shopping uses the original illustrated mockup and grocery SVG paths: lilac product
tiles, department groups, list tabs, a desktop discovery/recipe rail and a mobile
action dock. Tile text checks a product; three dots or a long press open details.
The focused shopping mode hides navigation while keeping the checklist reachable.
List options expose templates, sharing and department order on narrow screens.
The shared `FamilyTopbar` supplies live greeting/date, search and notification
controls. Shopping presentation lives in `frontend/styles/shopping.css`; mutations
and lifecycle guards live in `useShopping`, with persistence and authorization in
the shopping domain and router. See `docs/assets/shopping/README.md` for browser
capture provenance.

### Notifications

Notifications are parent action surfaces, not transport logs. They should show the human event, module context, local time, and action. Hide raw URLs, provider diagnostics, token fragments, internal IDs, and ISO timestamps.

### Settings and admin

Settings should keep family account/profile/preferences/security on the visible path. Owner/admin/support controls belong behind clearly labeled advanced sections. Avoid mixing family-facing settings with infrastructure diagnostics in the same first viewport.

Settings opens with four cards: family appearance, date and display, data and
connections, and additional settings. Cards use two columns on desktop and one
on narrow screens. The existing ten sections remain available according to the
user's role and demo restrictions, with a section selector and an “All settings”
return action in detail views. Compact view changes dashboard spacing; the
notification badge switch controls unread indicators on the bell without
changing notification delivery or read state. Both preferences are saved in the
current browser, alongside theme, language and calendar week start.

### Shared Home Display

The display route is a calm glance surface for a shared room. It should show the day, upcoming family context, and safe household information. It must not look like a logged-in admin view and must not expose profile, session, token, or email details.

## Do's and Don'ts

### Do

- Do keep the first signed-in viewport focused on concrete family actions.
- Do use warm surfaces and restrained jewel accents to balance home life and planning clarity.
- Do keep desktop dashboard cards dense, top-aligned, and side-by-side where useful.
- Do make mobile controls readable, opaque, and reachable in PWA standalone mode.
- Do use status colors only for state, not decoration.
- Do preserve accessibility basics: visible focus, readable contrast, semantic headings, labels, and touch targets.
- Do write empty states that explain the next useful action.
- Do keep shared display and normal app shell visually and technically separate.
- Do update this file when a visual-system decision changes intentionally.

### Don't

- Don't turn Tribu into an enterprise admin dashboard with huge tables and cold neutral chrome.
- Don't turn Tribu into a neon glass demo with unreadable translucent layers.
- Don't waste signed-in desktop space with oversized hero areas or centered marketing copy.
- Don't hide primary family work behind generic `Manage` buttons.
- Don't place technical IDs, raw provider errors, raw URLs, token values, or diagnostic strings in family-facing UI.
- Don't rely on color alone for status, ownership, or selection.
- Don't create one-off styling for a module when an existing bento card, button, chip, list, or page-shell pattern fits.
- Don't let screenshots or demo states show backend emptiness as the first impression when the product journey can show a coherent preview.
