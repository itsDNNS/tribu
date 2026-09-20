# Family administration layout

The admin page adopts the corrected admin mockup: a shared family header, six horizontal sections, compact live counts, a searchable family circle with adult/child filters, and supporting time-format, role-guide and recent-activity cards. Member columns stack according to the available content width; mobile navigation is supplied by the existing app shell.

## Ownership and existing services

- `frontend/components/admin/index.js` composes the overview and loads invitation, active-display and latest-audit counts. Missing summary data is shown as unavailable with a retry action, not as zero.
- `MemberEditor.js` uses the existing create, adult/role, birthday, avatar, password-reset and removal endpoints. Child profiles cannot receive admin rights; permission changes require an explicit confirmation. Self-role changes and self-removal remain unavailable, and backend checks remain authoritative, including instance-admin protection. Failed saves keep the draft and reload members so retries reflect any successful earlier operations.
- `InviteSection.js` retains actual invitation creation/revocation and server base-URL configuration. Status filters distinguish open, exhausted, expired and revoked invitations. Child invitations cannot select admin rights.
- `DisplaysSection.js` retains pairing, one-time token presentation, presets, slot editing, refresh controls and revocation. Editors now use dialogs with reachable footer actions.
- Existing OIDC, backup scheduling/retention/download and audit APIs remain unchanged. The SSO preview is decorative; it does not initiate authentication. Audit search and category filters apply to the loaded entries; pagination remains available.
- `AdminDialog.js` reuses the native dialog used by responsive planning, with an admin icon. The shared dialog retains its default calendar appearance outside admin. Dialogs keep focus, escape handling, scrollable bodies and mobile bottom-sheet placement.
- `frontend/styles/admin.css` scopes the new presentation. German and English UI strings use the existing locale fallback.

This is an integration with the real Tribu service, not the prototype's browser-local AdminStore. No schema migration, simulated invitation acceptance, simulated SSO, fake audit events or local backup store is introduced. Existing account name/email edits remain in each person's own account settings. The member editor exposes the fields supported by the existing family-admin endpoints; prototype-only phone and points-target fields are not invented in the backend.

## Validation and screenshot privacy

Responsive Chromium tests cover all six sections at 320, 390, 768, 1024 and 1448 CSS pixels, filtering, time format, permission confirmation, error/draft retention, resizing, invitation and display forms, and dark dialog keyboard focus. An isolated SQLite-backed API journey covers creating, promoting, demoting and removing a test member with page reloads between changes. Existing display, SSO, backup, calendar and app-shell unit tests are retained.

Published images in `docs/assets/admin/` are generated in fresh browser contexts using `e2e/helpers/admin-visual.js`. All API responses are mocked. Names, addresses, events and audit actors are synthetic demo values; avatars are initials. Images are visually reviewed and checked for embedded text/EXIF metadata before publication. Original reference HTML and screenshots are not committed. These checks do not claim Safari or physical-device validation.
