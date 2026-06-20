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
  private deviceReady = false;
  private writeChain: Promise<void> = Promise.resolve();

  constructor(callbacks: ButtonTransportCallbacks = {}) {
    this.callbacks = callbacks;
  }

  getStatus(): ButtonTransportStatus {
    return this.status;
  }

  isSessionHealthy(): boolean {
    return (
      this.status === "connected" &&
      this.ws?.readyState === WebSocket.OPEN &&
      this.deviceReady
    );
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
      if (message.state === "connected") {
        this.deviceReady = true;
        if (this.status === "connecting") {
          void this.finishConnect();
        }
      } else {
        this.deviceReady = false;
        if (this.status === "connected") {
          this.setStatus("disconnected", message.error ?? "button disconnected");
        }
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

  private async finishConnect(): Promise<void> {
    try {
      await this.sendCommand(PING);
      this.reconnectAttempt = 0;
      this.setStatus("connected");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Bridge handshake failed";
      this.setStatus("error", msg);
      this.closeSocket();
      this.scheduleReconnect();
    }
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
    this.deviceReady = false;
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
        this.deviceReady = false;
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

      if (!this.deviceReady) {
        await new Promise<void>((resolve) => {
          const deadline = Date.now() + CONNECT_TIMEOUT_MS;
          const wait = (): void => {
            if (this.deviceReady || Date.now() >= deadline) {
              resolve();
              return;
            }
            setTimeout(wait, 25);
          };
          wait();
        });
      }

      if (this.deviceReady) {
        await this.finishConnect();
        return true;
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
    this.deviceReady = false;
    this.setStatus("disconnected");
    this.closeSocket();
  }

  async sendCommand(command: string): Promise<void> {
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
