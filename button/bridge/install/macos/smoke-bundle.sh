#!/usr/bin/env bash
# Smoke-test install scripts without launchd (runs the staged bundle directly).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BRIDGE_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

if ! NODE_BIN="$(command -v node)"; then
  echo "node not found" >&2
  exit 1
fi

SOURCE_ENTRYPOINT="$BRIDGE_DIR/dist/button/bridge/src/index.js"
if [[ ! -f "$SOURCE_ENTRYPOINT" ]]; then
  echo "Building bridge first..."
  (cd "$BRIDGE_DIR" && npm ci && npm run build)
fi

TMP_DIR="$(mktemp -d /tmp/council-button-bridge-smoke.XXXXXX)"
cleanup() {
  if [[ -n "${PID:-}" ]] && kill -0 "$PID" 2>/dev/null; then
    kill "$PID" 2>/dev/null || true
    wait "$PID" 2>/dev/null || true
  fi
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

cp "$BRIDGE_DIR/package.json" "$TMP_DIR/"
cp -R "$BRIDGE_DIR/dist" "$TMP_DIR/"
cp -R "$BRIDGE_DIR/node_modules" "$TMP_DIR/"

ENTRYPOINT="$TMP_DIR/dist/button/bridge/src/index.js"
PORT=18765
export BUTTON_BRIDGE_PORT="$PORT"

(cd "$TMP_DIR" && "$NODE_BIN" "$ENTRYPOINT") &
PID=$!

for _ in $(seq 1 20); do
  if curl -fsS "http://127.0.0.1:${PORT}/health" >/dev/null 2>&1; then
    curl -fsS "http://127.0.0.1:${PORT}/health"
    echo
    echo "Install bundle smoke test passed."
    exit 0
  fi
  sleep 0.5
done

echo "Bundle did not become healthy on port $PORT" >&2
exit 1
