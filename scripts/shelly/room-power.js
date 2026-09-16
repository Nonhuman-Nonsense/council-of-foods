// Council footprint meter — room power reporter for Shelly Gen2+ plugs.
//
// Runs on the plug itself: every few seconds it posts the plug's live power and energy
// counter to the council server, which shows the room's electricity on the meter screen.
// See MUSEUM.md → "Room power plugs".
//
// Setup, once per plug, in the plug's own web page (http://<plug-ip>/) → Scripts:
//   1. Create a script, paste this file, fill in CONFIG below.
//   2. Save, Start, and switch "Run on startup" on.
// Every plug in an installation uses the same installationId and key, with its own label.

let CONFIG = {
  // Production server; for a local dev server use e.g. "http://192.168.1.20:3001/api/room-power".
  url: "https://council-of-forest.com/api/room-power",
  // COUNCIL_ROOM_POWER_KEY from the server environment.
  key: "PASTE-ROOM-POWER-KEY",
  // Same as the Installation ID on the council's #staff page.
  installationId: "PASTE-INSTALLATION-ID",
  // What is plugged in, as shown on the meter.
  label: "Projector",
  intervalMs: 5000,
};

let deviceId = Shelly.getDeviceInfo().id;
let inFlight = false;

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
        installationId: CONFIG.installationId,
        deviceId: deviceId,
        label: CONFIG.label,
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
