#!/usr/bin/env bash
# Shared launchd helpers for Council button bridge install scripts.

SERVICE_LABEL="com.council.button-bridge"
PLIST_DST="/Library/LaunchDaemons/com.council.button-bridge.plist"

launchd_service_loaded() {
  launchctl print "system/$SERVICE_LABEL" >/dev/null 2>&1
}

stop_launchd_service() {
  if [[ ! -f "$PLIST_DST" ]] && ! launchd_service_loaded; then
    return 0
  fi

  sudo launchctl disable "system/$SERVICE_LABEL" 2>/dev/null || true

  if [[ -f "$PLIST_DST" ]]; then
    sudo launchctl bootout system "$PLIST_DST" 2>/dev/null || true
  fi

  sudo launchctl bootout "system/$SERVICE_LABEL" 2>/dev/null || true

  local attempt
  for attempt in $(seq 1 10); do
    if ! launchd_service_loaded; then
      return 0
    fi
    sleep 0.5
  done

  echo "Warning: launchd service $SERVICE_LABEL is still registered." >&2
  return 1
}

write_launchd_plist() {
  local plist_src="$1"
  local node_bin="$2"
  local install_dir="$3"
  local run_script="$install_dir/run-bridge.sh"
  local tmp_plist
  local tmp_runner

  tmp_plist="$(mktemp /tmp/council-button-bridge.XXXXXX.plist)"
  tmp_runner="$(mktemp /tmp/council-button-bridge.XXXXXX.sh)"

  cat >"$tmp_runner" <<EOF
#!/bin/bash
set -euo pipefail
cd '$install_dir'
exec '$node_bin' dist/button/bridge/src/index.js
EOF

  sudo install -m 755 -o root -g wheel "$tmp_runner" "$run_script"
  rm -f "$tmp_runner"

  sed \
    -e "s|__RUN_SCRIPT__|$run_script|g" \
    -e "s|__INSTALL_DIR__|$install_dir|g" \
    "$plist_src" >"$tmp_plist"

  if ! plutil -lint "$tmp_plist" >/dev/null; then
    plutil -lint "$tmp_plist" >&2
    rm -f "$tmp_plist"
    return 1
  fi

  sudo install -m 644 -o root -g wheel "$tmp_plist" "$PLIST_DST"
  sudo xattr -c "$PLIST_DST" 2>/dev/null || true
  rm -f "$tmp_plist"
}

start_launchd_service() {
  if launchd_service_loaded; then
    echo "launchd service already loaded; restarting..."
    sudo launchctl kickstart -k "system/$SERVICE_LABEL"
    return 0
  fi

  # macOS 15+ may require enable before the first bootstrap.
  sudo launchctl enable "system/$SERVICE_LABEL" 2>/dev/null || true

  if ! sudo launchctl bootstrap system "$PLIST_DST"; then
    echo "launchctl bootstrap failed; retrying after unload..." >&2
    stop_launchd_service || true
    sudo launchctl enable "system/$SERVICE_LABEL" 2>/dev/null || true
    if ! sudo launchctl bootstrap system "$PLIST_DST"; then
      return 1
    fi
  fi

  sudo launchctl enable "system/$SERVICE_LABEL"
  sudo launchctl kickstart -k "system/$SERVICE_LABEL"
}

print_launchd_failure() {
  echo "Failed to load launchd service $SERVICE_LABEL." >&2
  echo >&2
  echo "Plist:" >&2
  ls -la "$PLIST_DST" >&2 || true
  plutil -lint "$PLIST_DST" >&2 || true
  echo >&2
  echo "launchd status:" >&2
  launchctl print "system/$SERVICE_LABEL" 2>&1 | head -30 >&2 || true
  echo >&2
  echo "Recent stderr log:" >&2
  sudo tail -30 /var/log/council-button-bridge.err.log 2>&1 >&2 || true
}
