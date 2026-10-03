#!/bin/bash
# Removes the kiosk windows installed by install.sh. Keeps the Chrome profiles (the council's
# #staff settings live there); --purge removes them too.
set -euo pipefail

APP_DIR="$HOME/Library/Application Support/council-kiosk"
AGENTS_DIR="$HOME/Library/LaunchAgents"

for role in council meter; do
  launchctl bootout "gui/$(id -u)/com.council.kiosk-$role" 2>/dev/null || true
  rm -f "$AGENTS_DIR/com.council.kiosk-$role.plist"
done

if [[ "${1:-}" == "--purge" ]]; then
  rm -rf "$APP_DIR"
  echo "Kiosk windows and their Chrome profiles removed."
else
  rm -f "$APP_DIR/kiosk-window.sh" "$APP_DIR/kiosk.env"
  echo "Kiosk windows removed. Chrome profiles kept in $APP_DIR."
fi
