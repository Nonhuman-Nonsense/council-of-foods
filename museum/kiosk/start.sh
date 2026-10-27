#!/bin/bash
# Opens the kiosk windows again after stop.sh.
for role in council meter; do
  plist="$HOME/Library/LaunchAgents/com.council.kiosk-$role.plist"
  if [[ -f "$plist" ]]; then
    launchctl bootstrap "gui/$(id -u)" "$plist" 2>/dev/null || true
  fi
done
echo "Kiosk windows starting."
