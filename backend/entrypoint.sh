#!/bin/sh
set -e

# Fix ownership of mounted volumes (they arrive as root:root)
chown tribu:tribu /backups 2>/dev/null || true

# gosu provides clean PID 1 signal handling but needs CAP_SETUID
# (unavailable in unprivileged LXC containers) - fall back to su
if gosu tribu true 2>/dev/null; then
  exec gosu tribu "$@"
else
  # Build a properly quoted command string to preserve arg boundaries
  cmd=""
  for arg in "$@"; do
    arg=$(printf '%s' "$arg" | sed "s/'/'\\\\''/g")
    cmd="$cmd '$arg'"
  done
  exec su -s /bin/sh tribu -c "exec $cmd"
fi
