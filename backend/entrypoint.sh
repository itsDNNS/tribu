#!/bin/sh
set -e

# Fix ownership of mounted volumes (they arrive as root:root)
chown tribu:tribu /backups
if ! su -s /bin/sh tribu -c "test -w /backups"; then
  echo "WARNING: /backups is not writable by tribu - backups will fail" >&2
fi

# gosu provides clean PID 1 signal handling but needs CAP_SETUID
# (unavailable in unprivileged LXC containers).
# In LXC, root is already mapped to an unprivileged host UID,
# so running as root inside the container is safe.
if gosu tribu true 2>/dev/null; then
  exec gosu tribu "$@"
else
  echo "NOTE: gosu unavailable (likely unprivileged LXC), running as root" >&2
  exec "$@"
fi
