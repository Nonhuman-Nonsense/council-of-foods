import { EventEmitter } from "node:events";
import { BUTTON_DOWN, BUTTON_UP, PONG } from "../../../shared/buttonProtocol.js";

/**
 * Simulates an Arduino when no USB device is available.
 * Responds to PING with PONG and accepts LED commands silently.
 */
export class MockSerialManager extends EventEmitter {
  private openPath: string | null = null;
  private stopped = false;
  private writtenLines: string[] = [];

  getOpenPath(): string | null {
    return this.openPath;
  }

  isOpen(): boolean {
    return this.openPath != null;
  }

  getWrittenLines(): string[] {
    return [...this.writtenLines];
  }

  clearWrittenLines(): void {
    this.writtenLines = [];
  }

  /** Inject a physical button press/release (mock mode / tests only). */
  simulateButton(pressed: boolean): void {
    if (!this.isOpen()) return;
    this.emit("line", { text: pressed ? BUTTON_DOWN : BUTTON_UP });
  }

  /** Simulate unplugging the USB device while the bridge keeps running. */
  simulateUsbDisconnect(reason = "unplugged"): void {
    if (!this.openPath) return;
    this.openPath = null;
    this.emit("close", { reason });
  }

  /**
   * Simulate plugging the USB device back in.
   * Emits BUTTON_DOWN or BUTTON_UP once, like production firmware on host connect.
   */
  simulateUsbReconnect(pressed = false): void {
    if (this.stopped) return;
    const wasOpen = this.openPath != null;
    this.openPath = "mock";
    if (!wasOpen) {
      this.emit("open", { path: "mock" });
    }
    queueMicrotask(() => {
      if (!this.stopped && this.isOpen()) {
        this.emit("line", { text: pressed ? BUTTON_DOWN : BUTTON_UP });
      }
    });
  }

  start(): void {
    this.stopped = false;
    console.log("[button-bridge/mock] starting mock serial device");
    this.simulateUsbReconnect(false);
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.openPath) {
      this.openPath = null;
      this.emit("close", { reason: "shutdown" });
    }
  }

  writeLine(line: string): Promise<void> {
    if (!this.isOpen()) {
      return Promise.reject(new Error("Mock serial is not open"));
    }
    console.log(`[button-bridge/mock] ← ${line}`);
    this.writtenLines.push(line);
    if (line === "PING") {
      queueMicrotask(() => {
        if (!this.stopped && this.isOpen()) {
          this.emit("line", { text: PONG });
        }
      });
    }
    return Promise.resolve();
  }
}
