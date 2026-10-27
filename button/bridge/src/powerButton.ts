import { execFile, spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/**
 * A Mac's power button can sleep the Mac or ask, in a dialog nobody can click without a
 * mouse, whether to shut down; it can't shut down by itself. The kernel logs every press,
 * though, so the bridge (root) watches for that line and shuts the Mac down properly.
 *
 * The line is not an API: if a macOS update rewords it, presses go unnoticed and the
 * button just shows the dialog again. Seen on macOS 27 (Mac mini, Apple silicon):
 *   AppleSMCPMU::_smcNotifyCallout(): HID buttonIndex=1 buttonState=1 notification
 * buttonState=1 is the press, 0 the release; index 1 is the only button logged this way.
 */
export const POWER_BUTTON_LOG_PREDICATE =
  'sender == "AppleSMC" AND eventMessage CONTAINS "HID buttonIndex=1 buttonState=1"';

const PRESS_PATTERN = /HID buttonIndex=1 buttonState=1\b/;

/** Reads one line of `log stream --style ndjson`; other lines (its banner) are not presses. */
export function isPowerButtonPress(line: string): boolean {
  let event: unknown;
  try {
    event = JSON.parse(line);
  } catch {
    return false;
  }
  const message = (event as { eventMessage?: unknown } | null)?.eventMessage;
  return typeof message === "string" && PRESS_PATTERN.test(message);
}

export type LogStreamHandle = { stop(): void };

/** Opens a stream of log lines; `onEnd` is called once, when the stream stops for any reason. */
export type OpenLogStream = (
  onLine: (line: string) => void,
  onEnd: (reason: string) => void,
) => LogStreamHandle;

export const openPowerButtonLogStream: OpenLogStream = (onLine, onEnd) => {
  const child = spawn(
    "/usr/bin/log",
    ["stream", "--style", "ndjson", "--predicate", POWER_BUTTON_LOG_PREDICATE],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  let stderr = "";
  let ended = false;
  const end = (reason: string): void => {
    if (ended) return;
    ended = true;
    onEnd(reason);
  };
  createInterface({ input: child.stdout }).on("line", onLine);
  child.stderr.on("data", (chunk: Buffer) => {
    stderr = (stderr + chunk.toString()).slice(-500);
  });
  child.on("error", (error) => end(error.message));
  child.on("close", (code, signal) => {
    end(stderr.trim() || `log stream exited (${signal ?? `code ${code}`})`);
  });
  return {
    stop: () => {
      ended = true;
      child.kill();
    },
  };
};

export async function shutDownMac(): Promise<void> {
  await execFileAsync("/sbin/shutdown", ["-h", "now"]);
}

export type PowerButtonShutdownOptions = {
  openStream?: OpenLogStream;
  shutDown?: () => Promise<void>;
  restartBaseMs?: number;
  restartMaxMs?: number;
};

/** Shuts the Mac down when its power button is pressed. */
export class PowerButtonShutdown {
  private readonly openStream: OpenLogStream;
  private readonly shutDown: () => Promise<void>;
  private readonly restartBaseMs: number;
  private readonly restartMaxMs: number;
  private restartDelayMs: number;
  private stream: LogStreamHandle | null = null;
  private restartTimer: NodeJS.Timeout | null = null;
  private running = false;
  private shuttingDown = false;

  constructor(options: PowerButtonShutdownOptions = {}) {
    this.openStream = options.openStream ?? openPowerButtonLogStream;
    this.shutDown = options.shutDown ?? shutDownMac;
    this.restartBaseMs = options.restartBaseMs ?? 5_000;
    this.restartMaxMs = options.restartMaxMs ?? 5 * 60_000;
    this.restartDelayMs = this.restartBaseMs;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    console.log("[button-bridge/power] the Mac's power button shuts it down");
    this.open();
  }

  stop(): void {
    this.running = false;
    if (this.restartTimer) clearTimeout(this.restartTimer);
    this.restartTimer = null;
    this.stream?.stop();
    this.stream = null;
  }

  private open(): void {
    this.stream = this.openStream(
      (line) => this.onLine(line),
      (reason) => this.onEnd(reason),
    );
  }

  private onLine(line: string): void {
    // Any output means the stream works, so the next failure starts the backoff over.
    this.restartDelayMs = this.restartBaseMs;
    if (!isPowerButtonPress(line) || this.shuttingDown) return;
    this.shuttingDown = true;
    console.log("[button-bridge/power] power button pressed — shutting the Mac down");
    this.shutDown().catch((error: unknown) => {
      this.shuttingDown = false;
      const message = error instanceof Error ? error.message : String(error);
      console.error("[button-bridge/power] shutdown failed", message);
    });
  }

  private onEnd(reason: string): void {
    this.stream = null;
    if (!this.running) return;
    const delay = this.restartDelayMs;
    this.restartDelayMs = Math.min(this.restartDelayMs * 2, this.restartMaxMs);
    console.warn(`[button-bridge/power] not watching the power button (${reason}); retrying in ${delay}ms`);
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      if (this.running) this.open();
    }, delay);
  }
}
