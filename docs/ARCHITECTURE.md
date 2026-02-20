# Tribu Architektur

## Ziel

Tribu ist eine selbst hostbare Familien App fuer Kalender, Aufgaben, Einkauf, Chat und spaeter weitere Module.

## Systemaufbau

- Frontend: Next.js
- Backend: FastAPI
- Datenbank: PostgreSQL
- Cache und spaeter Realtime Features: Redis
- Deployment: Docker Compose

## Domain Modell (Start)

- User
- Family
- Membership

Ein User kann in mehreren Familien sein. Rollen werden ueber Memberships vergeben.

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
- /chat

## Security Grundlagen

- Passwort Hashing mit bcrypt
- JWT fuer Session Token
- Rollencheck auf Familienebene
- Private Daten nur innerhalb einer Family sichtbar
