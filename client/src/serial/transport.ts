import {
  formatSerialCommand,
  LED_OFF,
  LED_ON,
  LED_PULSE,
  parseSerialChunk,
  PING,
  PTT_BAUD_RATE,
  type ParsedSerialLine,
} from "@/serial/protocol";
import type { PttLedMode } from "@/voice/pttLedMode";

export type SerialTransportStatus = "disconnected" | "connecting" | "connected" | "error";

export type SerialTransportCallbacks = {
  onStatus?: (status: SerialTransportStatus, error?: string | null) => void;
  onLine?: (event: ParsedSerialLine) => void;
  onRawLine?: (line: string) => void;
};

const RECONNECT_BASE_MS = 500;
const RECONNECT_MAX_MS = 10_000;

function getSerialApi(): Serial | null {
  return typeof navigator !== "undefined" ? navigator.serial ?? null : null;
}

export function isWebSerialSupported(): boolean {
  return getSerialApi() != null;
}

function getEventPort(event: Event): SerialPort | null {
  const legacy = event as Event & { port?: SerialPort };
  return legacy.port ?? (event.target instanceof EventTarget ? (event.target as SerialPort) : null);
}

export class SerialPushToTalkTransport {
  private port: SerialPort | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private readBuffer = "";
  private readLoopActive = false;
  private callbacks: SerialTransportCallbacks;
  private status: SerialTransportStatus = "disconnected";
  private autoReconnect = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private monitoring = false;
  private openInProgress = false;
  private writeChain: Promise<void> = Promise.resolve();
  private readonly onSerialConnect = (event: Event): void => {
    if (!this.autoReconnect || this.status === "connected" || this.status === "connecting") {
      return;
    }
    const port = getEventPort(event);
    if (!port) return;
    void this.openPort(port);
  };
  private readonly onSerialDisconnect = (event: Event): void => {
    const port = getEventPort(event);
    if (!port || port !== this.port) return;
    void this.handlePortLost("USB disconnected");
  };

  constructor(callbacks: SerialTransportCallbacks = {}) {
    this.callbacks = callbacks;
  }

  getStatus(): SerialTransportStatus {
    return this.status;
  }

  private setStatus(status: SerialTransportStatus, error: string | null = null): void {
    this.status = status;
    this.callbacks.onStatus?.(status, error);
  }

  private ensureMonitoring(): void {
    if (this.monitoring) return;
    const serial = getSerialApi();
    if (!serial) return;
    this.monitoring = true;
    serial.addEventListener("connect", this.onSerialConnect);
    serial.addEventListener("disconnect", this.onSerialDisconnect);
  }

  private cancelReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private scheduleReconnect(): void {
    if (!this.autoReconnect || this.reconnectTimer) return;
    const delay = Math.min(RECONNECT_BASE_MS * 2 ** this.reconnectAttempt, RECONNECT_MAX_MS);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.attemptReconnect();
    }, delay);
  }

  private async attemptReconnect(): Promise<void> {
    if (!this.autoReconnect || this.status === "connected" || this.status === "connecting") {
      return;
    }
    this.reconnectAttempt += 1;
    await this.connectGrantedPorts();
  }

  async requestPort(): Promise<void> {
    const serial = getSerialApi();
    if (!serial) {
      throw new Error("Web Serial is not supported in this browser");
    }
    this.ensureMonitoring();
    this.autoReconnect = true;
    this.cancelReconnect();
    await this.cleanupPort();
    this.setStatus("connecting");
    try {
      const port = await serial.requestPort();
      await this.openPort(port);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to open serial port";
      this.setStatus("error", msg);
      throw e;
    }
  }

  async connectGrantedPorts(): Promise<boolean> {
    const serial = getSerialApi();
    if (!serial) {
      return false;
    }
    this.ensureMonitoring();
    this.autoReconnect = true;
    this.cancelReconnect();
    if (this.status === "connected" || this.status === "connecting") {
      return this.status === "connected";
    }
    const ports = await serial.getPorts();
    const port = ports.find((candidate) => candidate.connected) ?? ports[0];
    if (!port) {
      this.scheduleReconnect();
      return false;
    }
    await this.cleanupPort();
    this.setStatus("connecting");
    try {
      await this.openPort(port);
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to open serial port";
      this.setStatus("error", msg);
      this.scheduleReconnect();
      return false;
    }
  }

  private async openPort(port: SerialPort): Promise<void> {
    if (this.openInProgress) return;
    this.openInProgress = true;
    try {
      if (!port.connected) {
        throw new Error("Serial port is not connected");
      }
      await port.open({ baudRate: PTT_BAUD_RATE });
      this.port = port;
      this.writer = port.writable?.getWriter() ?? null;
      this.reader = port.readable?.getReader() ?? null;
      this.reconnectAttempt = 0;
      void this.readLoop();
      await this.sendCommand(PING);
      this.setStatus("connected");
    } finally {
      this.openInProgress = false;
    }
  }

  async disconnect(): Promise<void> {
    this.autoReconnect = false;
    this.cancelReconnect();
    this.reconnectAttempt = 0;
    await this.cleanupPort();
    this.setStatus("disconnected");
  }

  private async cleanupPort(): Promise<void> {
    this.readLoopActive = false;
    try {
      await this.reader?.cancel();
    } catch {
      // ignore
    }
    try {
      this.reader?.releaseLock();
    } catch {
      // ignore
    }
    try {
      await this.writer?.close();
    } catch {
      // ignore
    }
    try {
      this.writer?.releaseLock();
    } catch {
      // ignore
    }
    try {
      await this.port?.close();
    } catch {
      // ignore
    }
    this.reader = null;
    this.writer = null;
    this.port = null;
    this.readBuffer = "";
  }

  private async handlePortLost(reason: string): Promise<void> {
    if (this.status === "disconnected" && !this.port) {
      return;
    }
    await this.cleanupPort();
    this.setStatus("disconnected", reason);
    if (this.autoReconnect) {
      this.scheduleReconnect();
    }
  }

  async sendCommand(command: string): Promise<void> {
    await this.enqueueWrite(async () => {
      if (!this.writer) return;
      const payload = formatSerialCommand(command);
      await this.writer.write(new TextEncoder().encode(payload));
    });
  }

  private enqueueWrite(task: () => Promise<void>): Promise<void> {
    const next = this.writeChain.then(task);
    this.writeChain = next.catch(() => {});
    return next;
  }

  async setLedMode(mode: PttLedMode): Promise<void> {
    const command =
      mode === "on" ? LED_ON : mode === "pulse" ? LED_PULSE : LED_OFF;
    await this.sendCommand(command);
  }

  private async readLoop(): Promise<void> {
    if (!this.reader) return;
    this.readLoopActive = true;
    while (this.readLoopActive && this.reader) {
      try {
        const { value, done } = await this.reader.read();
        if (done) {
          if (this.readLoopActive) {
            await this.handlePortLost("Port closed");
          }
          break;
        }
        if (!value) continue;
        this.readBuffer += new TextDecoder().decode(value);
        const { events, rest } = parseSerialChunk(this.readBuffer);
        this.readBuffer = rest;
        for (const event of events) {
          if (event.type === "unknown") {
            this.callbacks.onRawLine?.(event.line);
          }
          this.callbacks.onLine?.(event);
        }
      } catch {
        if (this.readLoopActive) {
          await this.handlePortLost("Serial read failed");
        }
        break;
      }
    }
  }
}
