#!/usr/bin/env bash
# Uninstall Council button bridge without a local git checkout.
set -euo pipefail

REPO="${COUNCIL_BUTTON_BRIDGE_REPO:-Nonhuman-Nonsense/council-of-foods}"
BRANCH="${COUNCIL_BUTTON_BRIDGE_BRANCH:-main}"
PURGE_LOGS=0

usage() {
  cat <<EOF
Uninstall the Council button bridge installed from a GitHub release.

Usage:
  curl -fsSL https://raw.githubusercontent.com/${REPO}/${BRANCH}/button/bridge/install/macos/uninstall-release.sh | sudo bash
  curl -fsSL .../uninstall-release.sh | sudo bash -s -- --purge-logs

Options:
  --purge-logs    Also remove /var/log/council-button-bridge*.log
EOF
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

BASE_URL="https://raw.githubusercontent.com/${REPO}/${BRANCH}/button/bridge/install/macos"
TMP_DIR="$(mktemp -d /tmp/council-button-bridge-uninstall.XXXXXX)"
cleanup() { rm -rf "$TMP_DIR"; }
trap cleanup EXIT

curl -fsSL "$BASE_URL/launchd-helpers.sh" -o "$TMP_DIR/launchd-helpers.sh"
curl -fsSL "$BASE_URL/uninstall.sh" -o "$TMP_DIR/uninstall.sh"
chmod +x "$TMP_DIR/uninstall.sh"

ARGS=()
if [[ $PURGE_LOGS -eq 1 ]]; then
  ARGS+=(--purge-logs)
fi

exec "$TMP_DIR/uninstall.sh" "${ARGS[@]}"
