#!/bin/bash
# One kiosk window, the council or the meter, run by its launchd agent (see MUSEUM.md, "Kiosk
# windows"). Waits for its screen and for the server, opens Chrome on that screen, and stays
# while Chrome runs. When Chrome closes, the page stops, or its screen goes away or changes, it
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
# How long this window's screen must stay changed before the window reopens there: a projector
# warming up comes and goes for a few seconds.
SETTLE_SECONDS=10

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

# shellcheck disable=SC2329 # called through wait_for
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
server_up() {
  curl -fsS -o /dev/null --max-time 5 "$ORIGIN/health" 2>/dev/null
}

# Why the server doesn't answer: no network at all, a network without the internet, or the
# server itself. captive.apple.com is what macOS itself asks to tell whether it is online.
connection_problem() {
  if ! route -n get default >/dev/null 2>&1; then
    echo no-network
  elif ! curl -fsS --max-time 5 http://captive.apple.com/hotspot-detect.html 2>/dev/null | grep -q Success; then
    echo no-internet
  else
    echo no-server
  fi
}

# What staff see while the server doesn't answer, instead of a black screen: a page on this Mac
# (offline.html, installed next to this script) saying why, from what this script writes into
# offline-<role>.js. Shown only after a while, so a restart's network coming up shows nothing.
OFFLINE_AFTER_SECONDS=15
OFFLINE_PAGE="$HERE/offline.html"
OFFLINE_STATUS="$HERE/offline-$ROLE.js"

# Whether this window's Chrome has a window covering `$1`, its screen. Kiosk mode can fail to go
# full screen on a screen that is still settling (a projector warming up beside it), leaving a
# small window in the corner. Yes when it cannot tell, so only a window seen not to cover it
# restarts.
covers_screen() {
  local chrome
  chrome="$(pgrep -f -- "MacOS/Google Chrome --user-data-dir=$PROFILE " | head -1)"
  [[ -n "$chrome" ]] || return 0
  [[ "$(osascript -l JavaScript -e '
    function run([pid, screen]) {
      ObjC.import("CoreGraphics");
      const windows = ObjC.deepUnwrap(ObjC.castRefToObject($.CGWindowListCopyWindowInfo(0, 0))) || [];
      const covers = windows.some((w) => String(w.kCGWindowOwnerPID) === pid && w.kCGWindowLayer === 0 &&
        [w.kCGWindowBounds.X, w.kCGWindowBounds.Y, w.kCGWindowBounds.Width, w.kCGWindowBounds.Height].map(Math.round).join(" ") === screen);
      return covers ? "yes" : "no";
    }' "$chrome" "$1" 2>/dev/null)" != "no" ]]
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

screen=""
opener=""
# Opens Chrome on this window's screen at `$1`, setting `screen` and `opener`. Fails when the
# screen has gone: one that comes and goes while a projector warms up can be gone a moment after
# it was found, and a window opened at no position lands on the main screen.
open_window() {
  screen="$(my_screen)"
  [[ -n "$screen" ]] || return 1
  local x y args extra
  read -r x y _ <<<"$screen"
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
  log "Opening $1 at $x,$y."
  open -n -W -a "Google Chrome" --args "${args[@]}" "$1" &
  opener=$!
}

# Waits, however long it takes, until the server answers. A window opened while it doesn't
# shows Chrome's error page, which nothing leaves; so the window shows the offline page instead,
# and closes it once the server is back.
wait_for_server() {
  server_up && return 0
  log "Waiting for the server at $ORIGIN."
  local started=$SECONDS since problem="" now
  since="$(date '+%H:%M')"
  until server_up; do
    if [[ -f "$OFFLINE_PAGE" ]] && (( SECONDS - started >= OFFLINE_AFTER_SECONDS )); then
      now="$(connection_problem)"
      if [[ "$now" != "$problem" ]]; then
        problem="$now"
        log "Still no server ($problem); the screen says why."
        printf 'window.kioskStatus = { problem: "%s", since: "%s" };\n' "$problem" "$since" >"$OFFLINE_STATUS"
      fi
      if [[ -z "$opener" ]] || ! kill -0 "$opener" 2>/dev/null; then
        open_window "file://${OFFLINE_PAGE// /%20}#$ROLE" || return 1
      elif [[ "$(my_screen)" != "$screen" ]]; then
        # Gone or moved: wait for it again, from the start.
        close_window
        wait "$opener"
        return 1
      else
        keep_front
      fi
    fi
    sleep "$POLL_SECONDS"
  done
  log "Found the server at $ORIGIN."
  if [[ -n "$opener" ]]; then
    close_window
    wait "$opener"
    opener=""
  fi
}

wait_for has_screen "its screen"
if ! wait_for_server; then
  log "The screen went away or changed while waiting for the server."
  exit 75
fi
if ! open_window "$URL"; then
  log "The screen went away before the window opened."
  exit 75
fi

changed_since=""
uncovered=false
title=""
ticking=false
last_change=$SECONDS
next_check=$((SECONDS + CHECK_SECONDS))

while kill -0 "$opener" 2>/dev/null; do
  sleep "$POLL_SECONDS"
  # macOS moves the windows of a screen that goes away onto the main one: the meter would
  # cover the council. Close it; launchd starts this again, to wait for the screen.
  now_screen="$(my_screen)"
  if [[ -z "$now_screen" ]]; then
    log "The screen went away; closing the window."
    close_window
    wait "$opener"
    exit 75
  fi
  # A window stays where it opened, but which screen is the main one can change under it: a Mac
  # started with only the meter's screen on makes that the main one, so the council opens there,
  # and when the projector comes on, macOS makes it the main one again. So when this window's
  # screen is no longer the one it opened on, and stays so, the window reopens on it.
  if [[ "$now_screen" == "$screen" ]]; then
    changed_since=""
  elif [[ -z "$changed_since" ]]; then
    changed_since=$SECONDS
  elif (( SECONDS - changed_since >= SETTLE_SECONDS )); then
    log "Its screen changed ($screen → $now_screen); reopening the window there."
    close_window
    wait "$opener"
    exit 75
  fi
  keep_front

  # Only a page seen ticking can stop: the council in web mode, or not yet set up, never ticks.
  if (( SECONDS >= next_check )); then
    next_check=$((SECONDS + CHECK_SECONDS))
    # Seen at two checks in a row, so a window still going full screen is left to finish.
    if [[ "${KIOSK:-1}" == "1" ]] && ! covers_screen "$screen"; then
      if $uncovered; then
        log "The window does not fill its screen; reopening it."
        close_window
        wait "$opener"
        exit 75
      fi
      uncovered=true
    else
      uncovered=false
    fi
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
