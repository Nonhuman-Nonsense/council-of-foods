#!/bin/bash
# Closes the kiosk windows, so staff can use the Mac, until start.sh or the next login.
for role in council meter; do
  launchctl bootout "gui/$(id -u)/com.council.kiosk-$role" 2>/dev/null || true
done
echo "Kiosk windows closed. They come back with start.sh, or when the Mac restarts."
