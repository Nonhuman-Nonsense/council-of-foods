#!/usr/bin/env bash
set -euo pipefail

PLIST_DST="/Library/LaunchDaemons/com.council.ptt-bridge.plist"
INSTALL_DIR="/usr/local/lib/council-ptt-bridge"

if [[ "$(uname)" != "Darwin" ]]; then
  echo "This uninstaller is for macOS only." >&2
  exit 1
fi

echo "Stopping bridge..."
sudo launchctl bootout system/com.council.ptt-bridge 2>/dev/null || true

echo "Removing launchd plist..."
sudo rm -f "$PLIST_DST"

echo "Removing install directory..."
sudo rm -rf "$INSTALL_DIR"

echo "ptt-bridge uninstalled."
