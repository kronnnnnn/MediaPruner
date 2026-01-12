#!/usr/bin/env bash
set -euo pipefail

# Default directories (should be set via MB_DATA_DIR and MB_LOG_DIR)
: "${MB_DATA_DIR:=/app/data}"
: "${MB_LOG_DIR:=/app/logs}"

# Adjust an unprivileged user UID/GID if provided (useful on Unraid)
if [ -n "${PUID:-}" ] || [ -n "${PGID:-}" ]; then
  echo "Adjusting mediapruner user/group to PUID=${PUID:-}, PGID=${PGID:-}}"
  if [ -n "${PGID:-}" ]; then
    if getent group mediapruner >/dev/null; then
      groupmod -g "${PGID}" mediapruner || true
    else
      groupadd -g "${PGID}" mediapruner || true
    fi
  fi

  if [ -n "${PUID:-}" ]; then
    usermod -u "${PUID}" mediapruner || true
  fi
fi

# Ensure data/log dirs exist and have correct ownership
mkdir -p "$MB_DATA_DIR" "$MB_LOG_DIR"
chown -R mediapruner:mediapruner "$MB_DATA_DIR" "$MB_LOG_DIR" || true

# Run DB migrations if requested (set MB_MIGRATE=true)
if [ "${MB_MIGRATE:-false}" = "true" ]; then
  echo "Running DB migrations..."
  python -m backend.scripts.migrate || true
fi

# Exec the CMD as the mediapruner user for safety
if [ "$(id -u)" = "0" ]; then
  # attempt to use su to drop privileges
  exec su -s /bin/sh mediapruner -c "exec \"$@\""
else
  exec "$@"
fi
