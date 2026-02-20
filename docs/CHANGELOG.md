# Changelog

## 2026-02-20

- Initiales Tribu Scaffold erstellt
- Docker Compose mit frontend, backend, postgres, redis
- Projekt Doku begonnen (Architektur, Roadmap)
- Auth Basis mit Register, Login und Me Endpoint gebaut
- Family Basis mit Memberships und Endpoint /families/me erweitert
- Kalender v1 implementiert mit Events CRUD API unter /calendar/events
- Frontend Kalender Testbereich fuer Events erstellen und laden hinzugefuegt
- Geburtstage Modul v1 mit API unter /birthdays
- Dashboard Summary API unter /dashboard/summary fuer naechste Termine und Geburtstage in den naechsten 4 Wochen
- Welcome Bereich nach Login zeigt direkt die wichtigsten Infos
- UI zu moderner App Shell mit Sidebar Navigation umgebaut
- Lucide Icons in Navigation und Einstellungen eingebunden
- Feature Struktur im Backend in separate Module zerlegt
- Rollenmodell erweitert: erster Nutzer ist automatisch Admin und Erwachsener
- Design Tokens und Theme Packs eingeführt (Light, Dark, Midnight Glass)
- Plugin Manifest Spezifikation v1 dokumentiert
- i18n Foundation erweitert für Core und Module mit nachladbaren Sprachpaketen
- Neues Kontakte Modul mit CSV Import und automatischer Geburtstagsübernahme
- Kalender Monatsansicht erweitert: Tag klickbar, Tagesdetails dynamisch aufklappbar, Terminformular erst nach Tagauswahl sichtbar
