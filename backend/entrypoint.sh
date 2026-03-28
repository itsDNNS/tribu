#!/bin/sh
set -e

# Fix ownership of mounted volumes (they arrive as root:root)
chown tribu:tribu /backups

exec su -s /bin/sh tribu -c "$*"
