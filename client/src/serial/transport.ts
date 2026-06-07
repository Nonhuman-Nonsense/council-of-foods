import {
  formatSerialCommand,
  LED_OFF,
  LED_ON,
  parseSerialChunk,
  PING,
  PTT_BAUD_RATE,
  type ParsedSerialLine,
} from "@/serial/protocol";

export type SerialTransportStatus = "disconnected" | "connecting" | "connected" | "error";

export type SerialTransportCallbacks = {
  onStatus?: (status: SerialTransportStatus, error?: string | null) => void;
  onLine?: (event: ParsedSerialLine) => void;
  onRawLine?: (line: string) => void;
};

function getSerialApi(): Serial | null {
  return typeof navigator !== "undefined" ? navigator.serial ?? null : null;
}

export function isWebSerialSupported(): boolean {
  return getSerialApi() != null;
}

export class SerialPushToTalkTransport {
  private port: SerialPort | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private readBuffer = "";
  private readLoopActive = false;
  private callbacks: SerialTransportCallbacks;
  private status: SerialTransportStatus = "disconnected";

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

  async requestPort(): Promise<void> {
    const serial = getSerialApi();
    if (!serial) {
      throw new Error("Web Serial is not supported in this browser");
    }
    await this.disconnect();
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
    const ports = await serial.getPorts();
    if (ports.length === 0) {
      return false;
    }
    await this.disconnect();
    this.setStatus("connecting");
    try {
      await this.openPort(ports[0]!);
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to open serial port";
      this.setStatus("error", msg);
      return false;
    }
  }

  private async openPort(port: SerialPort): Promise<void> {
    await port.open({ baudRate: PTT_BAUD_RATE });
    this.port = port;
    this.writer = port.writable?.getWriter() ?? null;
    this.reader = port.readable?.getReader() ?? null;
    this.setStatus("connected");
    void this.readLoop();
    await this.sendCommand(PING);
  }

  async disconnect(): Promise<void> {
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
    this.setStatus("disconnected");
  }

  async sendCommand(command: string): Promise<void> {
    if (!this.writer) return;
    const payload = formatSerialCommand(command);
    await this.writer.write(new TextEncoder().encode(payload));
  }

  async setLed(on: boolean): Promise<void> {
    await this.sendCommand(on ? LED_ON : LED_OFF);
  }

  private async readLoop(): Promise<void> {
    if (!this.reader) return;
    this.readLoopActive = true;
    while (this.readLoopActive && this.reader) {
      try {
        const { value, done } = await this.reader.read();
        if (done) break;
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
          this.setStatus("error", "Serial read failed");
        }
        break;
      }
    }
    if (this.readLoopActive) {
      this.setStatus("disconnected");
    }
  }
}
