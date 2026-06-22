#!/usr/bin/env bash
# Download a prebuilt Council button bridge release and install it.
# Apple Silicon (arm64) only. Requires Node 20+ and curl.
set -euo pipefail

REPO="${COUNCIL_BUTTON_BRIDGE_REPO:-Nonhuman-Nonsense/council-of-foods}"
VERSION="${COUNCIL_BUTTON_BRIDGE_VERSION:-${1:-latest}}"
ASSET_PREFIX="council-button-bridge-macos-arm64"

usage() {
  cat <<EOF
Download and install the Council button bridge from GitHub Releases.

Usage:
  curl -fsSL https://raw.githubusercontent.com/${REPO}/main/button/bridge/install/macos/install-release.sh | sudo bash
  curl -fsSL .../install-release.sh | sudo bash -s -- 1.0.0

Environment:
  COUNCIL_BUTTON_BRIDGE_VERSION   Pin version (default: latest button-bridge release)
  COUNCIL_BUTTON_BRIDGE_REPO        GitHub owner/repo (default: ${REPO})

Requires: macOS arm64, Node 20+, curl, python3
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

if [[ "$(uname)" != "Darwin" ]]; then
  echo "This installer is for macOS only." >&2
  exit 1
fi

if [[ "$(uname -m)" != "arm64" ]]; then
  echo "This installer supports Apple Silicon (arm64) only. This machine is $(uname -m)." >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js not found. Install Node 20+ from https://nodejs.org before continuing." >&2
  exit 1
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "curl is required." >&2
  exit 1
fi

resolve_download_url() {
  local version="$1"
  if [[ "$version" != "latest" ]]; then
    echo "https://github.com/${REPO}/releases/download/button-bridge-v${version}/${ASSET_PREFIX}-${version}.tar.gz"
    return
  fi

  python3 - "$REPO" "$ASSET_PREFIX" <<'PY'
import json
import sys
import urllib.error
import urllib.request

repo, prefix = sys.argv[1:3]
url = f"https://api.github.com/repos/{repo}/releases"
req = urllib.request.Request(url, headers={"Accept": "application/vnd.github+json"})
try:
    with urllib.request.urlopen(req, timeout=30) as resp:
        releases = json.load(resp)
except urllib.error.HTTPError as exc:
    print(f"Failed to list releases: HTTP {exc.code}", file=sys.stderr)
    sys.exit(1)

for release in releases:
    tag = release.get("tag_name", "")
    if not tag.startswith("button-bridge-v"):
        continue
    for asset in release.get("assets", []):
        name = asset.get("name", "")
        if name.startswith(prefix) and name.endswith(".tar.gz"):
            print(asset["browser_download_url"])
            sys.exit(0)

print("No button-bridge release tarball found.", file=sys.stderr)
sys.exit(1)
PY
}

TMP_DIR="$(mktemp -d /tmp/council-button-bridge.XXXXXX)"
cleanup() { rm -rf "$TMP_DIR"; }
trap cleanup EXIT

DOWNLOAD_URL="$(resolve_download_url "$VERSION")"
TARBALL="$TMP_DIR/bridge.tar.gz"

echo "Downloading ${DOWNLOAD_URL}"
curl -fsSL "$DOWNLOAD_URL" -o "$TARBALL"
tar -xzf "$TARBALL" -C "$TMP_DIR"

EXTRACTED_DIR="$(find "$TMP_DIR" -mindepth 1 -maxdepth 1 -type d | head -1)"
if [[ -z "$EXTRACTED_DIR" || ! -f "$EXTRACTED_DIR/install/macos/install.sh" ]]; then
  echo "Release archive is missing install/macos/install.sh" >&2
  exit 1
fi

echo "Running installer from extracted release..."
exec "$EXTRACTED_DIR/install/macos/install.sh"
