#!/usr/bin/env bash
# Stage a prebuilt bridge bundle for museum Mac install (Apple Silicon).
# Used by GitHub Actions and for local release dry-runs.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BRIDGE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$BRIDGE_DIR/../.." && pwd)"

VERSION="${1:-}"
if [[ -z "$VERSION" ]]; then
  echo "Usage: $0 <version>" >&2
  echo "Example: $0 1.0.0" >&2
  exit 1
fi

OUTPUT_DIR="${OUTPUT_DIR:-$REPO_ROOT/release}"
STAGING_NAME="council-button-bridge-macos-arm64-${VERSION}"
STAGING_DIR="$OUTPUT_DIR/$STAGING_NAME"
TARBALL="$OUTPUT_DIR/council-button-bridge-macos-arm64-${VERSION}.tar.gz"

echo "Building bridge in $BRIDGE_DIR..."
(cd "$BRIDGE_DIR" && npm ci && npm run build)

rm -rf "$STAGING_DIR"
mkdir -p "$STAGING_DIR/install/macos"

cp "$BRIDGE_DIR/package.json" "$STAGING_DIR/"
cp -R "$BRIDGE_DIR/dist" "$STAGING_DIR/"
cp -R "$BRIDGE_DIR/node_modules" "$STAGING_DIR/"
cp "$BRIDGE_DIR/install/macos/install.sh" "$STAGING_DIR/install/macos/"
cp "$BRIDGE_DIR/install/macos/uninstall.sh" "$STAGING_DIR/install/macos/"
cp "$BRIDGE_DIR/install/macos/launchd-helpers.sh" "$STAGING_DIR/install/macos/"
cp "$BRIDGE_DIR/install/macos/com.council.button-bridge.plist" "$STAGING_DIR/install/macos/"

echo "Pruning dev dependencies in staging bundle..."
(cd "$STAGING_DIR" && npm prune --omit=dev)

mkdir -p "$OUTPUT_DIR"
tar -czf "$TARBALL" -C "$OUTPUT_DIR" "$STAGING_NAME"

echo "Created $TARBALL"
echo "Test install: tar -xzf $TARBALL -C /tmp && sudo /tmp/$STAGING_NAME/install/macos/install.sh"
