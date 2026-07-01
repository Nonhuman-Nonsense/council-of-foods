#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=launchd-helpers.sh
source "$SCRIPT_DIR/launchd-helpers.sh"

INSTALL_DIR="/usr/local/lib/council-button-bridge"
LOG_OUT="/var/log/council-button-bridge.log"
LOG_ERR="/var/log/council-button-bridge.err.log"
PURGE_LOGS=0

usage() {
  cat <<'EOF'
Uninstall the Council button bridge launchd daemon.

Usage:
  ./uninstall.sh
  ./uninstall.sh --purge-logs    Also remove /var/log/council-button-bridge*.log

EOF
}

wait_for_bridge_stop() {
  local attempt
  for attempt in $(seq 1 15); do
    if ! curl -fsS "http://127.0.0.1:8765/health" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  return 1
}

for arg in "$@"; do
  case "$arg" in
    --purge-logs) PURGE_LOGS=1 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $arg" >&2; usage; exit 1 ;;
  esac
done

if [[ "$(uname)" != "Darwin" ]]; then
  echo "This uninstaller is for macOS only." >&2
  exit 1
fi

echo "Stopping bridge..."
stop_launchd_service || true

if wait_for_bridge_stop; then
  echo "Bridge stopped."
else
  echo "Warning: bridge still responds on port 8765 after stop." >&2
fi

echo "Removing launchd plist..."
sudo rm -f "$PLIST_DST"

echo "Removing install directory..."
sudo rm -rf "$INSTALL_DIR"

if [[ $PURGE_LOGS -eq 1 ]]; then
  echo "Removing log files..."
  sudo rm -f "$LOG_OUT" "$LOG_ERR"
fi

if [[ -f "$PLIST_DST" ]]; then
  echo "Uninstall failed: plist still present at $PLIST_DST" >&2
  exit 1
fi

if [[ -d "$INSTALL_DIR" ]]; then
  echo "Uninstall failed: install directory still present at $INSTALL_DIR" >&2
  exit 1
fi

if launchd_service_loaded; then
  echo "Uninstall failed: launchd service still registered." >&2
  exit 1
fi

echo "Council button bridge uninstalled."
