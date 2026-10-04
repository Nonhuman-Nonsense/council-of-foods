#!/bin/bash
# One kiosk window, the council or the meter, run by its launchd agent (see MUSEUM.md, "Kiosk
# windows"). Waits for its screen and for the server, opens Chrome on that screen, and stays
# while Chrome runs. When Chrome closes, the page stops, or the meter's screen goes away, it
# exits with an error, so launchd starts it again; stop.sh is how staff close the windows.
set -uo pipefail

ROLE="${1:-}"
HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=/dev/null
source "${KIOSK_CONFIG:-$HERE/kiosk.env}"

POLL_SECONDS=2
# How often the page's heartbeat is read, and how long it may stand still before Chrome restarts.
CHECK_SECONDS=30
STALE_SECONDS=120

log() {
  echo "$(date '+%Y-%m-%d %H:%M:%S') [$ROLE] $*"
}

case "$ROLE" in
  council) URL="${COUNCIL_URL:-}"; PROFILE="${COUNCIL_PROFILE:-}"; SCREEN=1; PORT=9222; FLAGS="${COUNCIL_CHROME_FLAGS:-}" ;;
  meter) URL="${METER_URL:-}"; PROFILE="${METER_PROFILE:-}"; SCREEN=2; PORT=9223; FLAGS="${METER_CHROME_FLAGS:-}" ;;
  *) log "Usage: kiosk-window.sh council|meter"; exit 0 ;;
esac
if [[ -z "$URL" || -z "$PROFILE" ]]; then
  log "No URL or profile configured; not starting."
  exit 0
fi

# Every screen as "x y width height" in points, the main screen (the one with the menu bar)
# first. Top-left coordinates, as Chrome's --window-position takes them; macOS counts from
# the bottom left.
screens() {
  osascript -l JavaScript -e '
    ObjC.import("AppKit");
    const screens = $.NSScreen.screens;
    const mainHeight = screens.objectAtIndex(0).frame.size.height;
    const lines = [];
    for (let i = 0; i < screens.count; i++) {
      const f = screens.objectAtIndex(i).frame;
      lines.push([f.origin.x, mainHeight - f.origin.y - f.size.height, f.size.width, f.size.height].map(Math.round).join(" "));
    }
    lines.join("\n");' 2>/dev/null
}

# This window's screen: the main one for the council, the next one for the meter.
my_screen() {
  screens | sed -n "${SCREEN}p"
}

# Waits, however long it takes, logging once, until `$1` succeeds.
wait_for() {
  local check="$1" what="$2"
  if ! "$check"; then
    log "Waiting for $what."
    until "$check"; do sleep "$POLL_SECONDS"; done
  fi
  log "Found $what."
}

has_screen() {
  [[ -n "$(my_screen)" ]]
}

ORIGIN="$(printf '%s' "$URL" | sed -E 's#^(https?://[^/]+).*#\1#')"
# shellcheck disable=SC2329 # called through wait_for
server_up() {
  curl -fsS -o /dev/null --max-time 5 "$ORIGIN/health" 2>/dev/null
}

# The title of this window's tab, as Chrome lists it on its debugging port (this Mac only), or
# nothing when Chrome does not answer. The page ticks a counter in it (client/src/kioskHeartbeat.ts);
# a crashed or hung page, or an error page in its place, does not.
tab_title() {
  local tabs
  tabs="$(curl -fsS --max-time 5 "http://127.0.0.1:$PORT/json/list" 2>/dev/null)" || return 0
  osascript -l JavaScript -e '
    function run([tabs, origin]) {
      const tab = JSON.parse(tabs).find((t) => t.type === "page" && t.url.startsWith(origin));
      return tab ? tab.title : "";
    }' "$tabs" "$ORIGIN" 2>/dev/null
}

wait_for has_screen "its screen"
# A window opened while the server is down shows Chrome's error page, which nothing leaves.
wait_for server_up "the server at $ORIGIN"

read -r x y _ <<<"$(my_screen)"
args=(
  "--user-data-dir=$PROFILE"
  --no-first-run --no-default-browser-check --noerrdialogs --hide-crash-restore-bubble
  --disable-features=Translate
  # A covered window would otherwise slow its timers, the heartbeat's too, to once a minute.
  --disable-background-timer-throttling --disable-renderer-backgrounding
  --disable-backgrounding-occluded-windows
  "--remote-debugging-port=$PORT"
  "--window-position=$x,$y"
)
# KIOSK=0 opens an ordinary window, for trying this out on a desk.
if [[ "${KIOSK:-1}" == "1" ]]; then args+=(--kiosk); else args+=("--window-size=800,600"); fi
read -r -a extra <<<"$FLAGS"
args+=(${extra[@]+"${extra[@]}"})

# Chrome would reopen the tabs of its last run beside the new one: a tab more per restart.
rm -rf "$PROFILE/Default/Sessions" "$PROFILE/Default/Current Session" "$PROFILE/Default/Last Session" \
  "$PROFILE/Default/Current Tabs" "$PROFILE/Default/Last Tabs"

# Through `open`, not the binary: macOS then treats Chrome as an app of its own, so its
# microphone permission and its updates are Chrome's, not this script's.
log "Opening $URL at $x,$y."
open -n -W -a "Google Chrome" --args "${args[@]}" "$URL" &
opener=$!

# Chrome is not this script's child, so stopping the agent would leave its window open. A hung
# Chrome ignores being asked to quit, so after 10 s it is killed.
close_window() {
  pkill -f -- "--user-data-dir=$PROFILE"
  for _ in {1..10}; do
    pgrep -f -- "--user-data-dir=$PROFILE" >/dev/null || return 0
    sleep 1
  done
  pkill -9 -f -- "--user-data-dir=$PROFILE"
}
trap 'log "Stopped; closing the window."; close_window; exit 0' TERM

title=""
ticking=false
last_change=$SECONDS
next_check=$((SECONDS + CHECK_SECONDS))

while kill -0 "$opener" 2>/dev/null; do
  sleep "$POLL_SECONDS"
  # macOS moves the windows of a screen that goes away onto the main one: the meter would
  # cover the council. Close it; launchd starts this again, to wait for the screen.
  if ! has_screen; then
    log "The screen went away; closing the window."
    close_window
    wait "$opener"
    exit 75
  fi

  # Only a page seen ticking can stop: the council in web mode, or not yet set up, never ticks.
  if (( SECONDS >= next_check )); then
    next_check=$((SECONDS + CHECK_SECONDS))
    now="$(tab_title)"
    if [[ "$now" != "$title" ]]; then
      title="$now"
      last_change=$SECONDS
      if ! $ticking && [[ "$title" == *" · "[0-9]* ]]; then
        ticking=true
        log "The page is ticking."
      fi
    elif $ticking && (( SECONDS - last_change >= STALE_SECONDS )); then
      log "The page stopped (\"$title\" for $STALE_SECONDS s); restarting Chrome."
      close_window
      wait "$opener"
      exit 70
    fi
  fi
done

log "Chrome closed."
exit 70
