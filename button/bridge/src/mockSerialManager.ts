import { EventEmitter } from "node:events";
import { PONG } from "../../../shared/pttProtocol.js";

/**
 * Simulates an Arduino when no USB device is available.
 * Responds to PING with PONG and accepts LED commands silently.
 */
export class MockSerialManager extends EventEmitter {
  private openPath: string | null = null;
  private stopped = false;

  getOpenPath(): string | null {
    return this.openPath;
  }

  isOpen(): boolean {
    return this.openPath != null;
  }

  start(): void {
    this.stopped = false;
    console.log("[ptt-bridge/mock] starting mock serial device");
    this.openPath = "mock";
    this.emit("open", { path: "mock" });
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
    console.log(`[ptt-bridge/mock] ← ${line}`);
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
