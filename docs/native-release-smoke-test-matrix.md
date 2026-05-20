# Native release smoke-test matrix

Last updated: 2026-05-20

This matrix tracks the backend/PWA side of the first production-ready iOS and Android release. Native app source, native build configuration, and device-specific smoke evidence live in the separate `itsDNNS/tribu-app` repository.

## Current release status

| Area | iOS | Android | Status | Notes |
|---|---:|---:|---|---|
| Native app project | Tracked in `itsDNNS/tribu-app` | Tracked in `itsDNNS/tribu-app` | Split repo | Native `ios/` and `android/` projects are intentionally owned by the app repository; this repository owns backend/PWA APIs and docs. |
| Backend mobile auth | Covered by automated tests | Covered by automated tests | Passing baseline | `/auth/mobile-login`, `/auth/mobile-refresh`, and `/auth/mobile-logout` return bearer/refresh tokens without browser cookies. |
| Mobile daily API | Covered by automated tests | Covered by automated tests | Passing baseline | `/mobile/daily` enforces family membership and required PAT scopes. |
| Shopping WebSocket sync | Covered by automated tests | Covered by automated tests | Passing baseline | `/ws/shopping/{list_id}` accepts native `Authorization: Bearer` headers and verifies family membership. |
| Native push registration | Covered by automated tests | Covered by automated tests | Passing baseline | Expo-style native subscriptions persist and can receive test notifications. |
| PWA install identity | Covered by automated tests | Covered by automated tests | Passing baseline | Manifest identity and daily shortcuts are tested for the existing web/PWA app. |
| Simulator/device app launch | Tracked in app repo | Tracked in app repo | App-owned | Launch evidence is recorded in `tribu-app/docs/RELEASE_SMOKE_MATRIX.md`. |
| Store release configuration | Tracked in app repo | Tracked in app repo | App-owned | Bundle IDs, signing, native build config, icons, permissions, and store metadata are owned by `itsDNNS/tribu-app`. |
| File import and share flows | API/file payload covered | API/file payload covered | Partial | Backend endpoints for Calendar ICS and Contacts CSV/VCF are covered by app release smoke; platform picker/share-sheet confirmation remains app-owned. |
| SSO callback handling | Backend exchange covered by tests | Backend exchange covered by tests | Partial | Native deep-link handling remains app-owned; `/auth/oidc/mobile-exchange` belongs to this backend. |

## Automated baseline

Run these from the repository root unless noted.

```sh
DATABASE_URL='sqlite:///./test-baseline.db' JWT_SECRET='test-secret-key-for-mobile-baseline' .venv/bin/pytest backend/tests/test_mobile_auth.py backend/tests/test_mobile_daily.py backend/tests/test_shopping_ws_auth.py backend/tests/test_push_diagnostics.py
```

Expected result: `14 passed`.

```sh
cd frontend
npm test -- --runInBand __tests__/public-manifest.test.js __tests__/public-sw.test.js __tests__/hooks/useWebSocket.test.js __tests__/components/NotificationsTab.test.js
```

Expected result: `4 passed` test suites, `12 passed` tests.

## Manual smoke matrix

Use this section with the native app repository. Each check must be run against a non-demo backend with realistic family data.

| Flow | iOS simulator/device | Android emulator/device | Evidence required |
|---|---|---|---|
| Fresh install opens production endpoint selector or configured backend | Pending | Pending | Screenshot of first launch and selected backend. |
| Password login creates bearer and refresh session | Pending | Pending | Login succeeds, `/auth/me` loads, app restart keeps session. |
| Refresh token rotation survives app restart | Pending | Pending | Expired access token refreshes once; old refresh token is rejected. |
| Logout revokes refresh token | Pending | Pending | Reopen app after logout shows signed-out state. |
| SSO login and callback | Pending | Pending | Provider redirect returns to app and loads authenticated user. |
| Invite link opens app and completes onboarding | Pending | Pending | App receives invite/deep link and lands in joined family. |
| Daily dashboard loads real family data | Pending | Pending | Calendar, tasks, shopping summaries, quick capture count, notifications count match backend. |
| Shopping list real-time sync | Pending | Pending | Two clients see add/toggle/delete updates through WebSocket without refresh. |
| Push permission and native subscription | Pending | Pending | Device token stored with platform, push preference enabled. |
| Test push delivery | Pending | Pending | Notification appears when app is backgrounded and opens the expected app view. |
| File import | Pending | Pending | ICS/CSV/VCF or supported document flow imports without exposing parser internals on failure. |
| Share into Tribu | Pending | Pending | Shared text/link/file reaches the intended quick-capture or import flow. |
| Offline and retry behavior | Pending | Pending | App shows a recoverable offline state and resyncs without duplicate writes. |
| Release build launch | Pending | Pending | iOS archive/TestFlight or Android release/AAB build launches without dev server. |
| Store privacy and permissions review | Pending | Pending | Permission prompts, privacy text, and store metadata match actual behavior. |

## Release blockers

1. Keep backend mobile auth, OIDC mobile exchange, push diagnostics, file import/export, and Shopping WebSocket APIs green while app release testing continues.
2. Verify native deep links for SSO, invite links, notification taps, and share/file entry points from `itsDNNS/tribu-app` against this backend.
3. Run the manual smoke matrix on local iOS and Android simulators/emulators from the app repository, then repeat on at least one real iOS and Android device before store submission.
4. Keep backend docs aligned with the split-repository ownership so app release blockers are not hidden in this repository.
