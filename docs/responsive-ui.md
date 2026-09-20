# Responsive UI and planning

The calendar adapts its presentation to the available content width. Below 800 CSS pixels, month view keeps all seven weekdays and shows colored event dots. Selecting a date reveals complete event cards underneath. Week view shares a seven-day selector and an **One day / Whole week** switch with the weekly and meal planners. Whole-week content runs vertically. Wide calendars retain titles in their day cells and use as many complete week rows as the month needs.

Agenda starts at the selected day, shows chronological dated groups, and loads another 14 days on request. Calendar range requests consume all API pages rather than silently stopping at the default 50 results. Multi-day events still follow the existing exclusive-end-date rules; recurring instances, imported read-only events and member-based colors retain their existing behavior.

Date selection, member filtering and form state live in their existing React owners. Resizing a planner does not mount a second data source or replace an open editor. New calendar events use the selected date. Date navigation includes a date picker and keyboard arrow navigation across month boundaries. Meals can be moved by editing their date in the existing meal form.

## Code ownership

- `frontend/components/responsive/PlannerUI.js`: shared day strip, week presentation switch, day sections, compact month, event cards and empty states.
- `frontend/components/responsive/ResponsiveUI.js`: shared mobile header, navigation, more/quick-create sheets, and connections to existing actions. Family switching, notifications, logout and dashboard customization remain accessible in More.
- `frontend/hooks/useResponsiveUI.js`: content-width measurement with `ResizeObserver`, plus visual viewport measurements for mobile keyboards.
- `frontend/styles/responsive.css`: supplied mockup planner rules and scoped adapters for Tribu's shell, themes and dialogs.
- Existing `useCalendar`, `useMealPlans`, API clients and form handlers remain responsible for data and mutations. No backend schema or database migration is needed.

The shell retains Tribu's existing mobile breakpoint of 768px. The independent 800px planner threshold measures the **content**, so a tablet with an expanded sidebar can use compact planning. The shopping module's `.shop-page` and `.shopping-trip` states suppress the shared navigation, allowing the shopping dock and focused shopping mode to remain in control.

Mobile form panels open at the bottom. The body scrolls while header/actions remain available, including in reduced visual viewports. Desktop forms remain centered. Existing family/child authorization remains in force; quick creation is disabled for children. Weekly plan print output continues to hide application chrome and prints the full week.

## Validation

Automated Chromium checks cover widths from 320 to 1448 CSS pixels, compact/wide transitions, selected dates, family filtering and colors, date jumps and keyboard navigation, draft preservation, reachable save actions, dark sheets, child read-only access, shared meal/weekly controls, and date-based meal moves. Additional browser journeys exercise the actual API for recurring and all-day events, imports, failed saves, profile colors and meal-shopping integration. Unit tests cover API pagination and stale range/family responses.

Browser tests use anonymous demo identities and events. Screenshots are not published with this change. New copy is provided in German and English, with the existing locale fallback for other languages. These checks do not claim physical iPhone or Safari validation.
