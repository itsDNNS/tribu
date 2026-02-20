# Plugin Manifest Specification v1

Tribu uses a plugin manifest system to declare modules, themes, and language packs. Each plugin is a self-contained package that hooks into the core.

## File Convention

Each plugin directory contains a `plugin.manifest.json` (or `<name>.plugin.manifest.json` for co-located manifests).

## Plugin Types

| Type | Description | Example |
|------|-------------|---------|
| `feature` | Full module with backend router, frontend view, and i18n | Calendar, Contacts |
| `theme` | Design token set for the theme engine | Dark, Midnight Glass |
| `language-pack` | Translation files for a locale | French language pack |

## Feature Plugin

```json
{
  "id": "tribu.calendar",
  "type": "feature",
  "name": "Calendar",
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

### Fields

| Field | Required | Description |
|-------|----------|-------------|
| `id` | yes | Unique plugin identifier (reverse domain style) |
| `type` | yes | `feature`, `theme`, or `language-pack` |
| `name` | yes | Human-readable name |
| `version` | yes | Semver version string |
| `compatibility.tribu` | no | Minimum Tribu version required |
| `entrypoints` | yes | Paths to plugin components |
| `permissions` | no | Required permissions (for feature plugins) |
| `menu` | no | Sidebar menu entry configuration |

### Menu Configuration

| Field | Description |
|-------|-------------|
| `label_key` | i18n key for the menu label |
| `icon` | Lucide icon name |
| `order` | Sort order in sidebar (lower = higher) |

## Theme Plugin

```json
{
  "id": "tribu.theme.midnight-glass",
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

Theme token files define design variables consumed by the frontend theme engine:

```json
{
  "bg": "#090c18",
  "surface": "#12182b",
  "text": "#e8edff",
  "muted": "#9aa4c7",
  "border": "#2b3558",
  "primary": "#7c3aed",
  "primaryText": "#ffffff",
  "sidebar": "#0f1426",
  "sidebarActive": "#1b2440"
}
```

## Language Pack Plugin

```json
{
  "id": "tribu.lang.fr",
  "type": "language-pack",
  "name": "French",
  "version": "1.0.0",
  "entrypoints": {
    "i18n": [
      "frontend/i18n/core/fr.json",
      "frontend/i18n/modules/calendar/fr.json",
      "frontend/i18n/modules/contacts/fr.json"
    ]
  }
}
```
