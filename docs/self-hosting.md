# Self-Hosting Guide

The GitHub Wiki is the primary documentation entry point for self-hosting Tribu.

Use the current guide here:

[Open the Self-Hosting Guide in the Wiki →](https://github.com/itsDNNS/tribu/wiki/Self-Hosting)

This repository page remains as a compatibility pointer for existing links. Keep detailed setup, operations, integration, backup, update, and troubleshooting guidance in the Wiki so self-hosters have one current place to read.

## Use this guide for

Use the Wiki guide for:

- installing Tribu on your own infrastructure
- configuring environment variables, reverse proxy, SSO, and phone sync
- connecting Home Assistant through REST sensors and Tribu webhooks
- backups, updates, and troubleshooting in production-like setups

## Prerequisites

See [Self-Hosting: Prerequisites](https://github.com/itsDNNS/tribu/wiki/Self-Hosting#prerequisites).

## Quick Start

See [Self-Hosting: Quick Start](https://github.com/itsDNNS/tribu/wiki/Self-Hosting#quick-start).

## Home Assistant

See [Home Assistant integration](https://github.com/itsDNNS/tribu/wiki/Home-Assistant).

## Configuration Reference

See [Self-Hosting: Configuration Reference](https://github.com/itsDNNS/tribu/wiki/Self-Hosting#configuration-reference).

## Reverse Proxy

See [Self-Hosting: Reverse Proxy](https://github.com/itsDNNS/tribu/wiki/Self-Hosting#reverse-proxy).

## Single Sign-On (OIDC)

See [Self-Hosting: Single Sign-On](https://github.com/itsDNNS/tribu/wiki/Self-Hosting#single-sign-on-oidc) and [Single Sign-On (OIDC)](https://github.com/itsDNNS/tribu/wiki/Single-Sign-On-(OIDC)).

## Push Notifications (Optional)

See [Self-Hosting: Push Notifications](https://github.com/itsDNNS/tribu/wiki/Self-Hosting#push-notifications-optional).

## Household Notification Destinations (Optional)

Admins can add Apprise-backed destinations for human-readable household reminders, such as Gotify, ntfy, Telegram, Matrix, or email. Use placeholder examples in public docs and screenshots, for example `ntfy://ntfy.sh/family-topic` or `gotify://host.example/token`, not real tokens.

Destination URLs are stored encrypted with a key derived from `NOTIFICATION_DESTINATION_SECRET_KEY` when set, otherwise `JWT_SECRET`. Keep that secret stable across upgrades and restores. Existing legacy plaintext rows are still readable so old installs can upgrade in place, but newly saved or updated destinations are encrypted.

External destinations are another place where household data is visible. Delivery depends on the destination platform and is not guaranteed. If Apprise is not installed in the backend image, Tribu keeps in-app and browser push notifications working, allows admins to save destinations for later, and disables test sends until the provider is available.

By default Tribu only allows destination URLs that resolve to globally routable addresses, and blocks unresolved hostnames plus loopback, link-local, private, shared, multicast, reserved, or unspecified addresses. The same guard is applied again while Apprise resolves the destination for delivery. This avoids using notification destinations as a server-side request path into the host or LAN. If a self-hosted Gotify, ntfy, Matrix, or SMTP server is intentionally private, allow it explicitly with `NOTIFICATION_DESTINATION_ALLOWED_HOSTS=gotify.lan,192.168.1.10` or, for fully trusted single-household deployments, `NOTIFICATION_DESTINATION_ALLOW_PRIVATE_HOSTS=true`. Prefer the host allowlist over the global switch.

## Phone Sync (CalDAV / CardDAV)

See [Self-Hosting: Phone Sync](https://github.com/itsDNNS/tribu/wiki/Self-Hosting#phone-sync-caldav--carddav).

## Backup & Restore

See [Backup & Restore](https://github.com/itsDNNS/tribu/wiki/Backup-&-Restore).

## Updating

See [Self-Hosting: Updating](https://github.com/itsDNNS/tribu/wiki/Self-Hosting#updating).

## Troubleshooting

See [Self-Hosting: Troubleshooting](https://github.com/itsDNNS/tribu/wiki/Self-Hosting#troubleshooting).
