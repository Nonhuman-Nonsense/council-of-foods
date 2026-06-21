#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=launchd-helpers.sh
source "$SCRIPT_DIR/launchd-helpers.sh"

BRIDGE_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
INSTALL_DIR="/usr/local/lib/council-button-bridge"
PLIST_SRC="$SCRIPT_DIR/com.council.button-bridge.plist"
REBUILD=0

usage() {
  cat <<'EOF'
Install the Council button bridge as a macOS launchd daemon.

Usage:
  ./install.sh              Install prebuilt artifacts (or build if missing)
  ./install.sh --rebuild    Force npm ci + build before install (dev checkout)

The script uses sudo for system paths and launchd. Node 20+ must be installed.

From a GitHub release (Apple Silicon, no git required):
  curl -fsSL https://raw.githubusercontent.com/Nonhuman-Nonsense/council-of-foods/main/button/bridge/install/macos/install-release.sh | sudo bash

EOF
}

resolve_node_bin() {
  local candidate

  if [[ -n "${NODE_BIN:-}" && -x "${NODE_BIN}" ]]; then
    printf '%s\n' "$NODE_BIN"
    return 0
  fi

  if command -v node >/dev/null 2>&1; then
    command -v node
    return 0
  fi

  for candidate in /opt/homebrew/bin/node /usr/local/bin/node; do
    if [[ -x "$candidate" ]]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done

  return 1
}

resolve_real_path() {
  python3 - "$1" <<'PY'
import os
import sys

print(os.path.realpath(sys.argv[1]))
PY
}

wait_for_health() {
  local url="http://127.0.0.1:8765/health"
  local attempt
  for attempt in $(seq 1 20); do
    if curl -fsS "$url" 2>/dev/null; then
      echo
      return 0
    fi
    sleep 1
  done
  return 1
}

for arg in "$@"; do
  case "$arg" in
    --rebuild) REBUILD=1 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $arg" >&2; usage; exit 1 ;;
  esac
done

if [[ "$(uname)" != "Darwin" ]]; then
  echo "This installer is for macOS only." >&2
  exit 1
fi

if [[ "$(uname -m)" != "arm64" ]]; then
  echo "This installer supports Apple Silicon (arm64) only. This machine is $(uname -m)." >&2
  exit 1
fi

if ! NODE_BIN="$(resolve_node_bin)"; then
  echo "Node.js not found. Install Node 20+ from https://nodejs.org or set NODE_BIN." >&2
  exit 1
fi

NODE_BIN="$(resolve_real_path "$NODE_BIN")"

SOURCE_ENTRYPOINT="$BRIDGE_DIR/dist/button/bridge/src/index.js"
if [[ $REBUILD -eq 1 ]] || [[ ! -f "$SOURCE_ENTRYPOINT" ]]; then
  if [[ ! -f "$BRIDGE_DIR/package.json" ]]; then
    echo "No prebuilt bridge found at $SOURCE_ENTRYPOINT and this is not a dev checkout." >&2
    echo "Use install-release.sh to download a release tarball." >&2
    exit 1
  fi
  echo "Building button bridge..."
  (cd "$BRIDGE_DIR" && npm ci && npm run build)
fi

if [[ ! -f "$SOURCE_ENTRYPOINT" ]]; then
  echo "Bridge entrypoint missing after build: $SOURCE_ENTRYPOINT" >&2
  exit 1
fi

echo "Stopping any existing bridge service..."
stop_launchd_service || true

echo "Installing to $INSTALL_DIR..."
echo "Using Node: $NODE_BIN"
sudo mkdir -p "$INSTALL_DIR"
sudo rm -rf "$INSTALL_DIR"/*
sudo cp -R "$BRIDGE_DIR/package.json" "$BRIDGE_DIR/dist" "$INSTALL_DIR/"
if [[ -d "$BRIDGE_DIR/node_modules" ]]; then
  sudo cp -R "$BRIDGE_DIR/node_modules" "$INSTALL_DIR/"
else
  echo "node_modules not found — installing production dependencies..."
  sudo cp "$BRIDGE_DIR/package.json" "$INSTALL_DIR/"
  (cd "$INSTALL_DIR" && sudo env PATH="$PATH" npm ci --omit=dev)
fi

sudo mkdir -p /var/log
sudo touch /var/log/council-button-bridge.log /var/log/council-button-bridge.err.log

write_launchd_plist "$PLIST_SRC" "$NODE_BIN" "$INSTALL_DIR"

echo "Loading launchd service..."
if ! start_launchd_service; then
  print_launchd_failure
  exit 1
fi

echo "Waiting for bridge health check..."
if wait_for_health; then
  echo "Bridge installed and running."
else
  print_launchd_failure
  exit 1
fi
