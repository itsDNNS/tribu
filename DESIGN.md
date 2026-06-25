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
  light-bg: "#F8F3EB"
  light-bg-deep: "#F0E7DC"
  light-surface: "#FFFDF8"
  light-elevated: "#FBF5ED"
  light-hover: "#F2E8DA"
  light-border: "rgba(93, 74, 56, 0.13)"
  light-glass: "rgba(255, 253, 248, 0.88)"
  light-text: "#241D18"
  light-text-secondary: "#5F554D"
  light-text-muted: "#766B61"
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

The default implementation source is `frontend/styles/globals.css`. This `DESIGN.md` describes the intended visual system so design changes stay coherent across the PWA, shared display, screenshots, and future clients.

## Colors

Tribu uses a warm-neutral foundation with restrained jewel accents. Color is functional before decorative: it should identify family areas, show state, and guide the next action.

- **Primary Amethyst (`#8B5E9F`)** is the main interaction color. Use it for primary actions, active navigation, selected controls, focus emphasis, and rare brand moments.
- **Sapphire (`#6AA6D8`)** is the calm planning accent for calendar, information, and neutral progress.
- **Sage (`#85A887`)** signals completion, healthy state, and positive routine progress.
- **Amber (`#D4A24F`)** signals attention, due soon, reminders, and warm household energy.
- **Rose (`#C9828F`)** is emotional and human. Use it for birthdays, gifts, family highlights, and gentle warmth.
- **Danger (`#D16D72`)** is reserved for destructive or overdue states. Do not use it for normal urgency copy.
- **Dark background (`#0C101C`, `#080B14`)** creates a quiet evening dashboard. It needs real contrast, not transparent-on-transparent layering.
- **Light background (`#F8F3EB`, `#FFFDF8`)** should feel like warm paper, not pure white SaaS chrome.

Use gradients sparingly. The existing gradient families are acceptable for brand moments, illustrated dashboard cards, and key CTAs. Do not apply gradients to long-form content, dense tables, or status labels where they reduce scannability.

Status colors must remain semantic. A module accent is not a health state. Do not color a due task green because it belongs to a green module.

## Typography

Tribu uses **Inter** for product UI and **JetBrains Mono** only for compact technical or numeric details. The tone is clear, humane, and slightly dense.

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
- Cards and major surfaces use `20px` radii.
- Large hero or display surfaces may use `28px` radii.
- Pills are reserved for chips, badges, segmented actions, and compact CTAs.

Do not mix sharp enterprise tables with very rounded mobile cards in the same view. When adding a new component, match the surrounding surface radius first, then choose the token.

Member avatars are friendly identity markers. Keep them circular and visually stable. Do not use avatars as decoration when the person assignment is not meaningful.

## Components

### App shell and navigation

The app shell is a persistent household map. Desktop navigation should be structured and compact. Mobile navigation should keep primary family workflows reachable without covering content or becoming translucent.

Navigation labels should describe the family workflow, not the underlying module architecture. Active state needs visible color and shape, not color alone.

### Dashboard cards

Dashboard cards are bento modules. Each card should answer one household question:

- What is next?
- What needs doing?
- Who is responsible?
- What changed?
- What should I open?

A good card has a clear title, one primary value or action, and a small number of secondary details. Avoid cards that are only summaries of database counts unless those counts drive an action.

### Quick Capture

Quick Capture is an action surface, not an inbox-first surface. It should be compact, visible, and biased toward adding real household work quickly. The destination mapping must be obvious: task, shopping, note, event, meal.

### Calendar and weekly planning

Calendar views need density and confidence. Preserve clear date hierarchy, today indication, selected state, assigned people, and location/time metadata. Recurring events and all-day context must not look like errors.

Weekly Plan and printable surfaces may use lighter card treatments, but foreground and background tokens must be paired locally so contrast survives dark themes.

### Tasks and shopping

Tasks and shopping lists are action lists. Rows should make owner, due state, priority, completion, and next action scannable. Avoid decorative icons that compete with checkbox or completion affordances.

Shopping should feel quick and cooperative. Do not hide add-item affordances behind large empty states.

### Notifications

Notifications are parent action surfaces, not transport logs. They should show the human event, module context, local time, and action. Hide raw URLs, provider diagnostics, token fragments, internal IDs, and ISO timestamps.

### Settings and admin

Settings should keep family account/profile/preferences/security on the visible path. Owner/admin/support controls belong behind clearly labeled advanced sections. Avoid mixing family-facing settings with infrastructure diagnostics in the same first viewport.

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
