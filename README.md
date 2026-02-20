# Tribu

Tribu ist ein selbst hostbarer Familien Organizer gegen Alltagschaos.

## MVP Scope

- Familien Spaces mit Rollen
- Gemeinsamer Kalender
- ToDos und Einkaufslisten
- Familien Chat

## Tech Stack

- Frontend: Next.js
- Backend: FastAPI
- DB: PostgreSQL
- Cache/Realtime vorbereitend: Redis
- Deployment: Docker Compose

## Quick Start

```bash
cd infra
docker compose up --build
```

Danach:
- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- API Docs: http://localhost:8000/docs
