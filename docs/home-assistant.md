# Home Assistant integration

Tribu can connect to Home Assistant without a cloud service. The first supported path is a Home Assistant package that combines Tribu's REST API with outbound webhook events.

Use this when you want Home Assistant dashboards or automations to show family status from Tribu.

## What this provides

The package in [`integrations/home-assistant/tribu_package.yaml`](../integrations/home-assistant/tribu_package.yaml) provides these Home Assistant entities:

- `sensor.tribu_next_event`
- `sensor.tribu_open_tasks`
- `sensor.tribu_open_shopping_items`
- `sensor.tribu_upcoming_birthdays`

It also includes:

- a Home Assistant webhook automation that receives Tribu outbound webhook events
- `rest_command.tribu_add_quick_capture` for adding a note to Tribu from Home Assistant
- a dashboard card example in [`integrations/home-assistant/dashboard-card.yaml`](../integrations/home-assistant/dashboard-card.yaml)

## Prerequisites

- A running Tribu instance reachable from Home Assistant.
- A Tribu adult or admin account.
- A Tribu personal access token with the smallest practical scope set.
- Home Assistant packages enabled, or a place where you can paste package YAML.

## Tribu scopes used by the package

Create a dedicated personal access token for Home Assistant. Do not reuse your normal browser session.

Recommended scopes for the package:

- `calendar:read` for `sensor.tribu_next_event` and birthdays from the dashboard summary endpoint
- `tasks:read` for `sensor.tribu_open_tasks`
- `shopping:read` for `sensor.tribu_open_shopping_items`
- `quick_capture:write` only if you want Home Assistant to call `rest_command.tribu_add_quick_capture`
- `admin:write` only if the same token also manages outbound webhook endpoints through the Tribu API

If you only want read-only sensors, do not grant write scopes.

## Setup

### 1. Create a Tribu token

In Tribu, create a personal access token for Home Assistant and copy it once. Store it in Home Assistant `secrets.yaml`, not in the package file.

Example `secrets.yaml` values:

```yaml
tribu_url: https://tribu.example.com
tribu_family_id: 1
tribu_token: replace-with-the-token-shown-once
tribu_authorization_header: "Bearer replace-with-the-token-shown-once"
tribu_dashboard_summary_url: "https://tribu.example.com/api/dashboard/summary?family_id=1"
tribu_open_tasks_url: "https://tribu.example.com/api/tasks?family_id=1&status=open&limit=1"
tribu_shopping_lists_url: "https://tribu.example.com/api/shopping/lists?family_id=1"
tribu_quick_capture_url: "https://tribu.example.com/api/quick-capture"
tribu_webhook_id: choose-a-long-random-home-assistant-webhook-id
```

Do not paste token values into screenshots, GitHub issues, logs, or support requests.

A redacted Authorization header should look like this in docs or logs:

```text
Authorization: Bearer *** tribu_token
```

When an example supports direct Home Assistant secret substitution, prefer references such as `!secret tribu_url`, `!secret tribu_token`, and `!secret tribu_family_id` instead of copying raw values.

### 2. Enable packages in Home Assistant

If packages are not enabled yet, add this to Home Assistant `configuration.yaml`:

```yaml
homeassistant:
  packages: !include_dir_named packages
```

Create the directory if needed:

```bash
mkdir -p /config/packages
```

Copy [`tribu_package.yaml`](../integrations/home-assistant/tribu_package.yaml) into `/config/packages/tribu.yaml` and restart Home Assistant.

### 3. Add the dashboard card

Copy the contents of [`dashboard-card.yaml`](../integrations/home-assistant/dashboard-card.yaml) into a Lovelace manual card. The card displays:

- next Tribu event
- open tasks
- open shopping items
- upcoming birthdays

## Quick capture from Home Assistant

The package includes `rest_command.tribu_add_quick_capture`. Use it from a script, button, or automation like this:

```yaml
action: rest_command.tribu_add_quick_capture
data:
  family_id: !secret tribu_family_id
  text: "Buy oat milk"
  destination: shopping
```

Allowed destinations are `inbox`, `task`, and `shopping`. Start with `inbox` when testing a new token.

## Outbound webhook events from Tribu

Tribu can send outbound webhooks to Home Assistant. Create a Home Assistant webhook automation with a secret `tribu_webhook_id`, then create a Tribu webhook endpoint that points to:

```text
https://home-assistant.example.com/api/webhook/<tribu_webhook_id>
```

Subscribe that endpoint to useful Tribu events, for example:

- `calendar.event.created`
- `task.created`
- `task.updated`
- `shopping.item.created`
- `shopping.item.updated`
- `quick_capture.created`
- `birthday.created`

The package includes a simple persistent notification automation so you can verify that Home Assistant receives events. Replace it with your own automations when the connection works.

## Dashboard example

The dashboard example is intentionally small. Start with this first, then build your own room dashboard or family overview once the sensors update correctly.

```yaml
type: entities
title: Tribu household
entities:
  - entity: sensor.tribu_next_event
  - entity: sensor.tribu_open_tasks
  - entity: sensor.tribu_open_shopping_items
  - entity: sensor.tribu_upcoming_birthdays
```

## Privacy boundaries

- Tribu data shown in Home Assistant becomes visible to people and integrations that can access your Home Assistant instance.
- The package reads only family summary, open task count, shopping list counts, and upcoming birthday count by default.
- The quick-capture command is opt-in and requires `quick_capture:write`.
- Do not put full Tribu tokens, webhook IDs, or real private URLs into package YAML committed to a repository.
- Keep Home Assistant diagnostics and screenshots redacted when asking for help.

## Troubleshooting

### Sensors are unavailable

- Check that `tribu_url` points to the externally reachable Tribu URL.
- Check that the REST URLs include `/api/` when you access Tribu through the frontend/reverse proxy.
- Check that the token has the required read scopes.
- Confirm Home Assistant can reach Tribu from inside the HA container or host.

### Sensors show zero or empty data

- Confirm `tribu_family_id` matches your family id.
- Open the matching Tribu API URL in a browser while authenticated, or test with curl using the redacted pattern above.
- For shopping, make sure the package points to `/api/shopping/lists?family_id=...`.

### Webhook events do not arrive

- Confirm the Home Assistant automation uses the same `tribu_webhook_id` stored in `secrets.yaml`.
- Confirm the Tribu webhook endpoint uses `/api/webhook/<id>` on the Home Assistant side.
- Use the Tribu webhook test button first. The Tribu UI should show a delivery status without exposing the full URL or token.
- Check Home Assistant automation traces for the webhook automation.

### Quick capture fails

- Make sure the token includes `quick_capture:write`.
- Make sure the payload includes the current `tribu_family_id`.
- Start with destination `inbox`, then try `task` or `shopping` after the basic command works.
