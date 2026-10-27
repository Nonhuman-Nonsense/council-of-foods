import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

const HELPERS = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../install/macos/launchd-helpers.sh",
);

/**
 * Stand-ins for the macOS commands the installer runs, over a fake Mac kept in $FAKE_MAC.
 * As in CUPS, a `Default` in $HOME/.cups/lpoptions (what System Settings writes) wins over
 * the server default (what `lpadmin -d` sets). sudo keeps the environment, HOME included,
 * as on macOS. `defaults` only tracks the one loginwindow key the installer sets.
 */
const FAKE_COMMANDS: Record<string, string> = {
  sudo: `exec "$@"`,
  lpstat: `
[[ "$1" == "-d" ]] || exit 1
printer=""
lpoptions="$FAKE_MAC/homes$HOME/.cups/lpoptions"
[[ -f "$lpoptions" ]] && printer="$(sed -n 's/^Default //p' "$lpoptions")"
[[ -z "$printer" && -f "$FAKE_MAC/server-default" ]] && printer="$(cat "$FAKE_MAC/server-default")"
if [[ -n "$printer" ]]; then echo "system default destination: $printer"; else echo "no system default destination"; fi`,
  lpadmin: `
if [[ "$1" == "-d" ]]; then echo "$2" > "$FAKE_MAC/server-default"; else echo "$*" >> "$FAKE_MAC/lpadmin.log"; fi`,
  pmset: `
[[ "$*" == "-g batt" ]] || exit 1
if [[ -f "$FAKE_MAC/battery" ]]; then echo " -InternalBattery-0 (id=1)	100%; charged;"; else echo "Now drawing from 'AC Power'"; fi`,
  defaults: `
[[ "$2" == "/Library/Preferences/com.apple.loginwindow" && "$3" == "PowerButtonSleepsSystem" ]] || exit 1
case "$1" in
  write) echo "$5" > "$FAKE_MAC/power-button-sleeps" ;;
  delete) [[ -f "$FAKE_MAC/power-button-sleeps" ]] && rm "$FAKE_MAC/power-button-sleeps" || exit 1 ;;
esac`,
};

const INSTALLING_USER_HOME = "/Users/staff";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "install-printer-"));
  await mkdir(path.join(dir, "bin"));
  for (const [name, body] of Object.entries(FAKE_COMMANDS)) {
    const file = path.join(dir, "bin", name);
    await writeFile(file, `#!/bin/bash\n${body}\n`);
    await chmod(file, 0o755);
  }
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function runHelpers(script: string, env: Record<string, string> = {}) {
  return execFileAsync("bash", ["-c", `set -euo pipefail; source "${HELPERS}"; ${script}`], {
    env: {
      PATH: `${path.join(dir, "bin")}:${process.env.PATH}`,
      HOME: INSTALLING_USER_HOME,
      FAKE_MAC: dir,
      ...env,
    },
  });
}

async function readOrNull(file: string): Promise<string | null> {
  return readFile(file, "utf8").then((text) => text.trim(), () => null);
}

describe("installer default printer", () => {
  it.each([
    {
      name: "keeps the system-wide default the daemon already sees",
      serverDefault: "Museum_Printer",
      userDefault: "Office_Printer",
      expected: { serverDefault: "Museum_Printer", retryJob: "Museum_Printer" },
    },
    {
      name: "makes a default only the installing user has the system-wide one",
      serverDefault: null,
      userDefault: "Museum_Printer",
      expected: { serverDefault: "Museum_Printer", retryJob: "Museum_Printer" },
    },
    {
      name: "leaves printing unconfigured when there is no default at all",
      serverDefault: null,
      userDefault: null,
      expected: { serverDefault: null, retryJob: null },
    },
  ])("$name", async ({ serverDefault, userDefault, expected }) => {
    if (serverDefault) await writeFile(path.join(dir, "server-default"), `${serverDefault}\n`);
    if (userDefault) {
      const cupsDir = path.join(dir, "homes", INSTALLING_USER_HOME, ".cups");
      await mkdir(cupsDir, { recursive: true });
      await writeFile(path.join(cupsDir, "lpoptions"), `Default ${userDefault}\n`);
    }

    await runHelpers("configure_default_printer");

    const lpadminLog = await readOrNull(path.join(dir, "lpadmin.log"));
    expect({
      serverDefault: await readOrNull(path.join(dir, "server-default")),
      retryJob: /^-p (\S+) -o printer-error-policy=retry-job$/.exec(lpadminLog ?? "")?.[1] ?? null,
    }).toEqual(expected);
  });
});

describe("installer power button", () => {
  it.each([
    { name: "a desktop Mac shuts down on it", battery: false, override: undefined, expected: { daemon: "1", sleeps: "false" } },
    { name: "a laptop keeps macOS's own", battery: true, override: undefined, expected: { daemon: "0", sleeps: null } },
    { name: "a laptop can opt in", battery: true, override: "1", expected: { daemon: "1", sleeps: "false" } },
    { name: "a desktop Mac can opt out", battery: false, override: "0", expected: { daemon: "0", sleeps: null } },
  ])("$name", async ({ battery, override, expected }) => {
    if (battery) await writeFile(path.join(dir, "battery"), "");
    // A previous install's setting, which opting out has to undo.
    await writeFile(path.join(dir, "power-button-sleeps"), "false\n");

    const { stdout } = await runHelpers(
      'configure_power_button >/dev/null; echo "$POWER_BUTTON_SHUTDOWN"',
      override === undefined ? {} : { COUNCIL_POWER_BUTTON_SHUTDOWN: override },
    );

    expect({
      daemon: stdout.trim(),
      sleeps: await readOrNull(path.join(dir, "power-button-sleeps")),
    }).toEqual(expected);
  });
});
