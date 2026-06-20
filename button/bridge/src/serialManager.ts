import { EventEmitter } from "node:events";
import { ReadlineParser } from "@serialport/parser-readline";
import { SerialPort } from "serialport";
import type { BridgeConfig } from "./config.js";

type PortInfo = Awaited<ReturnType<typeof SerialPort.list>>[number];

export type SerialManagerEvents = {
  open: [{ path: string }];
  close: [{ reason: string }];
  line: [{ text: string }];
  error: [{ message: string }];
};

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

export class SerialManager extends EventEmitter {
  private readonly config: BridgeConfig;
  private port: SerialPort | null = null;
  private parser: ReadlineParser | null = null;
  private writeChain: Promise<void> = Promise.resolve();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private stopped = false;
  private openPath: string | null = null;

  constructor(config: BridgeConfig) {
    super();
    this.config = config;
  }

  getOpenPath(): string | null {
    return this.openPath;
  }

  isOpen(): boolean {
    return this.port?.isOpen === true;
  }

  start(): void {
    this.stopped = false;
    void this.connect();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    this.clearReconnect();
    await this.closePort("shutdown");
  }

  writeLine(line: string): Promise<void> {
    const task = this.writeChain.then(async () => {
      if (!this.port?.isOpen) {
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

  private async pickPort(): Promise<PortInfo | null> {
    const ports = await SerialPort.list();
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

  private async connect(): Promise<void> {
    if (this.stopped || this.port?.isOpen) return;

    const target = await this.pickPort();
    if (!target) {
      this.emit("close", { reason: "no device" });
      this.scheduleReconnect("no device");
      return;
    }

    console.log(`[button-bridge/serial] opening ${target.path}`);
    const port = new SerialPort({
      path: target.path,
      baudRate: this.config.baudRate,
      autoOpen: false,
    });
    const parser = port.pipe(new ReadlineParser({ delimiter: "\n" }));

    parser.on("data", (line: string | Buffer) => {
      const text = typeof line === "string" ? line : line.toString("utf8");
      const trimmed = text.trim();
      if (!trimmed) return;
      this.emit("line", { text: trimmed });
    });

    port.on("error", (error) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[button-bridge/serial] port error", message);
      this.emit("error", { message });
    });

    port.on("close", () => {
      const reason = "port closed";
      console.warn(`[button-bridge/serial] ${reason}`);
      this.openPath = null;
      this.parser = null;
      this.port = null;
      this.emit("close", { reason });
      if (!this.stopped) {
        this.scheduleReconnect(reason);
      }
    });

    await new Promise<void>((resolve, reject) => {
      port.open((error) => {
        if (error) reject(error);
        else resolve();
      });
    });

    this.port = port;
    this.parser = parser;
    this.openPath = target.path;
    this.reconnectAttempt = 0;
    this.clearReconnect();
    console.log(`[button-bridge/serial] connected ${target.path}`);
    this.emit("open", { path: target.path });
  }

  private async closePort(reason: string): Promise<void> {
    const port = this.port;
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
