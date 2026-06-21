import {
  LED_OFF,
  LED_ON,
  LED_PULSE,
  parseButtonLine,
  type ParsedButtonLine,
} from "@shared/buttonProtocol";
import { getButtonBridgeWsUrl } from "@/button/config";
import type { ButtonLedMode } from "@/voice/buttonLedMode";

export type ButtonTransportStatus = "disconnected" | "connecting" | "connected" | "error";

export type ButtonTransportCallbacks = {
  onStatus?: (status: ButtonTransportStatus, error?: string | null) => void;
  onSerialDeviceChange?: (connected: boolean) => void;
  onLine?: (event: ParsedButtonLine) => void;
  onRawLine?: (line: string) => void;
};

type BridgeServerMessage =
  | { type: "info"; version: string }
  | { type: "status"; state: "connected" | "disconnected"; path?: string; error?: string }
  | { type: "line"; text: string };

const RECONNECT_BASE_MS = 500;
const RECONNECT_MAX_MS = 10_000;
const CONNECT_TIMEOUT_MS = 5_000;

function parseServerMessage(raw: string): BridgeServerMessage | null {
  try {
    const parsed = JSON.parse(raw) as BridgeServerMessage;
    if (parsed?.type === "info" || parsed?.type === "status" || parsed?.type === "line") {
      return parsed;
    }
  } catch {
    // ignore
  }
  return null;
}

function waitForSocketOpen(socket: WebSocket, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    if (socket.readyState === WebSocket.OPEN) {
      resolve();
      return;
    }

    let settled = false;
    const finish = (next: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      next();
    };

    const timeout = setTimeout(() => {
      finish(() => reject(new Error("Bridge connection timed out")));
    }, timeoutMs);

    const prevOpen = socket.onopen;
    const prevError = socket.onerror;

    socket.onopen = (event) => {
      prevOpen?.call(socket, event);
      finish(resolve);
    };
    socket.onerror = (event) => {
      prevError?.call(socket, event);
      finish(() => reject(new Error("Bridge WebSocket error")));
    };
  });
}

export class ButtonTransport {
  private ws: WebSocket | null = null;
  private callbacks: ButtonTransportCallbacks;
  private status: ButtonTransportStatus = "disconnected";
  private autoReconnect = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private serialDeviceConnected = false;
  private writeChain: Promise<void> = Promise.resolve();
  private connectInFlight: Promise<boolean> | null = null;
  private statusWaiter: { socket: WebSocket; resolve: () => void } | null = null;

  constructor(callbacks: ButtonTransportCallbacks = {}) {
    this.callbacks = callbacks;
  }

  getStatus(): ButtonTransportStatus {
    return this.status;
  }

  isSerialDeviceConnected(): boolean {
    return this.serialDeviceConnected;
  }

  isSessionHealthy(): boolean {
    return this.status === "connected" && this.ws?.readyState === WebSocket.OPEN;
  }

  enableAutoReconnect(): void {
    this.autoReconnect = true;
  }

  private setStatus(status: ButtonTransportStatus, error: string | null = null): void {
    this.status = status;
    this.callbacks.onStatus?.(status, error);
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
      if (this.isSessionHealthy()) return;
      void this.connect().catch(() => {});
    }, delay);
  }

  private clearStatusWaiter(): void {
    this.statusWaiter = null;
  }

  private resolveStatusWaiter(socket: WebSocket): void {
    if (this.statusWaiter?.socket !== socket) return;
    const resolve = this.statusWaiter.resolve;
    this.statusWaiter = null;
    resolve();
  }

  private applySerialStatus(connected: boolean): void {
    const wasSerialConnected = this.serialDeviceConnected;
    this.serialDeviceConnected = connected;
    if (connected !== wasSerialConnected) {
      this.callbacks.onSerialDeviceChange?.(connected);
    }
  }

  private detachSocket(socket: WebSocket): void {
    socket.onopen = null;
    socket.onmessage = null;
    socket.onerror = null;
    socket.onclose = null;
  }

  private closeSocket(): void {
    const socket = this.ws;
    this.ws = null;
    if (this.statusWaiter?.socket === socket) {
      this.clearStatusWaiter();
    }
    if (!socket) return;
    this.detachSocket(socket);
    if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
      socket.close();
    }
  }

  private handleEstablishedSocketClose(socket: WebSocket, reason: string): void {
    if (this.ws !== socket || this.status !== "connected") return;

    this.serialDeviceConnected = false;
    this.ws = null;
    this.setStatus("disconnected", reason);
    if (this.autoReconnect) {
      this.reconnectAttempt += 1;
      this.scheduleReconnect();
    }
  }

  private handleServerMessage(socket: WebSocket, message: BridgeServerMessage): void {
    if (message.type === "info") {
      return;
    }

    if (message.type === "status") {
      this.applySerialStatus(message.state === "connected");
      this.resolveStatusWaiter(socket);
      return;
    }

    const parsed = parseButtonLine(message.text);
    if (!parsed) return;
    if (parsed.type === "unknown") {
      this.callbacks.onRawLine?.(parsed.line);
    }
    this.callbacks.onLine?.(parsed);
  }

  private sendJson(payload: { type: "write"; line: string }): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify(payload));
  }

  private failConnect(socket: WebSocket, message: string): false {
    this.detachSocket(socket);
    if (this.ws === socket) {
      this.ws = null;
    }
    if (this.statusWaiter?.socket === socket) {
      this.clearStatusWaiter();
    }
    if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
      socket.close();
    }
    this.serialDeviceConnected = false;
    this.setStatus("disconnected", message);
    this.reconnectAttempt += 1;
    if (this.autoReconnect) {
      this.scheduleReconnect();
    }
    return false;
  }

  private async runConnect(): Promise<boolean> {
    this.cancelReconnect();
    this.closeSocket();
    this.serialDeviceConnected = false;
    this.setStatus("connecting");

    if (typeof WebSocket === "undefined") {
      this.setStatus("error", "WebSocket is not available");
      return false;
    }

    const socket = new WebSocket(getButtonBridgeWsUrl());
    this.ws = socket;
    let bridgeStatusSeen = false;

    const statusWait = new Promise<void>((resolve) => {
      this.statusWaiter = {
        socket,
        resolve: () => {
          bridgeStatusSeen = true;
          resolve();
        },
      };
    });

    socket.onmessage = (event) => {
      const raw = typeof event.data === "string" ? event.data : String(event.data);
      const message = parseServerMessage(raw);
      if (message) {
        this.handleServerMessage(socket, message);
      }
    };

    socket.onclose = (event) => {
      this.detachSocket(socket);
      this.handleEstablishedSocketClose(socket, event.reason || "bridge closed");
    };

    try {
      await waitForSocketOpen(socket, CONNECT_TIMEOUT_MS);

      if (this.ws !== socket || socket.readyState !== WebSocket.OPEN) {
        return this.failConnect(socket, "connection lost");
      }

      if (!bridgeStatusSeen) {
        await Promise.race([
          statusWait,
          new Promise<void>((_, reject) => {
            setTimeout(() => reject(new Error("Bridge status timed out")), CONNECT_TIMEOUT_MS);
          }),
        ]);
      }

      if (this.ws !== socket || socket.readyState !== WebSocket.OPEN) {
        return this.failConnect(socket, "connection lost");
      }

      this.clearStatusWaiter();
      this.reconnectAttempt = 0;
      this.setStatus("connected");
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to connect to bridge";
      return this.failConnect(socket, msg);
    }
  }

  async connect(): Promise<boolean> {
    if (this.isSessionHealthy()) {
      return true;
    }

    if (this.connectInFlight) {
      return this.connectInFlight;
    }

    this.connectInFlight = this.runConnect();
    try {
      return await this.connectInFlight;
    } finally {
      this.connectInFlight = null;
    }
  }

  async disconnect(): Promise<void> {
    this.autoReconnect = false;
    this.cancelReconnect();
    this.reconnectAttempt = 0;
    this.serialDeviceConnected = false;
    this.setStatus("disconnected");
    this.closeSocket();
  }

  async sendCommand(command: string): Promise<void> {
    if (!this.serialDeviceConnected) {
      return;
    }
    await this.enqueueWrite(async () => {
      this.sendJson({ type: "write", line: command });
    });
  }

  private enqueueWrite(task: () => Promise<void>): Promise<void> {
    const next = this.writeChain.then(task);
    this.writeChain = next.catch(() => {});
    return next;
  }

  async setLedMode(mode: ButtonLedMode): Promise<void> {
    const command = mode === "on" ? LED_ON : mode === "pulse" ? LED_PULSE : LED_OFF;
    await this.sendCommand(command);
  }
}
