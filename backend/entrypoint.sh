#!/bin/sh
set -e

# Fix ownership of mounted volumes (they arrive as root:root)
chown tribu:tribu /backups

exec gosu tribu "$@"
