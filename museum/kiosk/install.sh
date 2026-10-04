#!/bin/bash
# Installs the kiosk windows as launchd agents of the logged-in user (see MUSEUM.md, "Kiosk
# windows"). Run it again to change a setting or update; it replaces what is installed.
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  museum/kiosk/install.sh --council-url URL [--meter-url URL] [options]

  --council-url URL        the council, e.g. https://<host>/sv
  --meter-url URL          the meter on the second screen, e.g. https://<host>/meter?venue=<id>;
                           leave out for a single screen
  --council-profile DIR    the council's Chrome profile folder, where its #staff settings and
                           microphone permission live. Default: a profile of its own
  --council-flags "..."    extra Chrome flags for the council window
  --windowed               ordinary windows instead of kiosk, to try it out on a desk
EOF
}

HERE="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$HOME/Library/Application Support/council-kiosk"
AGENTS_DIR="$HOME/Library/LaunchAgents"
LOG_DIR="$HOME/Library/Logs"

COUNCIL_URL=""
METER_URL=""
COUNCIL_PROFILE="$APP_DIR/council-chrome"
COUNCIL_CHROME_FLAGS=""
KIOSK=1

while [[ $# -gt 0 ]]; do
  case "$1" in
    --council-url) COUNCIL_URL="$2"; shift 2 ;;
    --meter-url) METER_URL="$2"; shift 2 ;;
    --council-profile) COUNCIL_PROFILE="$2"; shift 2 ;;
    --council-flags) COUNCIL_CHROME_FLAGS="$2"; shift 2 ;;
    --windowed) KIOSK=0; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage >&2; exit 1 ;;
  esac
done

if [[ -z "$COUNCIL_URL" ]]; then
  usage >&2
  exit 1
fi
if [[ ! -x "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" ]]; then
  echo "Google Chrome is not installed in /Applications." >&2
  exit 1
fi

mkdir -p "$APP_DIR" "$AGENTS_DIR" "$LOG_DIR"
cp "$HERE/kiosk-window.sh" "$APP_DIR/kiosk-window.sh"
chmod +x "$APP_DIR/kiosk-window.sh"

{
  echo "# Written by museum/kiosk/install.sh; run it again to change these."
  printf 'COUNCIL_URL=%q\n' "$COUNCIL_URL"
  printf 'METER_URL=%q\n' "$METER_URL"
  printf 'COUNCIL_PROFILE=%q\n' "$COUNCIL_PROFILE"
  printf 'METER_PROFILE=%q\n' "$APP_DIR/meter-chrome"
  printf 'COUNCIL_CHROME_FLAGS=%q\n' "$COUNCIL_CHROME_FLAGS"
  printf 'KIOSK=%q\n' "$KIOSK"
} >"$APP_DIR/kiosk.env"

# Started at login, and again 10 s after its window closes; stop.sh stops it until the next login.
write_agent() {
  local role="$1"
  cat >"$AGENTS_DIR/com.council.kiosk-$role.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.council.kiosk-$role</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$APP_DIR/kiosk-window.sh</string>
    <string>$role</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key>
    <false/>
  </dict>
  <key>ThrottleInterval</key>
  <integer>10</integer>
  <key>LimitLoadToSessionType</key>
  <string>Aqua</string>
  <key>StandardOutPath</key>
  <string>$LOG_DIR/council-kiosk-$role.log</string>
  <key>StandardErrorPath</key>
  <string>$LOG_DIR/council-kiosk-$role.log</string>
</dict>
</plist>
EOF
}

# Stopping returns before the old window has closed; loading again before then fails.
stop_agent() {
  local service
  service="gui/$(id -u)/com.council.kiosk-$1"
  launchctl bootout "$service" 2>/dev/null || true
  for _ in $(seq 1 30); do
    launchctl print "$service" >/dev/null 2>&1 || return 0
    sleep 0.5
  done
}

start_agent() {
  launchctl bootstrap "gui/$(id -u)" "$AGENTS_DIR/com.council.kiosk-$1.plist"
}

for role in council meter; do
  stop_agent "$role"
done
write_agent council
start_agent council
echo "Council window installed: $COUNCIL_URL"
if [[ -n "$METER_URL" ]]; then
  write_agent meter
  start_agent meter
  echo "Meter window installed: $METER_URL"
else
  rm -f "$AGENTS_DIR/com.council.kiosk-meter.plist"
fi

echo "Logs: $LOG_DIR/council-kiosk-*.log"
echo "If the meter used to start from a Login Item (council-meter.command), remove it in"
echo "System Settings → General → Login Items, or it opens a second meter."
