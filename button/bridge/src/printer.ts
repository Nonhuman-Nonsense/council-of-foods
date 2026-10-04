import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
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
  /** Jobs CUPS accepted but has not printed yet. */
  queuedJobs: number;
  /** When the oldest of those was submitted, ISO 8601. */
  oldestJobAt: string | null;
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

/** Parses `lpstat -o <printer>`: one line per job not yet printed. */
export function parseQueuedJobs(output: string): Pick<PrinterStatus, "queuedJobs" | "oldestJobAt"> {
  let queuedJobs = 0;
  let oldest: number | null = null;
  for (const line of output.split("\n")) {
    // "Museum_Printer-12   leo   20480   Wed Sep 16 15:00:00 2026"
    const match = /^\S+-\d+\s+\S+\s+\d+\s+(.+)$/.exec(line.trim());
    if (!match) continue;
    queuedJobs += 1;
    const submitted = Date.parse(match[1]);
    if (!Number.isNaN(submitted) && (oldest === null || submitted < oldest)) oldest = submitted;
  }
  return { queuedJobs, oldestJobAt: oldest === null ? null : new Date(oldest).toISOString() };
}

const NO_QUEUE = { queuedJobs: 0, oldestJobAt: null };

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
          return { name: null, state: "unknown", alerts: [], message: "No default printer", ...NO_QUEUE };
        }
      }
      const [details, queue] = await Promise.all([
        execFileAsync("lpstat", ["-l", "-p", name], { timeout: LPSTAT_TIMEOUT_MS, env: C_LOCALE_ENV }),
        execFileAsync("lpstat", ["-o", name], { timeout: LPSTAT_TIMEOUT_MS, env: C_LOCALE_ENV }),
      ]);
      return { name, ...parsePrinterDetails(details.stdout), ...parseQueuedJobs(queue.stdout) };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { name, state: "unknown", alerts: [], message, ...NO_QUEUE };
    }
  }
}

export const MOCK_PRINTER_MODES = ["ok", "fail", "paper-out", "stuck"] as const;
export type MockPrinterMode = (typeof MOCK_PRINTER_MODES)[number];

type HeldJob = { name: string; title: string; content: Buffer; at: Date };

/**
 * Stands in for a printer during development and tests: "prints" by copying the
 * PDF into `outputDir`, so the result can be opened and looked at.
 *
 * - `fail`: every job is refused, the way `lp` refuses when CUPS has no printer.
 * - `paper-out`: jobs are accepted but wait in the printer's queue, and the
 *   printer reports `media-empty-error`, like a CUPS printer out of paper.
 * - `stuck`: jobs are accepted and wait, but the printer reports nothing, like
 *   the many USB printers that never tell CUPS what is wrong.
 *
 * Back in `ok`, waiting jobs print.
 */
export class MockPrinter implements PrinterLike {
  private printed: string[] = [];
  private held: HeldJob[] = [];

  constructor(
    private readonly outputDir: string,
    private mode: MockPrinterMode = "ok",
  ) {}

  async setMode(mode: MockPrinterMode): Promise<void> {
    this.mode = mode;
    if (mode !== "ok") return;
    const waiting = this.held;
    this.held = [];
    for (const job of waiting) await this.output(job);
  }

  getPrinted(): string[] {
    return [...this.printed];
  }

  async print(file: string, title: string): Promise<void> {
    if (this.mode === "fail") {
      throw new Error("mock printer is failing");
    }
    const job = { name: path.basename(file), title, content: await readFile(file), at: new Date() };
    if (this.mode === "ok") {
      await this.output(job);
    } else {
      this.held.push(job);
      console.log(`[button-bridge/print] mock printer holding "${title}" (${this.mode})`);
    }
  }

  async status(): Promise<PrinterStatus> {
    const queue = {
      queuedJobs: this.held.length,
      oldestJobAt: this.held[0]?.at.toISOString() ?? null,
    };
    switch (this.mode) {
      case "fail":
        return { name: "mock", state: "stopped", alerts: [], message: "mock printer is failing", ...queue };
      case "paper-out":
        return { name: "mock", state: "idle", alerts: ["media-empty-error"], message: null, ...queue };
      default:
        return { name: "mock", state: "idle", alerts: [], message: null, ...queue };
    }
  }

  private async output(job: HeldJob): Promise<void> {
    await mkdir(this.outputDir, { recursive: true });
    await writeFile(path.join(this.outputDir, job.name), job.content);
    this.printed.push(job.name);
    console.log(`[button-bridge/print] mock printed "${job.title}" → ${this.outputDir}`);
  }
}
