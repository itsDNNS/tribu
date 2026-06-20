# Native app release readiness

Native iOS, Android, and Flutter Web release evidence is owned by the dedicated app repository, not this backend/PWA repository.

Use the app repository source of truth:

- Release gate issue: [itsDNNS/tribu-app#14](https://github.com/itsDNNS/tribu-app/issues/14)
- Device smoke tracking: [itsDNNS/tribu-app#10](https://github.com/itsDNNS/tribu-app/issues/10)
- Release smoke matrix: [tribu-app/docs/RELEASE_SMOKE_MATRIX.md](https://github.com/itsDNNS/tribu-app/blob/main/docs/RELEASE_SMOKE_MATRIX.md)
- Store readiness: [tribu-app/docs/STORE_READINESS.md](https://github.com/itsDNNS/tribu-app/blob/main/docs/STORE_READINESS.md)
- Release gate manifests: [tribu-app/docs/release-gates/](https://github.com/itsDNNS/tribu-app/tree/main/docs/release-gates)

This repository remains responsible for the backend and web/PWA surfaces that the app consumes:

- backend auth, refresh, logout, invite, OIDC callback exchange, and scoped token APIs
- backend module APIs used by the app, including dashboard, tasks, calendar, contacts, shopping, meals, files, notifications, and admin settings
- browser PWA behavior, service worker, manifest, and web E2E gates for this repository
- Docker images, self-hosting documentation, API contracts, and backend/web CI

Do not mirror dated native app launch, signing, store, simulator, emulator, or physical-device evidence in this repository. Update the app repository trackers instead.
