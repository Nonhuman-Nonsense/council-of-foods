// Council footprint meter — room power reporter for Shelly Gen2+ plugs.
//
// Runs on the plug itself: every few seconds it posts the plug's live power and energy
// counter to the council server, which shows the room's electricity on the meter screen.
// See MUSEUM.md → "Room power plugs".
//
// Setup, once per plug, in the plug's own web page (http://<plug-ip>/):
//   1. Settings → Device name: ending in the number marked on the plug, e.g. CouncilPlug-2.
//   2. Scripts → create a script, paste this file, fill in CONFIG below.
//   3. Save, Start, and switch "Run on startup" on.
// Every plug runs this same script. Which venue a plug is at, and what it powers there, is set
// on the server (COUNCIL_VENUES), so moving the installation never means touching the plugs.

let CONFIG = {
  // Production server; for a local dev server use e.g. "http://192.168.1.20:3001/api/room-power".
  url: "https://council-of-forest.com/api/room-power",
  // COUNCIL_ROOM_POWER_KEY from the server environment.
  key: "PASTE-ROOM-POWER-KEY",
  intervalMs: 5000,
};

let deviceId = Shelly.getDeviceInfo().id;
let inFlight = false;

// The plug's number: the digits its device name ends in ("CouncilPlug-2" → 2). Read every
// time, so renaming needs no restart.
function plugNumber() {
  let name = Shelly.getComponentConfig("sys").device.name;
  if (typeof name !== "string") return null;
  let start = name.length;
  while (start > 0 && "0123456789".indexOf(name[start - 1]) >= 0) start--;
  let digits = name.slice(start);
  if (digits.length === 0 || digits.length > 6 || digits[0] === "0") return null;
  return JSON.parse(digits);
}

// Plugs with a relay expose "switch:0"; metering-only plugs expose "pm1:0". Same fields.
function readMeter() {
  let status = Shelly.getComponentStatus("switch:0");
  if (!status || status.apower === undefined) {
    status = Shelly.getComponentStatus("pm1:0");
  }
  return status;
}

function report() {
  // Never stack requests: a slow network would otherwise exhaust the plug's call slots.
  if (inFlight) return;
  let plug = plugNumber();
  if (plug === null) {
    print("room-power: end this plug's device name in its number, e.g. CouncilPlug-2 (Settings → Device name)");
    return;
  }
  let status = readMeter();
  if (!status || status.apower === undefined) {
    print("room-power: no power meter found");
    return;
  }

  inFlight = true;
  Shelly.call(
    "HTTP.Request",
    {
      method: "POST",
      url: CONFIG.url,
      headers: { "Content-Type": "application/json", "X-Room-Power-Key": CONFIG.key },
      body: JSON.stringify({
        plug: plug,
        deviceId: deviceId,
        watts: status.apower,
        energyCounterWh: status.aenergy.total,
      }),
      timeout: 10,
    },
    function (result, errorCode, errorMessage) {
      inFlight = false;
      if (errorCode !== 0) {
        print("room-power: request failed:", errorMessage);
      } else if (result.code !== 204) {
        print("room-power: server answered", result.code, result.body);
      }
    }
  );
}

Timer.set(CONFIG.intervalMs, true, report);
report();
