# Tribu Product Plan

## Vision

Tribu wird die self hosted Open Source Alternative zu FamilyWall und ähnlichen Apps.

Kernversprechen:
- Familienalltag zentral organisieren
- volle Datenkontrolle durch Self Hosting
- modular erweiterbar durch Feature, Theme und Sprach Packs
- mobile first Bedienung für den Alltag

## Zielgruppe

1. Familien mit hohem Organisationsbedarf
- Eltern mit Schul, Hobby, Arzt, Haushalts Koordination

2. Privacy bewusste Nutzer
- wollen keine sensiblen Familiendaten in proprietären Cloud Silo Plattformen

3. Self Hosting Community
- will anpassbare, offene, integrationsfähige Lösung

## Problem Statement

Bestehende Lösungen sind oft:
- teuer durch Abo Modell
- eingeschränkt bei Anpassbarkeit
- nicht self hosted
- schwach in Integrationen für Home Lab und Open Source Ökosystem

Tribu adressiert genau diese Lücke.

---

## Produkt Prinzipien

1. Mobile first
- jede Kernfunktion muss auf Smartphone sofort nutzbar sein

2. Privacy by default
- sensible Familien und Kinderdaten geschützt

3. Modulare Architektur
- Features getrennt, Addons möglich, klar definierte Schnittstellen

4. Reliability first
- Stabilität und Vertrauen vor Feature Overload

5. Open Core + Community
- klare Contribution Wege für externe Module und Themes

---

## Marktbild und Wettbewerber

### FamilyWall
Stärken:
- All in one Ansatz
- Familien Kalender, Listen, Kommunikation

Schwächen:
- proprietär, Abo Fokus, begrenzte Anpassbarkeit

### Cozi
Stärken:
- sehr gute Familienkalender Basis

Schwächen:
- weniger flexibel für power user und self hosting

### TimeTree
Stärken:
- starke Kalender Kollaboration

Schwächen:
- Fokus nicht auf vollständiges Family Operating System

### Tribu Differenzierung
- self hosted Open Source
- modulare Feature Plattform
- Theme und Sprach Packs
- Home Assistant und MQTT Integration
- klare Datenhoheit für Familien

---

## Must Have Scope

### Foundation
- Authentifizierung und Rollen
- Familienräume und Membership Modell
- Admin und Erwachsen Logik
- sichere Sessions und Rate Limiting

### Kalender
- Monats und Wochenansicht
- dynamische Tagesdetails
- Termin Erstellung direkt am Tag
- wiederkehrende Events
- Erinnerungen

### Aufgaben und Einkauf
- To Do Listen
- Einkaufslisten
- Zuweisungen, Fälligkeit, Priorität
- wiederkehrende Aufgaben

### Kontakte und Geburtstage
- Kontakte Verwaltung
- Import via CSV
- Geburtstage automatisch in Family Birthdays übernehmen
- Geburtstags Reminder

### Benachrichtigungen
- In App und Push Benachrichtigung
- konfigurierbar pro Nutzer

### Settings
- Theme Wechsel
- Sprachwechsel
- Profilbild
- Privacy Optionen

---

## Nische und Positioning

Positioning Satz:

Tribu ist die selbst gehostete Open Source Familienzentrale für Kalender, Aufgaben und Alltag mit voller Datenkontrolle, modular erweiterbar und mobile first.

Strategische Nische:
- FamilyWall Komfort
- kombiniert mit Self Hosting, Open Source, Integrationen und Anpassbarkeit

---

## Roadmap

## Release 0.4
Ziel: solider Alltags MVP

- Kalender Stabilisierung
- To Do und Einkaufslisten Modul
- Kontakte Modul polish
- Geburtstags Reminder Basis
- mobile UX Feinschliff

Akzeptanzkriterien:
- eine Familie kann Alltag über Tribu steuern ohne externe App
- mobile flows sind friction arm

## Release 0.5
Ziel: Vertrauens und Notification Layer

- Push Benachrichtigungen
- wiederkehrende Aufgaben und Termine
- Rollen und Berechtigungen vertiefen
- Import Export Basis, CSV und ICS

Akzeptanzkriterien:
- Erinnerungen funktionieren zuverlässig
- Familien Onboarding unter 10 Minuten

## Release 0.6
Ziel: Community und Erweiterbarkeit

- Plugin Registry Stub
- Theme Marketplace Stub
- Language Pack Loader erweitert
- dokumentiertes Modul SDK v1

Akzeptanzkriterien:
- externes Beispiel Modul installierbar
- externes Theme installierbar

## Release 0.7
Ziel: Integrationen

- Home Assistant Integration v1
- optionale MQTT Events
- Kalender Sync Adapter

Akzeptanzkriterien:
- Kernereignisse aus Tribu als Integrationssignale verfügbar

---

## Architektur Leitplanken

- Core verwaltet Auth, Family Context, Berechtigungen, Modul Registry
- jedes Feature als eigenes Modul
- keine direkte Kopplung zwischen Feature Datenmodellen ohne definierte API
- i18n und Theme Token zentral, pro Modul erweiterbar

Ordnerstruktur Zielbild:
- backend/app/core/
- backend/app/modules/
- frontend/modules/
- frontend/i18n/core + frontend/i18n/modules/
- frontend/themes/

---

## Security und Compliance Prioritäten

1. kein JWT Fallback Secret
2. Auth Rate Limiting aktiv
3. keine unnötig exponierten DB oder Redis Ports
4. Session Security weiter auf httpOnly Cookies entwickeln
5. Audit Log für kritische Änderungen
6. Datenschutzoptionen für Kontakte und Kinderprofile

---

## KPIs

Produkt KPIs:
- aktive Familien pro Woche
- erstellte Termine pro Familie
- erledigte Aufgabenquote
- Reminder Zustellrate

Qualitäts KPIs:
- Crash freie Sitzungen
- durchschnittliche Ladezeit mobil
- Support Issues pro Woche

Open Source KPIs:
- externe Contributors
- Community Module Anzahl
- Theme und Language Pack Beiträge

---

## Was bewusst nicht in MVP gehört

- komplexe KI Assistenz Features
- umfangreiches Finanzmodul
- überkomplexe Social Feed Mechaniken

Erst wenn Kernalltag stabil ist.

---

## Arbeitsauftrag für Claude Code

1. Roadmap in umsetzbare GitHub Issues schneiden
2. für Release 0.4 klare technische Tickets erzeugen
3. pro Ticket Akzeptanzkriterien und Testfälle definieren
4. mobile flows priorisieren
5. Security Punkte als Blocking Criteria markieren

Empfohlene erste Tickets:
- tasks module v1
- shopping module v1
- recurring events v1
- push reminder base
- auth cookie session migration
- mobile navigation refinement

---

## Definition of Done pro Feature

Ein Feature ist done wenn:
- mobile und desktop UX nutzbar
- Tests vorhanden
- i18n Key Coverage vollständig
- Theme Token kompatibel
- Security Review ohne kritische Findings
- Doku aktualisiert
