# Tribu 2.0: UX and UI direction

Tribu 2.0 is a redesign of the web app and the Flutter app together. Both keep one structure, one wording and one design system; only platform interactions such as swipe gestures, home screen widgets and notification actions may differ, never the features.

## Where Tribu stands

Tribu grew into a careful family operating system with fifteen equal areas. Family life happens across those areas, though: "What is on today?", "What do we still need?", "Who takes care of it?". A review of the phone views (home, calendar, tasks, shopping, meal plan, More sheet) found:

**Structure**
- Tasks and the meal plan, used almost daily, sit behind "More".
- More opens from the tab bar and from the menu icon in the header; there are three searches (header, "Find an area", shopping) and quick capture looks like a fourth.
- Fifteen equal areas even for families who use four.
- Settings mix device choices, account settings and family administration.

**Page layout**
- Five views, five header patterns; the greeting shows twice on home.
- Taglines on every visit ("Everything at a glance.") take 80–120 px above the content.
- Controls before content: the meal plan shows the week picker, list picker, two buttons and slot counters before the plan; tasks show chips, a filter button, a title field and "More options" before the first task.
- Home repeats itself: the next event appears in "Next up" and in "Upcoming events", meals as a status tile and as a card, tasks as a tile and as a list, about four screen heights in total.
- The calendar view carries subscription and feed key setup.

**Interaction**
- Up to seven ways to create something, often several on one page.
- Every task row has edit and delete icons; there are no swipe actions.
- Overdue tasks are marked three times (red border, chip, red date) while every task carries a "Normal" chip.
- Shopping items as tiles: nine items fill a phone screen, each with its own menu.
- Confirmation dialogs for actions that could simply be undone.
- Technical states on screen ("Connecting live…").
- Quick capture stores text as an inbox item, task or shopping item chosen by hand; it does not read dates or people, and it is adult only.

**Visual system**
- Web sizes on phones: 13 px body text, hints at 9–11 px (the stylesheets use 11 px 102 times, 10 px 78 times, 9 px 30 times).
- Purple means everything: brand, primary button, active tab, badges, selection, links.
- Area pastels appear only in some places; member colours, the strongest orientation in a family app, are small initials.
- Theme files (`frontend/themes/*.json`) only name the themes; the actual values live in `globals.css` and in over 300 hard-coded colours.

## Vision: a calm family compass

Tribu answers three questions faster than any other app: **What is on? What is missing? Who takes care of it?**

| Principle | Meaning |
|---|---|
| Day before area | Home is the day as a timeline, not a collection of area cards. |
| Content before controls | Every view shows the things first; filters, week pickers and imports come on demand. |
| One way to create | One capture field understands "Tomorrow 3 pm dentist Max" and creates the right thing. |
| People as colour | Family members carry the colour; areas get neutral icons, status gets semantic colours. |
| Calm as a feature | No taglines in daily use, no technical states, undo instead of confirmation, one accent per screen. |
| Native where it matters | Swipe, haptics, widgets and notification actions in the app; the web app keeps the same features. |

## Information architecture

Phone tab bar: **Today · Plan · ( + ) · Lists · Family**

| Tab | Contains |
|---|---|
| Today | The day's timeline, the week ahead, contextual hints |
| Plan | Calendar (agenda, week, month), meal plan, school timetables, weekly plan print |
| + | Universal capture |
| Lists | Shopping, tasks, templates |
| Family | Members, birthdays and contacts, rewards, gifts, activity |

- The avatar in the header opens account, settings, admin and sign out; the menu icon and the More sheet go away.
- One search for content and areas (⌘K on desktop).
- Families can turn areas off (recipes, gifts, rewards, school timetables); hidden areas leave navigation, search and capture.
- The desktop sidebar shows the same five groups with their sub-areas.

## Core journeys

**Today.** One chronological list: events, due tasks, meals, routines and birthdays, each with the responsible person's avatar; overdue items folded as "Still open"; a one-line week ahead; contextual cards only when useful ("12 items on the list → Start shopping"). An avatar filter applies to the whole view. Layout editing goes away because time orders the day.

**Capture.** "+" opens one text field with recognised suggestions. Rule-based recognition runs on the device (dates and times, family first names, repetition, quantities, catalogue items); several lines create several entries; chips switch the kind; context preselects it (Lists → shopping, Plan → event on the chosen day). Other "+" buttons go away. Children suggesting entries is part of the kids mode (#516).

**Shopping.** Compact rows by default (tiles stay optional), grouped by aisle; tap to put in the basket, long press for details; a full-screen shopping mode that keeps the screen on; "Anna is shopping" instead of connection states; merged duplicates with the recipe they came from; undo instead of delete dialogs.

**Tasks.** Groups Overdue · Today · Upcoming · No date; rows with checkbox, title, due date when set and avatar; priority only when high; swipe right to complete, left to postpone (tonight, tomorrow, next week); tap to edit; overdue shown once, as the date colour.

**Calendar.** Agenda with a swipeable week strip as the phone default, month by pulling the strip down; member colour stripes and the avatar filter; subscriptions, feed keys and import/export move to settings.

**Meal plan.** The week is the content: days × morning, noon, evening with pictures, an unobtrusive "+" in empty slots; swipe between weeks; "Add the week's ingredients" as an action with a preview; suggestions from favourites and recent meals.

**Family.** One card per member with their day; birthdays linked to gift ideas; rewards as progress per child; activity as a quiet history.

**Settings.** Three levels: This device (appearance incl. system, compact view, week start, badge) · My account (profile, colour, password, alerts, phone sync, tokens) · Family (members, areas, displays, sign-in, backups, system, webhooks, household alerts, audit log).

**Feedback.** Undo toasts for everything reversible, confirmation only for irreversible actions; offline actions show at once with a small pending mark; empty states with one sentence and one action; first-visit hints once instead of permanent help links.

## Design system

**Colours.** Warm neutral surfaces, one accent, semantic status colours, member colours as the main orientation. Values are starting points and must pass the accessibility tests of both clients.

| Role | Light | Dark | Use |
|---|---|---|---|
| Background | `#FAF8F5` | `#131116` | app surface |
| Surface | `#FFFFFF` | `#1C1A20` | cards, sheets, lists |
| Surface raised | `#F3F0EC` | `#25222A` | inputs, segment tracks |
| Line | `#E8E3DD` | `#34303A` | dividers, card borders |
| Text | `#1E1A22` | `#F2EFF4` | titles, content |
| Text muted | `#6B6470` | `#A9A3AE` | metadata |
| Accent | `#6E4C8C` | `#C9A9E0` | primary action, active navigation, focus only |
| Accent soft | `#F1EBF6` | `#2C2436` | selected state |
| Success | `#3F7D5A` | `#8FC7A4` | done, saved |
| Warning | `#A8641C` | `#E3B070` | due, overdue |
| Danger | `#B4424F` | `#EE8F99` | errors, delete |
| Info | `#3E78A8` | `#8DBBE3` | hints |

Member palette: violet `#7C5CC4`, blue `#2F80C8`, teal `#12948A`, green `#4E8F3A`, yellow `#C08A00`, orange `#D96C2C`, red `#D1455B`, pink `#C24E9A`, each with a soft tint; used for avatars, event stripes and week strip dots. Area colours no longer fill surfaces.

**Type.** Inter for the interface, Fraunces for display moments (greeting, empty states).

| Style | Size / line height | Weight |
|---|---|---|
| Display (Fraunces) | 32 / 38 | 600 |
| Title L | 24 / 30 | 700 |
| Title M | 20 / 26 | 650 |
| Title S | 17 / 22 | 600 |
| Body | 16 / 24 | 400 |
| Body small | 14 / 20 | 400 |
| Label | 13 / 16 | 600, +2 % tracking |

Nothing below 13 px; tabular figures for times and quantities; text scaling up to 200 % keeps working.

**Space and shape.** 4-point grid (4, 8, 12, 16, 24, 32, 48); page margins 16 phone, 24 tablet, 32 desktop; radii 10 (controls), 16 (cards), 24 (sheets); depth through surfaces and lines, shadows only for sheets and floating buttons; touch targets at least 48 px; list rows 56 or 72 px.

**Motion.** 200 ms standard, 250 ms entering, ease-out; ticking off draws the check and settles the row; swipe reveals the action with a haptic tick at the threshold; reduced motion turns everything into fades.

**Tokens.** One token file drives both clients: the web app generates its CSS variables from it, the Flutter app generates its Dart tokens from a synced copy. Existing variable names map onto the new roles so views can move over one by one.

## Native app additions

Home screen widgets "Today" and "Shopping list"; notification actions ("Done", "Remind me in 1 h", "Add to list"); app shortcuts ("New shopping item", "New event", "Start shopping"); swipe and haptics throughout; keeping the screen on while shopping; sharing into Tribu later.

## Plan

| Phase | Content |
|---|---|
| 0 · Foundation | Shared token file and generators, new colour roles, type scale, surfaces and radii |
| 1 · Lists | Shopping rows, tap and long press, shopping mode, undo; task groups, swipe, cleaner rows |
| 2 · Today and capture | Timeline, avatar filter, contextual cards; universal capture with shared parser test cases |
| 3 · Navigation and plan | New tab bar and header, one search, calendar agenda, meal plan week grid |
| 4 · Family and settings | Family hub, area switches, three settings levels |
| 5 · Native | Widgets, notification actions, shortcuts, kids mode (#516) |

Every phase ships in both clients at once and is compared by screenshot. Each phase is checked with a real family account against simple measures: taps to put milk on the list (today 3–4, goal 2), what it takes to see today's plan (today about four screen heights, goal one screen), taps to complete a task (goal one swipe).
