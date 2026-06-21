import {
  LED_OFF,
  LED_ON,
  LED_PULSE,
  parseButtonLine,
  PING,
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

export class ButtonTransport {
  private ws: WebSocket | null = null;
  private callbacks: ButtonTransportCallbacks;
  private status: ButtonTransportStatus = "disconnected";
  private autoReconnect = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private connectTimeout: ReturnType<typeof setTimeout> | null = null;
  private serialDeviceConnected = false;
  private completeConnectTask: Promise<boolean> | null = null;
  private writeChain: Promise<void> = Promise.resolve();
  private resolveFirstStatus: (() => void) | null = null;
  private firstStatusPromise: Promise<void> | null = null;

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

  private clearConnectTimeout(): void {
    if (this.connectTimeout) {
      clearTimeout(this.connectTimeout);
      this.connectTimeout = null;
    }
  }

  private cancelReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private beginAwaitingFirstStatus(): void {
    this.firstStatusPromise = new Promise((resolve) => {
      this.resolveFirstStatus = resolve;
    });
  }

  private notifyFirstStatus(): void {
    this.resolveFirstStatus?.();
    this.resolveFirstStatus = null;
    this.firstStatusPromise = null;
  }

  private clearFirstStatusWait(): void {
    this.resolveFirstStatus = null;
    this.firstStatusPromise = null;
  }

  private scheduleReconnect(): void {
    if (!this.autoReconnect || this.reconnectTimer) return;
    const delay = Math.min(RECONNECT_BASE_MS * 2 ** this.reconnectAttempt, RECONNECT_MAX_MS);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect();
    }, delay);
  }

  private closeSocket(): void {
    this.clearConnectTimeout();
    const socket = this.ws;
    this.ws = null;
    if (!socket) return;
    socket.onopen = null;
    socket.onmessage = null;
    socket.onerror = null;
    socket.onclose = null;
    if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
      socket.close();
    }
  }

  private sendJson(payload: { type: "write"; line: string }): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify(payload));
  }

  private handleServerMessage(message: BridgeServerMessage): void {
    if (message.type === "info") {
      return;
    }
    if (message.type === "status") {
      const wasSerialConnected = this.serialDeviceConnected;
      this.serialDeviceConnected = message.state === "connected";
      this.notifyFirstStatus();
      if (this.serialDeviceConnected !== wasSerialConnected) {
        this.callbacks.onSerialDeviceChange?.(this.serialDeviceConnected);
      }
      return;
    }

    const parsed = parseButtonLine(message.text);
    if (!parsed) return;
    if (parsed.type === "unknown") {
      this.callbacks.onRawLine?.(parsed.line);
    }
    this.callbacks.onLine?.(parsed);
  }

  private completeBridgeConnect(): Promise<boolean> {
    if (this.completeConnectTask) {
      return this.completeConnectTask;
    }

    this.completeConnectTask = (async () => {
      if (this.status !== "connecting" || this.ws?.readyState !== WebSocket.OPEN) {
        return false;
      }

      try {
        if (this.serialDeviceConnected) {
          await this.sendCommand(PING);
        }
        this.reconnectAttempt = 0;
        this.setStatus("connected");
        return true;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Bridge handshake failed";
        this.setStatus("error", msg);
        this.closeSocket();
        this.scheduleReconnect();
        return false;
      } finally {
        this.completeConnectTask = null;
      }
    })();

    return this.completeConnectTask;
  }

  async connect(): Promise<boolean> {
    if (this.isSessionHealthy()) {
      return true;
    }

    if (this.status === "connecting" && this.ws?.readyState === WebSocket.CONNECTING) {
      return false;
    }

    this.cancelReconnect();
    this.closeSocket();
    this.serialDeviceConnected = false;
    this.clearFirstStatusWait();
    this.beginAwaitingFirstStatus();
    this.setStatus("connecting");

    if (typeof WebSocket === "undefined") {
      this.setStatus("error", "WebSocket is not available");
      return false;
    }

    const url = getButtonBridgeWsUrl();

    try {
      const socket = new WebSocket(url);
      this.ws = socket;

      socket.onmessage = (event) => {
        const raw = typeof event.data === "string" ? event.data : String(event.data);
        const message = parseServerMessage(raw);
        if (message) {
          this.handleServerMessage(message);
        }
      };

      await new Promise<void>((resolve, reject) => {
        this.connectTimeout = setTimeout(() => {
          reject(new Error("Bridge connection timed out"));
        }, CONNECT_TIMEOUT_MS);

        socket.onopen = () => {
          this.clearConnectTimeout();
          resolve();
        };

        socket.onerror = () => {
          this.clearConnectTimeout();
          reject(new Error("Bridge WebSocket error"));
        };

        socket.onclose = (event) => {
          if (this.connectTimeout) {
            this.clearConnectTimeout();
            reject(new Error(`Bridge closed during connect (${event.code})`));
          }
        };
      });

      socket.onclose = (event) => {
        this.serialDeviceConnected = false;
        const wasConnected = this.status === "connected";
        this.ws = null;
        this.setStatus("disconnected", event.reason || "bridge closed");
        if (this.autoReconnect || wasConnected) {
          this.reconnectAttempt += 1;
          this.scheduleReconnect();
        }
      };

      socket.onerror = () => {
        // reconnect handled on close
      };

      try {
        await Promise.race([
          this.firstStatusPromise ?? Promise.resolve(),
          new Promise<void>((_, reject) => {
            setTimeout(() => reject(new Error("Bridge status timed out")), CONNECT_TIMEOUT_MS);
          }),
        ]);
      } catch {
        this.setStatus("error", "Bridge status timed out");
        this.closeSocket();
        this.scheduleReconnect();
        return false;
      }

      const connected = await this.completeBridgeConnect();

      if (connected) {
        return true;
      }

      if (this.status === "connecting") {
        this.setStatus("error", "Bridge handshake failed");
        this.closeSocket();
        this.scheduleReconnect();
      }

      return false;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to connect to bridge";
      this.setStatus("error", msg);
      this.closeSocket();
      this.reconnectAttempt += 1;
      this.scheduleReconnect();
      return false;
    }
  }

  async disconnect(): Promise<void> {
    this.autoReconnect = false;
    this.cancelReconnect();
    this.reconnectAttempt = 0;
    this.serialDeviceConnected = false;
    this.clearFirstStatusWait();
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
