# Tribu UI Marktanalyse

## Ziel

Diese Analyse beantwortet:

1. Was machen direkte und indirekte Wettbewerber im UI gut
2. Was erwarten Familien bei Family Organizer Apps
3. Was MUSS in Tribu UI rein
4. Welche Nische Tribu im UI besetzen kann

Stand: 2026-02-21

---

## Methodik und Quellen

Ausgewertete Anbieter und Seiten:

- FamilyWall: https://www.familywall.com
- Cozi: https://www.cozi.com/
- TimeTree: https://timetreeapp.com/intl/en
- AnyList: https://www.anylist.com/

Hinweis:
- Einige Suchquellen waren wegen Bot Schutz/API Limitierungen nur eingeschränkt nutzbar.
- Die Kernmuster sind dennoch stabil und konsistent mit dem aktuellen Marktbild.

---

## Wettbewerber: UI Muster

## 1) FamilyWall

Beobachtetes UI Narrativ:
- Fokus auf Shopping Lists und To Dos
- Family Alltag als zentraler Use Case
- emotionales Messaging, alltagsnaher Nutzen

Stärken:
- klare Familienzentrierung
- alltagsorientierte Feature Kommunikation

Typische Schwächen solcher All in one UIs:
- schnell überladen
- tiefe Funktionen oft hinter Premium Gates

## 2) Cozi

Beobachtetes UI Narrativ:
- shared calendar als primärer Einstieg
- farbcodierte Personen und Familienplan
- automatische Updates/Agenda

Stärken:
- extrem klarer Kernflow
- Kalender UX für Familien sofort verständlich

Schwächen:
- wenig modulare Erweiterbarkeit
- weniger flexibel für Power User und Self Hosting

## 3) TimeTree

Beobachtetes UI Narrativ:
- gemeinsamer Kalender als Kommunikationszentrale
- mehrere Gruppenkalender
- Filter und Kalenderwechsel

Stärken:
- sehr gutes Calendar First UX
- starke mobile Nutzungsszenarien

Schwächen:
- weniger Family OS Breite als vollwertiger Organizer
- Premium Layer für erweiterte UX Features

## 4) AnyList (indirekter Wettbewerber)

Beobachtetes UI Narrativ:
- shopping/list first
- extrem schnell, low friction
- starke Sharing Mechanik

Stärken:
- sehr performanter Listenflow
- hohe Nutzbarkeit im Alltag

Schwächen:
- kein vollständiges Familien Betriebssystem
- weniger tiefes Family Context Modell

---

## Was Nutzer im UI wirklich wollen

Übergreifendes Muster:

1. Sofortiger Nutzen nach Login
- heute relevante Informationen sofort sichtbar
- nächste Termine, offene Aufgaben, wichtige Reminder

2. Mobile first Interaktion
- große Touch Targets
- kurze Wege
- klare Primäraktionen

3. Minimale kognitive Last
- keine überfrachteten Dashboards
- klare Priorisierung pro Screen

4. Schnelle Eingaben
- Termin auf Tag erstellen
- Aufgabe in einem Schritt erfassen
- Einkauf in Sekunden ergänzen

5. Sichtbare Zuständigkeiten
- wer macht was
- bis wann
- was ist schon erledigt

6. Vertrauen
- Familien und Kinderdaten sensibel behandeln
- Privacy und Berechtigungen klar erkennbar

---

## UI Anforderungen für Tribu (MUST)

## A) Navigation

- klare modulare Sidebar auf Desktop
- Bottom Navigation auf Mobile
- Dashboard als First Screen nach Login

## B) Dashboard

- Nächste Termine
- Geburtstage in 4 Wochen
- Offene Top Aufgaben
- optional Familienstatus Karte

## C) Kalender

- Monatsansicht standardmäßig oben
- Umschalter Monat/Woche
- Tag klickbar mit dynamischem Detailpanel
- Event Erstellung nur im Tageskontext

## D) Tasks + Shopping

- schnelle Eingabe
- Zuständigkeit und Fälligkeit sichtbar
- Statuswechsel mit einem Tap

## E) Kontakte

- CSV Import
- Geburtstagsübernahme
- klare Kontaktkarten mit minimalem Rauschen

## F) Einstellungen

- Theme Auswahl
- Sprache
- Profilbild
- Rollen und Familienverwaltung

---

## UX Lücken im Markt und Tribu Nische

Hier kann Tribu klar gewinnen:

1. Open Source + Self Hosted + modernes UI
- viele self hosted Tools sind technisch gut, aber UI schwach
- Tribu kann genau dort punkten

2. Modulares UI Ökosystem
- Feature Module
- Theme Packs
- Language Packs

3. Family Privacy by design
- feingranulare Rollen
- lokale Datenhoheit
- transparente Berechtigungen

4. Smart Home und Self Hosting Integrationen
- Home Assistant/MQTT als Differenzierung gegenüber Mainstream Apps

---

## Design Strategie für Tribu

## Design Prinzipien

1. Calm UI
- wenig visuelles Rauschen
- klare Hierarchie

2. One primary action per section
- keine Button Inflation

3. Progressive disclosure
- Details erst auf Interaktion
- Beispiel: Tagespanel erst bei Klick auf Kalendertag

4. Token basiertes Theme System
- UI vollständig über Tokens steuerbar
- Marketplace fähige Theme Packs

## Komponenten Priorität

1. Family Header
- Profilbild, Name, Rolle, aktive Familie

2. Dashboard Cards
- kompakt, priorisiert, mobil stackbar

3. Calendar Grid + Day Drawer
- Kerninteraction für Familienplanung

4. Task Row Component
- Zuständigkeit, Fälligkeit, Status, schnelle Aktionen

5. Contact Card
- Name, Kontaktweg, Geburtstag

---

## Backlog Empfehlung UI (nächste Schritte)

## Sprint UI-1

- Frontend Monolith in modulare Komponenten zerlegen
- Responsive Breakpoints stabilisieren (Phone/Tablet/Desktop)
- Kalender Tag Drawer visuell polishen
- Today Marker im Kalender dauerhaft sichtbar und eindeutig

## Sprint UI-2

- Task und Shopping Module UI bauen
- Dashboard Priorisierung mit echten Signalen
- Empty States und Onboarding Hinweise professionalisieren

## Sprint UI-3

- Theme Pack Registry Stub im UI
- Language Pack Management UI
- Accessibility Basis (Kontrast, Fokus, Tastatur)

---

## Risiko und Gegenmaßnahmen

1. Risiko: Feature Overload
- Gegenmaßnahme: Core Flows zuerst, pro Screen nur zentrale Jobs

2. Risiko: technische Modularität ohne UX Konsistenz
- Gegenmaßnahme: Design Tokens + UI Guidelines für alle Module

3. Risiko: mobile Qualität fällt hinter Desktop zurück
- Gegenmaßnahme: mobile first Definition of Done pro Feature

---

## Fazit

Tribu kann die Lücke zwischen:
- Komfort der proprietären Family Apps
und
- Kontrolle der Self Hosting Welt

schließen, wenn UI Qualität und mobile Alltagstauglichkeit auf demselben Niveau wie die Architektur priorisiert werden.

Das Produktpotenzial ist hoch, wenn Tribu als:
- Family Operating System
- Privacy first
- Modular und erweiterbar

konsequent umgesetzt wird.
