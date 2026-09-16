#!/usr/bin/env bash
# Shared launchd helpers for Council button bridge install scripts.

SERVICE_LABEL="com.council.button-bridge"
PLIST_DST="/Library/LaunchDaemons/com.council.button-bridge.plist"

INSTALL_DIR="/usr/local/lib/council-button-bridge"

# Print spool lives next to the bridge code, and survives reinstalls and uninstalls:
# see remove_bridge_code. Staff reach it through a Desktop shortcut; the folder itself
# is not on the Desktop, which macOS privacy protection can block the root daemon from
# writing.
PRINT_SPOOL_DIR="$INSTALL_DIR/print"
PRINT_DESKTOP_LINK_NAME="Council Print"

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
    -e "s|__PRINT_SPOOL_DIR__|$PRINT_SPOOL_DIR|g" \
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

# Removes everything in the install directory except the print spool, whose done/
# folder is the archive of every printed protocol.
remove_bridge_code() {
  if [[ -d "$INSTALL_DIR" ]]; then
    sudo find "$INSTALL_DIR" -mindepth 1 -maxdepth 1 ! -name print -exec rm -rf {} +
  fi
}

# --- printing ---

# Creates the spool so staff (every local account is in group `staff`) can reprint by
# copying a PDF from done/ into pending/, and tidy up, without admin rights.
setup_print_spool() {
  sudo mkdir -p "$PRINT_SPOOL_DIR/pending" "$PRINT_SPOOL_DIR/done"
  # Reachable through the shortcut: every folder on the way must be enterable.
  sudo chmod o+rx "$INSTALL_DIR"
  sudo chown root:staff "$PRINT_SPOOL_DIR" "$PRINT_SPOOL_DIR/pending" "$PRINT_SPOOL_DIR/done"
  sudo chmod 775 "$PRINT_SPOOL_DIR" "$PRINT_SPOOL_DIR/pending" "$PRINT_SPOOL_DIR/done"
}

console_user() {
  local user
  user="$(stat -f%Su /dev/console 2>/dev/null || true)"
  if [[ -z "$user" || "$user" == "root" || "$user" == "loginwindow" ]]; then
    return 1
  fi
  printf '%s\n' "$user"
}

# Puts a shortcut to the spool on the logged-in user's Desktop. Best effort: printing
# works without it.
link_print_spool_on_desktop() {
  local user home link
  if ! user="$(console_user)"; then
    echo "No user logged in at the screen; skipping the Desktop shortcut to $PRINT_SPOOL_DIR."
    return 0
  fi
  home="$(dscl . -read "/Users/$user" NFSHomeDirectory 2>/dev/null | awk '{print $2}')"
  link="${home:-/Users/$user}/Desktop/$PRINT_DESKTOP_LINK_NAME"

  if [[ -e "$link" && ! -L "$link" ]]; then
    echo "Warning: $link exists and is not a shortcut; leaving it alone." >&2
    return 0
  fi
  if sudo ln -sfn "$PRINT_SPOOL_DIR" "$link" && sudo chown -h "$user:staff" "$link"; then
    echo "Desktop shortcut: $link"
  else
    echo "Warning: could not create Desktop shortcut $link." >&2
  fi
}

remove_print_spool_links() {
  local link
  for link in /Users/*/Desktop/"$PRINT_DESKTOP_LINK_NAME"; do
    if [[ -L "$link" && "$(readlink "$link")" == "$PRINT_SPOOL_DIR" ]]; then
      sudo rm -f "$link"
    fi
  done
}

# CUPS stops a printer's whole queue on an error (paper out, printer off) and leaves it
# stopped after the problem is fixed. retry-job keeps the queue running instead.
configure_default_printer() {
  local printer
  printer="$(LANG=C LC_ALL=C lpstat -d 2>/dev/null | sed -n 's/^system default destination: *//p')"
  if [[ -z "$printer" ]]; then
    echo "Warning: no default printer. Protocols will wait in $PRINT_SPOOL_DIR/pending until one is set" >&2
    echo "  (System Settings → Printers & Scanners), then re-run this installer." >&2
    return 0
  fi
  if sudo lpadmin -p "$printer" -o printer-error-policy=retry-job; then
    echo "Printer: $printer (retries jobs after errors)"
  else
    echo "Warning: could not set retry-job policy on $printer." >&2
  fi
}
