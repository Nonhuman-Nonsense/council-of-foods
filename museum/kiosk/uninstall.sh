#!/bin/bash
# Removes the kiosk windows installed by install.sh. Keeps the Chrome profiles (the council's
# #staff settings live there); --purge removes them too.
set -euo pipefail

APP_DIR="$HOME/Library/Application Support/council-kiosk"
AGENTS_DIR="$HOME/Library/LaunchAgents"

# Stopping returns before the window has closed; wait, so nothing still writes to the profiles.
for role in council meter; do
  service="gui/$(id -u)/com.council.kiosk-$role"
  launchctl bootout "$service" 2>/dev/null || true
  for _ in $(seq 1 30); do
    launchctl print "$service" >/dev/null 2>&1 || break
    sleep 0.5
  done
  rm -f "$AGENTS_DIR/com.council.kiosk-$role.plist"
done

if [[ "${1:-}" == "--purge" ]]; then
  rm -rf "$APP_DIR"
  echo "Kiosk windows and their Chrome profiles removed."
else
  rm -f "$APP_DIR/kiosk-window.sh" "$APP_DIR/kiosk.env" "$APP_DIR/offline.html" "$APP_DIR"/offline-*.js
  echo "Kiosk windows removed. Chrome profiles kept in $APP_DIR."
fi
