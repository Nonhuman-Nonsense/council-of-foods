#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
INSTALL_DIR="/usr/local/lib/council-ptt-bridge"
PLIST_SRC="$ROOT/button/bridge/install/macos/com.council.ptt-bridge.plist"
PLIST_DST="/Library/LaunchDaemons/com.council.ptt-bridge.plist"
NODE_BIN="${NODE_BIN:-$(command -v node)}"

if [[ "$(uname)" != "Darwin" ]]; then
  echo "This installer is for macOS only." >&2
  exit 1
fi

if [[ -z "$NODE_BIN" ]]; then
  echo "Node.js not found. Install Node 20+ or set NODE_BIN." >&2
  exit 1
fi

echo "Building bridge..."
(cd "$ROOT/button/bridge" && npm ci && npm run build)

echo "Installing to $INSTALL_DIR..."
sudo mkdir -p "$INSTALL_DIR"
sudo rm -rf "$INSTALL_DIR"/*
sudo cp -R "$ROOT/button/bridge/package.json" "$ROOT/button/bridge/dist" "$INSTALL_DIR/"
sudo cp -R "$ROOT/button/bridge/node_modules" "$INSTALL_DIR/"

sudo sed "s|/usr/local/bin/node|$NODE_BIN|g" "$PLIST_SRC" | sudo tee "$PLIST_DST" > /dev/null

echo "Loading launchd service..."
sudo launchctl bootout system/com.council.ptt-bridge 2>/dev/null || true
sudo launchctl bootstrap system "$PLIST_DST"
sudo launchctl enable system/com.council.ptt-bridge
sudo launchctl kickstart -k system/com.council.ptt-bridge

echo "Bridge installed. Health check:"
curl -fsS "http://127.0.0.1:8765/health" || echo "Bridge not responding yet — check /var/log/council-ptt-bridge.log"
