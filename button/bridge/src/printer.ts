import { execFile } from "node:child_process";
import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type PrinterState = "idle" | "printing" | "stopped" | "unknown";

export type PrinterStatus = {
  /** CUPS queue the bridge prints to; null when there is no default printer. */
  name: string | null;
  state: PrinterState;
  /** CUPS alerts, e.g. `media-empty-error`. Empty when the printer reports none. */
  alerts: string[];
  /** Human-readable detail for the staff page when something is wrong. */
  message: string | null;
};

export type PrinterLike = {
  /** Resolves once the job has been handed to the print system; rejects if it was refused. */
  print(file: string, title: string): Promise<void>;
  status(): Promise<PrinterStatus>;
};

const LP_TIMEOUT_MS = 60_000;
const LPSTAT_TIMEOUT_MS = 10_000;

/** `lpstat` output is localized; the parsers below read the C locale. */
const C_LOCALE_ENV = { ...process.env, LANG: "C", LC_ALL: "C" };

export function buildLpArgs(file: string, title: string, printer: string | null): string[] {
  return [...(printer ? ["-d", printer] : []), "-o", "media=A4", "-t", title, file];
}

/** Parses `lpstat -d`. */
export function parseDefaultPrinter(output: string): string | null {
  const match = /system default destination:\s*(\S+)/i.exec(output);
  return match ? match[1] : null;
}

/** Parses `lpstat -l -p <name>`. */
export function parsePrinterDetails(
  output: string,
): Pick<PrinterStatus, "state" | "alerts" | "message"> {
  const lines = output.split("\n");
  const head = lines[0] ?? "";

  let state: PrinterState = "unknown";
  if (/ is idle\./.test(head)) state = "idle";
  else if (/ now printing /.test(head)) state = "printing";
  else if (/ disabled since /.test(head)) state = "stopped";

  const alertsLine = lines.find((line) => /^\s*Alerts:/.test(line));
  const alerts =
    alertsLine
      ?.replace(/^\s*Alerts:\s*/, "")
      .split(/[\s,]+/)
      .filter((alert) => alert !== "" && alert !== "none") ?? [];

  // A stopped queue's reason ("Paused", "The printer is not responding.") is the
  // indented line directly under the status line.
  const reason = lines[1]?.startsWith("\t") && !lines[1].includes(":") ? lines[1].trim() : "";

  return { state, alerts, message: state === "stopped" && reason ? reason : null };
}

/** Prints through CUPS with `lp`, to `printer` or the system default. */
export class LpPrinter implements PrinterLike {
  constructor(private readonly printer: string | null) {}

  async print(file: string, title: string): Promise<void> {
    await execFileAsync("lp", buildLpArgs(file, title, this.printer), { timeout: LP_TIMEOUT_MS });
  }

  async status(): Promise<PrinterStatus> {
    let name = this.printer;
    try {
      if (!name) {
        const { stdout } = await execFileAsync("lpstat", ["-d"], {
          timeout: LPSTAT_TIMEOUT_MS,
          env: C_LOCALE_ENV,
        });
        name = parseDefaultPrinter(stdout);
        if (!name) {
          return { name: null, state: "unknown", alerts: [], message: "No default printer" };
        }
      }
      const { stdout } = await execFileAsync("lpstat", ["-l", "-p", name], {
        timeout: LPSTAT_TIMEOUT_MS,
        env: C_LOCALE_ENV,
      });
      return { name, ...parsePrinterDetails(stdout) };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { name, state: "unknown", alerts: [], message };
    }
  }
}

export type MockPrinterMode = "ok" | "fail";

/**
 * Stands in for a printer during development and tests: "prints" by copying the
 * PDF into `outputDir`, so the result can be opened and looked at. In `fail`
 * mode every job is refused, the way `lp` refuses when CUPS has no printer.
 */
export class MockPrinter implements PrinterLike {
  private printed: string[] = [];

  constructor(
    private readonly outputDir: string,
    private mode: MockPrinterMode = "ok",
  ) {}

  setMode(mode: MockPrinterMode): void {
    this.mode = mode;
  }

  getPrinted(): string[] {
    return [...this.printed];
  }

  async print(file: string, title: string): Promise<void> {
    if (this.mode === "fail") {
      throw new Error("mock printer is failing");
    }
    await mkdir(this.outputDir, { recursive: true });
    await copyFile(file, path.join(this.outputDir, path.basename(file)));
    this.printed.push(path.basename(file));
    console.log(`[button-bridge/print] mock printed "${title}" → ${this.outputDir}`);
  }

  async status(): Promise<PrinterStatus> {
    return this.mode === "fail"
      ? { name: "mock", state: "stopped", alerts: [], message: "mock printer is failing" }
      : { name: "mock", state: "idle", alerts: [], message: null };
  }
}
