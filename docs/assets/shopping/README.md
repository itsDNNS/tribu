# Shopping browser captures

These images show the implemented web UI from PR #478, preserving its original
mockup layout and grocery SVG paths. The external preview HTML was not available
during the finishing pass; no replacement design was invented.

- `desktop.png`: Desktop Chrome project, 1448 × 1187 CSS-pixel viewport, full page.
- `mobile.png`: Mobile Chrome (Pixel 7 emulation), 390 × 844 CSS-pixel viewport,
  full page, scrolled to the document bottom before capture.
- `mobile-trip.png`: the same mobile browser in focused shopping mode, viewport capture
  at the top. This avoids stitching its sticky trip header across the checklist.

Capture tests: `frontend/e2e/tests/shopping-visual.spec.js`. They run the actual
Next.js UI with controlled API responses from
`frontend/e2e/helpers/shopping-visual.js` and its shopping seed JSON. WebSockets
are closed in this fixture to prevent unrelated real-server events. The family,
products and meal plan are controlled test data; greeting/date/time use the
browser clock. The development indicator is hidden only in screenshots.

These are browser captures, not native-app screenshots or evidence of database
persistence. `frontend/e2e/tests/shopping.spec.js` separately exercises the real
isolated backend: list and template mutations, atomic edit/move, uploaded photo
and note persistence, conditional check/Undo, archive/history restore and real
meal-plan/recipe ingredient selection. Backend tests additionally verify family,
child, integration-event, stale-state and migration contracts.

To reproduce locally (from `frontend`, with dependencies installed):

```sh
DATABASE_URL=sqlite:////tmp/tribu-shopping-capture.db \
TRIBU_E2E_DB=/tmp/tribu-shopping-capture.db \
DAV_STORAGE_FOLDER=/tmp/tribu-shopping-capture-dav \
BACKEND_PORT=8478 FRONTEND_PORT=3478 \
npm run e2e:local -- shopping-visual.spec.js
```

Use the screenshot attachments under `frontend/test-results`. Full-page mobile
captures must scroll to the last action/document bottom first, so a fixed dock is
shown at the bottom of the document instead of across its middle. Inspect the
resulting desktop, mobile and trip pixels before replacing these files.
