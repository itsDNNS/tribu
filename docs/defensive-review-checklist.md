# Defensive review checklist

Use this checklist when a Tribu change touches authentication, family/admin boundaries, integrations, exports, backups, self-hosted deployment, or shared-device surfaces.

This is a maintainer checklist, not a vulnerability report. Public issues and PRs should describe concrete hardening work calmly.
If a real security vulnerability is found, follow the private disclosure process in [`SECURITY.md`](../SECURITY.md) instead of opening a public issue.

## When to run this checklist

Run the checklist for changes involving any of these areas:

- login, logout, session persistence, cookies, registration, invitations, OIDC, or personal access tokens
- admin-only settings, family membership, adult/child boundaries, or scoped API access
- Shared Home Display pairing, display tokens, display-safe dashboard payloads, or kiosk mode
- webhooks, Home Assistant, push notifications, calendar subscriptions, DAV, or other integrations
- backup, restore, import, export, diagnostics, or logs
- Docker Compose, environment variables, reverse proxy guidance, or other self-hosted defaults
- docs, screenshots, fixtures, examples, or support text that could expose reusable secrets or private deployment details

## PR review checklist

### Auth, sessions, and roles

- [ ] Backend authorization enforces the boundary. UI hiding alone is not enough.
- [ ] Family-scoped queries filter by `family_id` and verify membership or device binding.
- [ ] Admin-only flows require admin role server-side.
- [ ] Adult/child or invite restrictions are enforced server-side where they matter.
- [ ] Login, logout, refresh, password changes, and account deletion handle cookie/session cleanup.
- [ ] Personal access tokens are stored hashed, scoped, and never shown again after creation.
- [ ] OIDC state, redirect, and account-linking behavior are covered for the changed path.

Relevant coverage to check first:

- `backend/tests/test_session_persistence.py`
- `backend/tests/test_registration_policy.py`
- `backend/tests/test_invitation_security.py`
- `backend/tests/test_oidc_flow.py`
- `backend/tests/test_oidc_config.py`
- `backend/tests/test_oidc_admin.py`
- `backend/tests/test_pat_scope_enforcement.py`
- `backend/tests/test_pat_scope_integration.py`
- `backend/tests/test_pat_hash_migration.py`
- `backend/tests/test_pat_bcrypt_properties.py`
- `frontend/e2e/tests/auth.spec.js`

### Shared Home Display and shared-device surfaces

- [ ] Display devices use dedicated display identity, not a normal user session.
- [ ] Display tokens are scoped to one family and revocable.
- [ ] `/display` runtime calls do not fall back to normal app bootstrap or user-session endpoints.
- [ ] Display payloads include only display-safe fields.
- [ ] Member display data stays narrow: display name, optional color, optional validated avatar image.
- [ ] No emails, user IDs, roles, admin flags, invite data, personal sessions, or tokens are sent to display devices.
- [ ] Pairing tokens are scrubbed from URLs after use.

Relevant coverage to check first:

- `backend/tests/test_display_devices.py`
- `frontend/e2e/tests/display.spec.js`
- Wiki: `Shared Home Display`

### Integrations and outbound payloads

- [ ] Webhook payloads contain only the fields needed by subscribers.
- [ ] Webhook secrets are stored separately from displayable metadata.
- [ ] Signing or verification behavior is tested when payload shape or delivery logic changes.
- [ ] Delivery errors, retries, and logs do not expose secrets or full internal payloads unnecessarily.
- [ ] Home Assistant examples use placeholders and least-privilege Tribu token scopes.
- [ ] DAV, calendar subscription, and import paths treat external input as untrusted.
- [ ] Parser failures return bounded user-facing errors without tracebacks, connection strings, or raw remote content.

Relevant coverage to check first:

- `backend/tests/test_webhooks.py`
- `backend/tests/test_quick_capture.py`
- `backend/tests/test_dav_auth.py`
- `backend/tests/test_dav_rights_scopes.py`
- `backend/tests/test_dav_carddav.py`
- `backend/tests/test_dav_caldav_read.py`
- `backend/tests/test_calendar_subscriptions.py`
- `backend/tests/test_calendar_ics_import.py`
- `backend/tests/test_calendar_preview.py`
- `docs/home-assistant.md`
- Wiki: `Home Assistant`

### Backups, restore, imports, exports, and diagnostics

- [ ] Backup and restore actions require the right admin boundary.
- [ ] Restore/import previews do not apply changes before confirmation.
- [ ] Files, archives, and diagnostics avoid path traversal and unbounded extraction.
- [ ] Status endpoints do not leak secrets, host paths, database URLs, or private deployment details.
- [ ] Exported data is scoped to the requesting family/account and documented clearly.
- [ ] Failure messages are useful but do not include stack traces or raw secrets.

Relevant coverage to check first:

- `backend/tests/test_backup_status.py`
- `backend/tests/test_setup_restore_security.py`
- `backend/tests/test_setup_checklist.py`
- `docs/self-hosting.md`
- Wiki: `Backup & Restore`

### Push notifications and device lifecycle

- [ ] Push subscription registration and removal are scoped to the authenticated user/session.
- [ ] Notification payloads are minimal and avoid sensitive body text where a generic prompt is enough.
- [ ] Diagnostics distinguish missing configuration from delivery failures without exposing keys.
- [ ] Retry behavior is bounded and does not create noisy loops.

Relevant coverage to check first:

- `backend/tests/test_notification_reliability.py`
- `backend/tests/test_push_diagnostics.py`
- `frontend/__tests__/components/NotificationsTab.test.js`
- Wiki: `Push Notifications` when maintained

### Self-hosted deployment and public docs

- [ ] `docker/.env.example`, README snippets, docs, and wiki examples use placeholders only.
- [ ] `JWT_SECRET`, `POSTGRES_PASSWORD`, OIDC secrets, webhook secrets, PATs, display tokens, and push keys are never committed with reusable values.
- [ ] New environment variables are documented in the right self-hosting location.
- [ ] Secure cookie, reverse proxy, CORS, persistence, and backup behavior remain clear for self-hosters.
- [ ] Public docs avoid private hostnames, private IPs, real email addresses, and internal deployment details.
- [ ] Public wording avoids implying a known open vulnerability unless a validated finding is handled through the disclosure process.

Relevant docs to check first:

- [`SECURITY.md`](../SECURITY.md)
- [`CONTRIBUTING.md`](../CONTRIBUTING.md)
- [`docs/self-hosting.md`](self-hosting.md)
- [`docker/.env.example`](../docker/.env.example)
- Wiki: `Self-Hosting`, `Single Sign-On (OIDC)`, `Home Assistant`, `Shared Home Display`

## Creating follow-up issues

When the checklist finds a concrete gap, create a small issue for that gap instead of expanding the current PR.

Good follow-up issues include:

- one affected surface or user flow
- current behavior and desired behavior
- files or tests that probably own the fix
- clear acceptance criteria
- public-safe wording

Avoid public follow-up issues that:

- include exploit steps or sensitive reproduction details
- publish tokens, URLs, logs, stack traces, or deployment internals
- claim a vulnerability before it is validated
- bundle several unrelated rewrites into one task

If the gap is a real vulnerability, use GitHub Security Advisories and keep public issue text out of the disclosure path.

## PR description snippet

For PRs that touch any boundary above, add a short section like this:

```markdown
## Defensive review
- Auth/session boundary: checked, no new user-session behavior.
- Family/device scope: backend queries remain scoped by `family_id` or display token.
- Sensitive data: no emails, tokens, secrets, or private deployment details added to payloads, logs, or docs.
- Follow-ups: none / #123 for the separately scoped gap.
```

Keep this section factual. Do not mention internal tooling or unvalidated vulnerability claims.
