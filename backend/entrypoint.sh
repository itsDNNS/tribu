#!/bin/sh
# Fix ownership of mounted volumes (they arrive as root:root)
chown -R tribu:tribu /backups

exec gosu tribu "$@"
