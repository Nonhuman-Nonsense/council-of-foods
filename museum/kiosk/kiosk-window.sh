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

# The pointer as "x y", in the same top-left points as `screens`, and the pid of the app in front.
pointer_and_front() {
  osascript -l JavaScript -e '
    ObjC.import("AppKit");
    const mainHeight = $.NSScreen.screens.objectAtIndex(0).frame.size.height;
    const p = $.NSEvent.mouseLocation;
    const front = $.NSWorkspace.sharedWorkspace.frontmostApplication;
    [p.x, mainHeight - p.y, front.isNil() ? 0 : front.processIdentifier].map(Math.round).join(" ");' 2>/dev/null
}

# Seconds since anyone last used a mouse or keyboard on this Mac.
idle_seconds() {
  ioreg -c IOHIDSystem | awk '/HIDIdleTime/ { print int($NF / 1000000000); exit }'
}

# How long nobody may have used the Mac before a kiosk window takes the front from any app.
UNATTENDED_SECONDS=60

# macOS applies a page's cursor, the hidden one too, only while its Chrome is the app in front, and
# nothing puts a kiosk window in front by itself: after a restart the pointer stayed on the council
# until someone clicked, and helper apps that start at login (a mouse's software) take the front
# with a busy beachball. So the window with the pointer on its screen takes the front from the
# other kiosk window, Finder or the login window at once, and from any other app once nobody has
# used the Mac for a minute; until then, that app is someone at work.
keep_front() {
  local px py front sx sy sw sh chrome idle
  read -r px py front <<<"$(pointer_and_front)"
  read -r sx sy sw sh <<<"$(my_screen)"
  [[ -n "$px" && -n "$sh" ]] || return 0
  (( px >= sx && px <= sx + sw && py >= sy && py <= sy + sh )) || return 0
  # This window's Chrome itself; its helpers carry the same flags, after others.
  chrome="$(pgrep -f -- "MacOS/Google Chrome --user-data-dir=$PROFILE " | head -1)"
  [[ -n "$chrome" && "$front" != "$chrome" ]] || return 0
  case "$(ps -o args= -p "$front" 2>/dev/null)" in
    "" | *"--user-data-dir=${COUNCIL_PROFILE:-} "* | *"--user-data-dir=${METER_PROFILE:-} "* | */Finder.app/* | */loginwindow.app/*) ;;
    *) idle="$(idle_seconds)"; (( ${idle:-0} >= UNATTENDED_SECONDS )) || return 0 ;;
  esac
  osascript -l JavaScript -e "ObjC.import('AppKit'); \$.NSRunningApplication.runningApplicationWithProcessIdentifier($chrome).activateWithOptions(1)" >/dev/null 2>&1
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
  keep_front

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
