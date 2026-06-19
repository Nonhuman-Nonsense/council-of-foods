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
import { serialDebugLog, serialDebugLogError } from "@/serial/debugLog";
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
  private portLostHandling = false;
  private writeChain: Promise<void> = Promise.resolve();
  private readonly onSerialConnect = (event: Event): void => {
    const port = getEventPort(event);
    serialDebugLog("transport", "USB connect event", {
      autoReconnect: this.autoReconnect,
      status: this.status,
      hasPort: port != null,
      portConnected: port?.connected ?? null,
    });
    if (!this.autoReconnect) {
      return;
    }
    if (this.status === "connecting") {
      serialDebugLog("transport", "USB connect event ignored (connect in progress)", undefined, "warn");
      return;
    }
    if (this.status === "connected" && this.isSessionHealthy()) {
      serialDebugLog("transport", "USB connect event ignored (healthy session)", undefined, "warn");
      return;
    }
    if (!port) return;
    void this.openPort(port, "usb-connect-event");
  };
  private readonly onSerialDisconnect = (event: Event): void => {
    const port = getEventPort(event);
    serialDebugLog("transport", "USB disconnect event", {
      matchesOpenPort: port === this.port,
      status: this.status,
    });
    if (!port || port !== this.port) return;
    void this.handlePortLost("USB disconnected", "usb-disconnect-event");
  };

  constructor(callbacks: SerialTransportCallbacks = {}) {
    this.callbacks = callbacks;
  }

  getStatus(): SerialTransportStatus {
    return this.status;
  }

  isSessionHealthy(): boolean {
    return (
      this.status === "connected" &&
      this.port != null &&
      this.port.connected &&
      this.reader != null &&
      this.readLoopActive
    );
  }

  enableAutoReconnect(): void {
    this.autoReconnect = true;
    this.ensureMonitoring();
    serialDebugLog("transport", "auto-reconnect enabled");
  }

  private setStatus(status: SerialTransportStatus, error: string | null = null): void {
    serialDebugLog("transport", `status → ${status}`, {
      previous: this.status,
      error,
      autoReconnect: this.autoReconnect,
      openInProgress: this.openInProgress,
    }, error ? "warn" : "info");
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
    serialDebugLog("transport", "USB connect/disconnect listeners attached");
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
    serialDebugLog("transport", "scheduling internal reconnect", {
      delayMs: delay,
      attempt: this.reconnectAttempt,
    });
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
    serialDebugLog("transport", "requestPort (user gesture)");
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
      serialDebugLog("transport", "requestPort granted", { portConnected: port.connected });
      await this.openPort(port, "requestPort");
    } catch (e) {
      serialDebugLogError("transport", "requestPort failed", e);
      const msg = e instanceof Error ? e.message : "Failed to open serial port";
      this.setStatus("error", msg);
      throw e;
    }
  }

  async connectGrantedPorts(): Promise<boolean> {
    serialDebugLog("transport", "connectGrantedPorts", { status: this.status });
    const serial = getSerialApi();
    if (!serial) {
      serialDebugLog("transport", "connectGrantedPorts: Web Serial unavailable", undefined, "warn");
      return false;
    }
    this.ensureMonitoring();
    this.autoReconnect = true;
    if (this.status === "connected") {
      if (this.isSessionHealthy()) {
        serialDebugLog("transport", "connectGrantedPorts: already connected");
        return true;
      }
      serialDebugLog(
        "transport",
        "connectGrantedPorts: stale connected state — reconnecting",
        {
          hasPort: this.port != null,
          portConnected: this.port?.connected ?? null,
          hasReader: this.reader != null,
          readLoopActive: this.readLoopActive,
        },
        "warn",
      );
      this.setStatus("disconnected", "stale connection");
    }
    if (this.status === "connecting") {
      serialDebugLog("transport", "connectGrantedPorts: already connecting", undefined, "warn");
      return false;
    }
    this.cancelReconnect();
    const ports = await serial.getPorts();
    const portSummary = ports.map((candidate, index) => ({
      index,
      connected: candidate.connected,
    }));
    serialDebugLog("transport", "getPorts result", {
      count: ports.length,
      ports: portSummary,
    });
    const port = ports.find((candidate) => candidate.connected) ?? ports[0];
    if (!port) {
      serialDebugLog("transport", "no granted ports — waiting for pairing or USB connect event", undefined, "warn");
      this.scheduleReconnect();
      return false;
    }
    if (!port.connected) {
      serialDebugLog("transport", "granted port not connected yet — waiting for USB plug-in", {
        grantedPortCount: ports.length,
      }, "warn");
      this.scheduleReconnect();
      return false;
    }
    await this.cleanupPort();
    this.setStatus("connecting");
    try {
      await this.openPort(port, "connectGrantedPorts");
      return true;
    } catch (e) {
      serialDebugLogError("transport", "connectGrantedPorts open failed", e);
      const msg = e instanceof Error ? e.message : "Failed to open serial port";
      this.setStatus("error", msg);
      this.scheduleReconnect();
      return false;
    }
  }

  private async openPort(port: SerialPort, reason: string): Promise<void> {
    if (this.openInProgress) {
      serialDebugLog("transport", `openPort skipped (${reason}): open already in progress`, undefined, "warn");
      return;
    }
    this.openInProgress = true;
    serialDebugLog("transport", `openPort (${reason})`, { portConnected: port.connected });
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
      serialDebugLog("transport", `openPort success (${reason})`);
      this.setStatus("connected");
    } catch (e) {
      serialDebugLogError("transport", `openPort failed (${reason})`, e);
      throw e;
    } finally {
      this.openInProgress = false;
    }
  }

  async disconnect(): Promise<void> {
    serialDebugLog("transport", "disconnect (staff/manual)");
    this.autoReconnect = false;
    this.cancelReconnect();
    this.reconnectAttempt = 0;
    this.setStatus("disconnected");
    await this.cleanupPort();
  }

  private async releasePortResources(
    reader: ReadableStreamDefaultReader<Uint8Array> | null,
    writer: WritableStreamDefaultWriter<Uint8Array> | null,
    port: SerialPort | null,
  ): Promise<void> {
    const cleanup = async (): Promise<void> => {
      try {
        await reader?.cancel();
      } catch {
        // ignore
      }
      try {
        reader?.releaseLock();
      } catch {
        // ignore
      }
      try {
        await writer?.close();
      } catch {
        // ignore
      }
      try {
        writer?.releaseLock();
      } catch {
        // ignore
      }
      try {
        await port?.close();
      } catch {
        // ignore
      }
    };

    await Promise.race([
      cleanup(),
      new Promise<void>((resolve) => {
        setTimeout(resolve, 750);
      }),
    ]);
  }

  private async cleanupPort(): Promise<void> {
    serialDebugLog("transport", "cleanupPort");
    this.readLoopActive = false;
    const reader = this.reader;
    const writer = this.writer;
    const port = this.port;
    this.reader = null;
    this.writer = null;
    this.port = null;
    this.readBuffer = "";
    await this.releasePortResources(reader, writer, port);
  }

  private async handlePortLost(reason: string, source = "unknown"): Promise<void> {
    if (this.portLostHandling) {
      serialDebugLog("transport", `handlePortLost skipped (${source}): already handling`, { reason }, "warn");
      return;
    }
    if (this.status === "disconnected" && !this.port && !this.reader && !this.writer) {
      serialDebugLog("transport", `handlePortLost ignored (${source})`, { reason });
      return;
    }

    this.portLostHandling = true;
    serialDebugLog("transport", `handlePortLost (${source})`, { reason, autoReconnect: this.autoReconnect }, "warn");

    const shouldReconnect = this.autoReconnect;
    this.readLoopActive = false;
    this.setStatus("disconnected", reason);

    try {
      await this.cleanupPort();
    } finally {
      this.portLostHandling = false;
    }

    if (shouldReconnect) {
      this.scheduleReconnect();
    } else {
      serialDebugLog("transport", "auto-reconnect disabled — not scheduling retry", undefined, "warn");
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
    serialDebugLog("transport", `setLedMode → ${mode}`);
    const command =
      mode === "on" ? LED_ON : mode === "pulse" ? LED_PULSE : LED_OFF;
    await this.sendCommand(command);
  }

  private async readLoop(): Promise<void> {
    serialDebugLog("transport", "readLoop started");
    if (!this.reader) return;
    this.readLoopActive = true;
    while (this.readLoopActive && this.reader) {
      try {
        const { value, done } = await this.reader.read();
        if (done) {
          serialDebugLog("transport", "readLoop ended (stream done)", undefined, "warn");
          if (this.readLoopActive) {
            await this.handlePortLost("Port closed", "read-loop-done");
          }
          break;
        }
        if (!value) continue;
        this.readBuffer += new TextDecoder().decode(value);
        const { events, rest } = parseSerialChunk(this.readBuffer);
        this.readBuffer = rest;
        for (const event of events) {
          serialDebugLog("transport", `line ← ${event.type}`, event.type === "unknown" ? { line: (event as { line: string }).line } : undefined);
          if (event.type === "unknown") {
            this.callbacks.onRawLine?.(event.line);
          }
          this.callbacks.onLine?.(event);
        }
      } catch (e) {
        serialDebugLogError("transport", "readLoop error (device may be unplugged)", e);
        if (this.readLoopActive) {
          await this.handlePortLost("Serial read failed", "read-loop-error");
        }
        break;
      }
    }
    serialDebugLog("transport", "readLoop exited");
  }
}
