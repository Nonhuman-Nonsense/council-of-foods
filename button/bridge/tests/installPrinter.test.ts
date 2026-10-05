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
 * Stand-ins for the CUPS commands, over a fake CUPS kept in $FAKE_CUPS. As in CUPS, a
 * `Default` in $HOME/.cups/lpoptions (what System Settings writes) wins over the server
 * default (what `lpadmin -d` sets). sudo keeps the environment, HOME included, as on macOS.
 */
const FAKE_COMMANDS: Record<string, string> = {
  sudo: `exec "$@"`,
  lpstat: `
[[ "$1" == "-d" ]] || exit 1
printer=""
lpoptions="$FAKE_CUPS/homes$HOME/.cups/lpoptions"
[[ -f "$lpoptions" ]] && printer="$(sed -n 's/^Default //p' "$lpoptions")"
[[ -z "$printer" && -f "$FAKE_CUPS/server-default" ]] && printer="$(cat "$FAKE_CUPS/server-default")"
if [[ -n "$printer" ]]; then echo "system default destination: $printer"; else echo "no system default destination"; fi`,
  lpadmin: `
if [[ "$1" == "-d" ]]; then echo "$2" > "$FAKE_CUPS/server-default"; else echo "$*" >> "$FAKE_CUPS/lpadmin.log"; fi`,
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

    await execFileAsync(
      "bash",
      ["-c", `set -euo pipefail; source "${HELPERS}"; configure_default_printer`],
      {
        env: {
          PATH: `${path.join(dir, "bin")}:${process.env.PATH}`,
          HOME: INSTALLING_USER_HOME,
          FAKE_CUPS: dir,
        },
      },
    );

    const lpadminLog = await readOrNull(path.join(dir, "lpadmin.log"));
    expect({
      serverDefault: await readOrNull(path.join(dir, "server-default")),
      retryJob: /^-p (\S+) -o printer-error-policy=retry-job$/.exec(lpadminLog ?? "")?.[1] ?? null,
    }).toEqual(expected);
  });
});
