import { chmod, mkdir, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { PrinterLike, PrinterStatus } from "./printer.js";

export type PrintSpoolOptions = {
  dir: string;
  printer: PrinterLike;
  retryBaseMs: number;
  retryMaxMs: number;
  statusIntervalMs: number;
};

export type EnqueueResult = "queued" | "duplicate";

export type PrintHealth = {
  enabled: true;
  printer: PrinterStatus | null;
  pending: number;
  lastError: string | null;
  lastPrintedAt: string | null;
};

export class InvalidPrintJobError extends Error {}

const KEY_PATTERN = /^[A-Za-z0-9._-]{1,200}$/;
const PDF_MAGIC = Buffer.from("%PDF-");

/**
 * Durable print queue on disk.
 *
 * `pending/` holds jobs not yet accepted by the print system, `done/` everything
 * that was, and each file is named by its job key — so a key is printed at most
 * once, across retries and restarts. Anything left in `pending/` when the bridge
 * starts is printed then, which is what makes a crash or a reboot harmless. A job
 * the printer refuses stays at the head of the queue and is retried with backoff
 * for as long as it takes.
 */
export class PrintSpool {
  private readonly pendingDir: string;
  private readonly doneDir: string;
  private readonly tmpDir: string;
  /** Keys in pending/ or done/, claimed synchronously so concurrent enqueues cannot both win. */
  private readonly known = new Set<string>();
  private pendingCount = 0;
  /** Printed, but the move to done/ failed — must not be printed again this run. */
  private readonly printedNotMoved = new Set<string>();
  private stopped = true;
  private draining: Promise<void> | null = null;
  /** Work arrived while a drain was finishing; drain again rather than miss it. */
  private drainAgain = false;
  private wakeRetry: (() => void) | null = null;
  private retryTimer: NodeJS.Timeout | null = null;
  private statusTimer: NodeJS.Timeout | null = null;
  private printerStatus: PrinterStatus | null = null;
  private lastError: string | null = null;
  private lastPrintedAt: string | null = null;

  constructor(private readonly options: PrintSpoolOptions) {
    this.pendingDir = path.join(options.dir, "pending");
    this.doneDir = path.join(options.dir, "done");
    this.tmpDir = path.join(options.dir, "tmp");
  }

  async start(): Promise<void> {
    await Promise.all(
      [this.pendingDir, this.doneDir, this.tmpDir].map((dir) => mkdir(dir, { recursive: true })),
    );
    // Group-writable, so staff can reprint (copy into pending/) and tidy up without
    // admin rights. New folders take the parent's group; the installer makes that `staff`.
    await Promise.all(
      [this.pendingDir, this.doneDir].map((dir) => chmod(dir, 0o775).catch(() => {})),
    );
    // A tmp file is a write that never finished; the client will send it again.
    await rm(this.tmpDir, { recursive: true, force: true });
    await mkdir(this.tmpDir, { recursive: true });

    const [pending, done] = await Promise.all([
      this.listJobs(this.pendingDir),
      this.listJobs(this.doneDir),
    ]);
    this.known.clear();
    for (const key of [...pending, ...done]) this.known.add(key);
    this.pendingCount = pending.length;

    this.stopped = false;
    console.log(
      `[button-bridge/print] spool ${this.options.dir} (${pending.length} pending, ${done.length} done)`,
    );
    this.refreshStatus();
    this.statusTimer = setInterval(() => {
      this.refreshStatus();
      this.kick();
    }, this.options.statusIntervalMs);
    this.kick();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.statusTimer) clearInterval(this.statusTimer);
    this.statusTimer = null;
    this.cancelRetryWait();
    await this.draining;
  }

  async enqueue(key: string, pdf: Buffer): Promise<EnqueueResult> {
    if (!KEY_PATTERN.test(key)) {
      throw new InvalidPrintJobError("invalid job key");
    }
    if (!pdf.subarray(0, PDF_MAGIC.length).equals(PDF_MAGIC)) {
      throw new InvalidPrintJobError("body is not a PDF");
    }
    if (this.known.has(key)) {
      return "duplicate";
    }

    this.known.add(key);
    const tmpFile = path.join(this.tmpDir, `${key}.pdf`);
    try {
      // Written aside and renamed in, so pending/ never holds a half-written PDF.
      await writeFile(tmpFile, pdf);
      await rename(tmpFile, path.join(this.pendingDir, `${key}.pdf`));
    } catch (error) {
      this.known.delete(key);
      throw error;
    }
    this.pendingCount += 1;
    console.log(`[button-bridge/print] queued ${key}`);
    this.kick();
    return "queued";
  }

  /** Skip the current backoff wait, e.g. once the printer is known to be back. */
  retryNow(): void {
    this.refreshStatus();
    this.cancelRetryWait();
    this.kick();
  }

  health(): PrintHealth {
    return {
      enabled: true,
      printer: this.printerStatus,
      pending: this.pendingCount,
      lastError: this.lastError,
      lastPrintedAt: this.lastPrintedAt,
    };
  }

  private kick(): void {
    if (this.stopped) return;
    if (this.draining) {
      this.drainAgain = true;
      return;
    }
    this.drainAgain = false;
    this.draining = this.drain()
      .catch((error: unknown) => {
        console.error("[button-bridge/print] spool error", error);
      })
      .finally(() => {
        this.draining = null;
        if (this.drainAgain) this.kick();
      });
  }

  private async drain(): Promise<void> {
    let failures = 0;
    while (!this.stopped) {
      const key = await this.oldestPending();
      if (!key) return;

      const file = path.join(this.pendingDir, `${key}.pdf`);
      try {
        await this.options.printer.print(file, `Council meeting ${key}`);
      } catch (error) {
        failures += 1;
        this.lastError = error instanceof Error ? error.message : String(error);
        const delay = Math.min(
          this.options.retryBaseMs * 2 ** (failures - 1),
          this.options.retryMaxMs,
        );
        console.warn(
          `[button-bridge/print] printing ${key} failed (attempt ${failures}), retrying in ${delay}ms:`,
          this.lastError,
        );
        this.refreshStatus();
        await this.waitForRetry(delay);
        continue;
      }

      failures = 0;
      this.lastError = null;
      this.lastPrintedAt = new Date().toISOString();
      this.refreshStatus();
      console.log(`[button-bridge/print] printed ${key}`);
      await rename(file, path.join(this.doneDir, `${key}.pdf`)).catch((error: unknown) => {
        console.error(`[button-bridge/print] could not move ${key} to done/`, error);
        this.printedNotMoved.add(key);
      });
    }
  }

  private async oldestPending(): Promise<string | null> {
    // Read from disk each pass, so a file staff copy into pending/ is picked up too.
    const keys = (await this.listJobs(this.pendingDir)).filter(
      (key) => !this.printedNotMoved.has(key),
    );
    this.pendingCount = keys.length;
    if (keys.length === 0) return null;
    const withTimes = await Promise.all(
      keys.map(async (key) => ({
        key,
        // Gone since the listing (staff removed it): sorts last, and the next pass drops it.
        mtime: await stat(path.join(this.pendingDir, `${key}.pdf`)).then(
          (stats) => stats.mtimeMs,
          () => Infinity,
        ),
      })),
    );
    withTimes.sort((a, b) => a.mtime - b.mtime || a.key.localeCompare(b.key));
    return withTimes[0].key;
  }

  private async listJobs(dir: string): Promise<string[]> {
    const entries = await readdir(dir);
    return entries.filter((name) => name.endsWith(".pdf")).map((name) => name.slice(0, -4));
  }

  private waitForRetry(ms: number): Promise<void> {
    return new Promise((resolve) => {
      this.wakeRetry = resolve;
      this.retryTimer = setTimeout(() => this.cancelRetryWait(), ms);
    });
  }

  private cancelRetryWait(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    const wake = this.wakeRetry;
    this.wakeRetry = null;
    wake?.();
  }

  private refreshStatus(): void {
    void this.options.printer.status().then((status) => {
      this.printerStatus = status;
    });
  }
}
