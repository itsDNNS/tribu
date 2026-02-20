# Tribu Architektur

## Ziel

Tribu ist eine selbst hostbare Familien App fuer Kalender, Aufgaben, Einkauf, Chat und spaeter weitere Module.

## Systemaufbau

- Frontend: Next.js
- Backend: FastAPI
- Datenbank: PostgreSQL
- Cache und später Realtime Features: Redis
- Deployment: Docker Compose

## Modulare Architektur

- Der Core übernimmt Authentifizierung, Familienkontext, Rollen und Modulregistrierung.
- Jedes Feature ist ein eigenes Modul, das an den Core andockt.
- Ein Modul kapselt Router, Datenmodell, Schemas und UI Bereich.
- Änderungen an einem Feature bleiben auf das jeweilige Modul begrenzt.

Aktuelle Backend Module:
- `modules/families_router.py`
- `modules/calendar_router.py`
- `modules/birthdays_router.py`
- `modules/dashboard_router.py`

## Domain Modell (Start)

- User
- Family
- Membership
- CalendarEvent

Ein User kann in mehreren Familien sein. Rollen werden ueber Memberships vergeben.
Kalender Events sind immer genau einer Family zugeordnet.

## Rollen (v1)

- owner
- parent
- child

## API Bereiche (Roadmap)

- /auth
- /families
- /tasks
- /shopping
- /calendar
- /birthdays
- /dashboard
- /chat

## Security Grundlagen

- Passwort Hashing mit pbkdf2_sha256
- JWT fuer Session Token
- Rollencheck auf Familienebene
- Private Daten nur innerhalb einer Family sichtbar
