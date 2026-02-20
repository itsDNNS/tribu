# Tribu Plugin Manifest v1

Ein Plugin ist ein eigenständiges Paket, das sich in den Core einklinkt.

## Dateiname

`plugin.manifest.json`

## Minimalbeispiel

```json
{
  "id": "tribu.calendar",
  "type": "feature",
  "name": "Kalender",
  "version": "1.0.0",
  "compatibility": {
    "tribu": ">=0.3.0"
  },
  "entrypoints": {
    "backend_router": "backend/app/modules/calendar_router.py",
    "frontend_view": "frontend/modules/calendar/view.js",
    "i18n": [
      "frontend/i18n/modules/calendar/de.json",
      "frontend/i18n/modules/calendar/en.json"
    ]
  },
  "permissions": [
    "family:read",
    "family:write"
  ],
  "menu": {
    "label_key": "module.calendar.name",
    "icon": "CalendarDays",
    "order": 20
  }
}
```

## Plugin Typen

- `feature`
- `theme`
- `language-pack`

## Theme Plugin Beispiel

```json
{
  "id": "tribu.theme.midnight",
  "type": "theme",
  "name": "Midnight Glass",
  "version": "1.0.0",
  "compatibility": {
    "tribu": ">=0.3.0"
  },
  "entrypoints": {
    "theme_tokens": "frontend/themes/midnight-glass.json"
  }
}
```
