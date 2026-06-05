# Native release smoke-test matrix

Last updated: 2026-06-05

This matrix tracks the backend/PWA side of the first production-ready iOS and Android release. Native app source, native build configuration, and device-specific smoke evidence live in the separate `itsDNNS/tribu-app` repository.

## Current release status

| Area | iOS | Android | Status | Notes |
|---|---:|---:|---|---|
| Native app project | Tracked in `itsDNNS/tribu-app` | Tracked in `itsDNNS/tribu-app` | Split repo | Native `ios/` and `android/` projects are intentionally owned by the app repository; this repository owns backend/PWA APIs and docs. |
| Backend mobile auth | Covered by automated tests | Covered by automated tests | Passing baseline | `/auth/mobile-login`, `/auth/mobile-refresh`, and `/auth/mobile-logout` return bearer/refresh tokens without browser cookies. |
| Mobile daily API | Covered by automated tests | Covered by automated tests | Passing baseline | `/mobile/daily` enforces family membership and required PAT scopes. |
| Shopping WebSocket sync | Covered by automated tests | Covered by automated tests | Passing baseline | `/ws/shopping/{list_id}` accepts native `Authorization: Bearer` headers and verifies family membership. |
| Native push registration | Covered by automated tests | Covered by automated tests | Passing baseline | Flutter-compatible FCM subscriptions persist and can receive backend test notifications when FCM credentials are configured; Expo-style subscriptions remain covered for legacy compatibility. |
| Isolated native smoke backend | Covered by Alembic SQLite smoke | Covered by Alembic SQLite smoke | Passing baseline | Fresh local smoke databases can be created with `alembic upgrade head` instead of bypassing migrations with `Base.metadata.create_all`. |
| PWA install identity | Covered by automated tests | Covered by automated tests | Passing baseline | Manifest identity and daily shortcuts are tested for the existing web/PWA app. |
| Simulator/device app launch | Tracked in app repo | Tracked in app repo | App-owned | Launch evidence is recorded in `tribu-app/docs/RELEASE_SMOKE_MATRIX.md`. |
| Store release configuration | Tracked in app repo | Tracked in app repo | App-owned | Bundle IDs, signing, native build config, icons, permissions, and store metadata are owned by `itsDNNS/tribu-app`. |
| File import and share flows | API/file payload covered; app share sheets tracked in app repo | API/file payload covered; app share sheets tracked in app repo | Split pass | Backend endpoints for Calendar ICS and Contacts CSV/VCF are covered by app release smoke; platform picker/share-sheet confirmation is app-owned and recorded in `tribu-app/docs/RELEASE_SMOKE_MATRIX.md`. |
| SSO callback handling | Backend exchange covered by tests; real IdP redirect pending in app repo | Backend exchange covered by tests; real IdP redirect pending in app repo | Backend pass / app pending | `/auth/oidc/mobile-exchange` and callback state binding are backend-covered. The remaining real-provider redirect validation is app/device-owned. |

## Automated baseline

Run these from the repository root unless noted.

```sh
DATABASE_URL='sqlite:///./test-baseline.db' JWT_SECRET='test-secret-key-for-mobile-baseline' .venv/bin/pytest backend/tests/test_mobile_auth.py backend/tests/test_mobile_daily.py backend/tests/test_shopping_ws_auth.py backend/tests/test_push_diagnostics.py
```

Expected result: `16 passed`.

```sh
cd frontend
npm test -- --runInBand __tests__/public-manifest.test.js __tests__/public-sw.test.js __tests__/hooks/useWebSocket.test.js __tests__/components/NotificationsTab.test.js
```

Expected result: `4 passed` test suites, `12 passed` tests.

```sh
cd backend
DATABASE_URL='sqlite:///./test-alembic-smoke.db' JWT_SECRET='release-smoke-test-secret-32-bytes-minimum' ../.venv/bin/pytest tests/test_alembic_revisions.py -q
```

Expected result: `2 passed`.

## App smoke ownership snapshot

The detailed device/simulator smoke matrix is authoritative in `itsDNNS/tribu-app` under `docs/RELEASE_SMOKE_MATRIX.md`. As of 2026-06-05, backend-owned portions are no longer the blocker for these app checks:

| Flow | Backend status | App status pointer |
|---|---|---|
| Fresh install/backend selection | No backend change required | iOS Release simulator and Android release APK evidence recorded in app repo. |
| Password login, refresh, logout | Covered by automated tests and app smokes | iOS and Android UI logout evidence recorded in app repo, including `/auth/mobile-logout` 200s. |
| SSO login and callback | `/auth/oidc/mobile-exchange` and native state binding covered | Real IdP redirect remains app/device-owned pending work. |
| Invite link acceptance | Public preview and register-with-invite APIs covered by app release smoke | Visual join completion remains app-owned pending work. |
| Daily dashboard | `/mobile/daily` covered by tests and app smokes | iOS and Android release simulator/emulator dashboard evidence recorded in app repo. |
| Shopping WebSocket sync | Native bearer WebSocket auth covered by tests and app API smoke | Flaky-network device validation remains app-owned pending work. |
| Native push diagnostics | FCM subscription and test-send backend paths covered by tests; backend delivery requires `FCM_SERVICE_ACCOUNT_JSON` or `FIREBASE_SERVICE_ACCOUNT_JSON` plus project id, or `GOOGLE_APPLICATION_CREDENTIALS`. | Physical device token registration/delivery remains app-owned pending work. |
| File import/export and share | Calendar ICS and Contacts CSV/VCF payload APIs covered by app release smoke | Platform share-sheet evidence is tracked in app repo. |
| Store/privacy/signing | Backend has no signing/store ownership | App identifiers, permissions, metadata, and signing blockers are tracked in app repo. |

## Release blockers

1. Keep backend mobile auth, OIDC mobile exchange, push diagnostics, file import/export, and Shopping WebSocket APIs green while final app release testing continues.
2. Support the app-owned remaining checks: real IdP SSO redirect, physical-device push delivery, invite visual join completion, flaky-network behavior, and final share/file entry points.
3. Do not move app-owned release artifacts, signing credentials, native build configuration, or store metadata into this repository.
4. Keep this split-repository ownership aligned so native app release blockers are visible in `itsDNNS/tribu-app`, not duplicated as stale pending rows here.
