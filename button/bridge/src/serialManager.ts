import { EventEmitter } from "node:events";
import { ReadlineParser } from "@serialport/parser-readline";
import { SerialPort } from "serialport";
import { HELLO_COUNCIL, isReadyCouncilButton } from "../../../shared/buttonProtocol.js";
import type { BridgeConfig } from "./config.js";
import type { SerialDiagnostics, UsbPortInfo } from "./serialDiagnostics.js";
import {
  createConnectedDiagnostics,
  createDisconnectedDiagnostics,
  createProbingDiagnostics,
} from "./serialDiagnostics.js";

export type { SerialDiagnostics, UsbPortInfo };

type PortInfo = Awaited<ReturnType<typeof SerialPort.list>>[number];

export type SerialManagerEvents = {
  open: [{ path: string }];
  close: [{ reason: string }];
  line: [{ text: string }];
  error: [{ message: string }];
};

const FIRMWARE_PROBE_TIMEOUT_MS = 2_000;

function normalizeVendorId(vendorId: string | undefined): string | null {
  if (!vendorId) return null;
  return vendorId.toLowerCase().replace(/^0x/, "");
}

function matchesVendorId(port: PortInfo, vendorId: string | null): boolean {
  if (!vendorId) return true;
  const normalized = normalizeVendorId(port.vendorId);
  const target = normalizeVendorId(vendorId);
  return normalized != null && target != null && normalized === target;
}

function toPortInfo(port: PortInfo): UsbPortInfo {
  return {
    path: port.path,
    vendorId: port.vendorId,
    productId: port.productId,
  };
}

export class SerialManager extends EventEmitter {
  private readonly config: BridgeConfig;
  private port: SerialPort | null = null;
  private parser: ReadlineParser | null = null;
  private writeChain: Promise<void> = Promise.resolve();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private stopped = false;
  private openPath: string | null = null;
  private verified = false;
  private lastScannedPorts: UsbPortInfo[] = [];
  private diagnostics: SerialDiagnostics = createDisconnectedDiagnostics(
    null,
    [],
    "shutdown",
    "Serial manager not started",
  );

  constructor(config: BridgeConfig) {
    super();
    this.config = config;
    this.diagnostics = createDisconnectedDiagnostics(
      config.serialVendorId,
      [],
      "shutdown",
      "Serial manager not started",
    );
  }

  getOpenPath(): string | null {
    return this.verified ? this.openPath : null;
  }

  isOpen(): boolean {
    return this.verified && this.port?.isOpen === true;
  }

  getDiagnostics(): SerialDiagnostics {
    return this.diagnostics;
  }

  start(): void {
    this.stopped = false;
    void this.connect();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    this.clearReconnect();
    this.verified = false;
    this.diagnostics = createDisconnectedDiagnostics(
      this.config.serialVendorId,
      this.lastScannedPorts,
      "shutdown",
      "Bridge serial manager stopped",
      this.openPath,
    );
    await this.closePort("shutdown");
  }

  writeLine(line: string): Promise<void> {
    const task = this.writeChain.then(async () => {
      if (!this.isOpen()) {
        throw new Error("Serial port is not open");
      }
      await new Promise<void>((resolve, reject) => {
        this.port?.write(`${line}\n`, (error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    });
    this.writeChain = task.catch(() => {});
    return task;
  }

  private clearReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private scheduleReconnect(reason: string): void {
    if (this.stopped || this.reconnectTimer) return;
    const delay = Math.min(
      this.config.reconnectBaseMs * 2 ** this.reconnectAttempt,
      this.config.reconnectMaxMs,
    );
    this.reconnectAttempt += 1;
    console.log(`[button-bridge/serial] scheduling reconnect in ${delay}ms (${reason})`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect();
    }, delay);
  }

  private setDiagnostics(next: SerialDiagnostics): void {
    this.diagnostics = next;
  }

  private async pickPort(ports: PortInfo[]): Promise<PortInfo | null> {
    if (this.config.serialPath) {
      const forced = ports.find((port) => port.path === this.config.serialPath);
      if (forced) return forced;
      console.warn(
        `[button-bridge/serial] configured path not found: ${this.config.serialPath}`,
      );
    }

    const matches = ports.filter((port) => matchesVendorId(port, this.config.serialVendorId));
    if (matches.length === 0) {
      console.warn("[button-bridge/serial] no matching USB serial devices", {
        vendorId: this.config.serialVendorId,
        ports: ports.map((port) => ({
          path: port.path,
          vendorId: port.vendorId,
          productId: port.productId,
        })),
      });
      return null;
    }
    if (matches.length > 1) {
      console.warn("[button-bridge/serial] multiple matches — using first", {
        paths: matches.map((port) => port.path),
      });
    }
    return matches[0] ?? null;
  }

  private probeFirmware(port: SerialPort, parser: ReadlineParser): Promise<boolean> {
    return new Promise((resolve) => {
      let settled = false;

      const finish = (ok: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        parser.off("data", onData);
        resolve(ok);
      };

      const onData = (line: string | Buffer) => {
        const text = typeof line === "string" ? line : line.toString("utf8");
        if (isReadyCouncilButton(text)) {
          finish(true);
        }
      };

      const timeout = setTimeout(() => finish(false), FIRMWARE_PROBE_TIMEOUT_MS);
      parser.on("data", onData);

      port.write(`${HELLO_COUNCIL}\n`, (error) => {
        if (error) {
          finish(false);
        }
      });
    });
  }

  private attachParser(parser: ReadlineParser): void {
    parser.on("data", (line: string | Buffer) => {
      const text = typeof line === "string" ? line : line.toString("utf8");
      const trimmed = text.trim();
      if (!trimmed || !this.verified) return;
      this.emit("line", { text: trimmed });
    });
  }

  private async connect(): Promise<void> {
    if (this.stopped || this.port?.isOpen) return;

    const ports = await SerialPort.list();
    this.lastScannedPorts = ports.map(toPortInfo);

    const target = await this.pickPort(ports);
    if (!target) {
      const otherCount = ports.length;
      const message =
        otherCount === 0
          ? `No USB serial devices found. Looking for vendor ${this.config.serialVendorId ?? "any"}.`
          : `No USB serial device with vendor ${this.config.serialVendorId ?? "any"} found (${otherCount} other port(s) visible).`;
      this.verified = false;
      this.setDiagnostics(
        createDisconnectedDiagnostics(
          this.config.serialVendorId,
          this.lastScannedPorts,
          "no_device",
          message,
        ),
      );
      this.emit("close", { reason: "no device" });
      this.scheduleReconnect("no device");
      return;
    }

    console.log(`[button-bridge/serial] opening ${target.path}`);
    this.setDiagnostics(
      createProbingDiagnostics(this.config.serialVendorId, this.lastScannedPorts, target.path),
    );

    const port = new SerialPort({
      path: target.path,
      baudRate: this.config.baudRate,
      autoOpen: false,
    });
    const parser = port.pipe(new ReadlineParser({ delimiter: "\n" }));

    port.on("error", (error) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[button-bridge/serial] port error", message);
      this.emit("error", { message });
    });

    port.on("close", () => {
      const reason = "port closed";
      console.warn(`[button-bridge/serial] ${reason}`);
      this.verified = false;
      this.openPath = null;
      this.parser = null;
      this.port = null;
      this.setDiagnostics(
        createDisconnectedDiagnostics(
          this.config.serialVendorId,
          this.lastScannedPorts,
          "shutdown",
          "USB serial port closed",
          target.path,
        ),
      );
      this.emit("close", { reason });
      if (!this.stopped) {
        this.scheduleReconnect(reason);
      }
    });

    try {
      await new Promise<void>((resolve, reject) => {
        port.open((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[button-bridge/serial] failed to open ${target.path}`, message);
      this.setDiagnostics(
        createDisconnectedDiagnostics(
          this.config.serialVendorId,
          this.lastScannedPorts,
          "probe_failed",
          `Could not open USB device at ${target.path}: ${message}`,
          target.path,
        ),
      );
      this.emit("close", { reason: "open failed" });
      this.scheduleReconnect("open failed");
      return;
    }

    const verified = await this.probeFirmware(port, parser);
    if (!verified) {
      console.warn(
        `[button-bridge/serial] firmware probe failed at ${target.path} (expected READY council-button)`,
      );
      this.setDiagnostics(
        createDisconnectedDiagnostics(
          this.config.serialVendorId,
          this.lastScannedPorts,
          "probe_failed",
          `USB device at ${target.path} did not identify as a Council button.`,
          target.path,
        ),
      );
      await new Promise<void>((resolve) => {
        port.close(() => resolve());
      });
      this.emit("close", { reason: "firmware probe failed" });
      this.scheduleReconnect("firmware probe failed");
      return;
    }

    this.port = port;
    this.parser = parser;
    this.openPath = target.path;
    this.verified = true;
    this.reconnectAttempt = 0;
    this.clearReconnect();
    this.attachParser(parser);
    this.setDiagnostics(
      createConnectedDiagnostics(this.config.serialVendorId, this.lastScannedPorts, target.path),
    );
    console.log(`[button-bridge/serial] council button verified at ${target.path}`);
    this.emit("open", { path: target.path });
  }

  private async closePort(reason: string): Promise<void> {
    const port = this.port;
    this.verified = false;
    this.port = null;
    this.parser = null;
    this.openPath = null;
    if (!port) return;

    await new Promise<void>((resolve) => {
      if (!port.isOpen) {
        resolve();
        return;
      }
      port.close((error) => {
        if (error) {
          console.warn(`[button-bridge/serial] close error (${reason})`, error.message);
        }
        resolve();
      });
    });
  }
}
