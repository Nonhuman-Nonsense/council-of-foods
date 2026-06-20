import {
  formatSerialCommand,
  LED_OFF,
  LED_ON,
  LED_PULSE,
  parseSerialLine,
  PING,
} from "@/serial/protocol";
import { getBridgeWsUrl } from "@/serial/bridgeConfig";
import { serialDebugLog, serialDebugLogError } from "@/serial/debugLog";
import type { ParsedSerialLine } from "@/serial/protocol";
import type { PttLedMode } from "@/voice/pttLedMode";

export type PttTransportStatus = "disconnected" | "connecting" | "connected" | "error";

export type PttTransportCallbacks = {
  onStatus?: (status: PttTransportStatus, error?: string | null) => void;
  onLine?: (event: ParsedSerialLine) => void;
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

export class BridgePttTransport {
  private ws: WebSocket | null = null;
  private callbacks: PttTransportCallbacks;
  private status: PttTransportStatus = "disconnected";
  private autoReconnect = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private connectTimeout: ReturnType<typeof setTimeout> | null = null;
  private serialReady = false;
  private writeChain: Promise<void> = Promise.resolve();

  constructor(callbacks: PttTransportCallbacks = {}) {
    this.callbacks = callbacks;
  }

  getStatus(): PttTransportStatus {
    return this.status;
  }

  isSessionHealthy(): boolean {
    return (
      this.status === "connected" &&
      this.ws?.readyState === WebSocket.OPEN &&
      this.serialReady
    );
  }

  enableAutoReconnect(): void {
    this.autoReconnect = true;
    serialDebugLog("bridge", "auto-reconnect enabled");
  }

  private setStatus(status: PttTransportStatus, error: string | null = null): void {
    serialDebugLog(
      "bridge",
      `status → ${status}`,
      { previous: this.status, error, autoReconnect: this.autoReconnect },
      error ? "warn" : "info",
    );
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
    serialDebugLog("bridge", "scheduling reconnect", {
      delayMs: delay,
      attempt: this.reconnectAttempt,
    });
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
      serialDebugLog("bridge", "bridge info", { version: message.version });
      return;
    }
    if (message.type === "status") {
      serialDebugLog("bridge", "serial status", message);
      if (message.state === "connected") {
        this.serialReady = true;
        if (this.status === "connecting") {
          void this.finishConnect();
        }
      } else {
        this.serialReady = false;
        if (this.status === "connected") {
          this.setStatus("disconnected", message.error ?? "serial disconnected");
        }
      }
      return;
    }

    const parsed = parseSerialLine(message.text);
    if (!parsed) return;
    serialDebugLog(
      "bridge",
      `line ← ${parsed.type}`,
      parsed.type === "unknown" ? { line: parsed.line } : undefined,
    );
    if (parsed.type === "unknown") {
      this.callbacks.onRawLine?.(parsed.line);
    }
    this.callbacks.onLine?.(parsed);
  }

  private async finishConnect(): Promise<void> {
    try {
      await this.sendCommand(PING);
      serialDebugLog("bridge", "connect success");
      this.reconnectAttempt = 0;
      this.setStatus("connected");
    } catch (e) {
      serialDebugLogError("bridge", "connect handshake failed", e);
      const msg = e instanceof Error ? e.message : "Bridge handshake failed";
      this.setStatus("error", msg);
      this.closeSocket();
      this.scheduleReconnect();
    }
  }

  async connect(): Promise<boolean> {
    serialDebugLog("bridge", "connect", { status: this.status, url: getBridgeWsUrl() });

    if (this.isSessionHealthy()) {
      serialDebugLog("bridge", "connect: already connected");
      return true;
    }

    if (this.status === "connecting" && this.ws?.readyState === WebSocket.CONNECTING) {
      serialDebugLog("bridge", "connect: already connecting", undefined, "warn");
      return false;
    }

    this.cancelReconnect();
    this.closeSocket();
    this.serialReady = false;
    this.setStatus("connecting");

    if (typeof WebSocket === "undefined") {
      this.setStatus("error", "WebSocket is not available");
      return false;
    }

    const url = getBridgeWsUrl();

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
          serialDebugLog("bridge", "websocket open");
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
        serialDebugLog("bridge", "websocket closed", { code: event.code, reason: event.reason }, "warn");
        this.serialReady = false;
        const wasConnected = this.status === "connected";
        this.ws = null;
        this.setStatus("disconnected", event.reason || "bridge closed");
        if (this.autoReconnect || wasConnected) {
          this.reconnectAttempt += 1;
          this.scheduleReconnect();
        }
      };

      socket.onerror = () => {
        serialDebugLog("bridge", "websocket error", undefined, "warn");
      };

      if (!this.serialReady) {
        await new Promise<void>((resolve) => {
          const deadline = Date.now() + CONNECT_TIMEOUT_MS;
          const wait = (): void => {
            if (this.serialReady || Date.now() >= deadline) {
              resolve();
              return;
            }
            setTimeout(wait, 25);
          };
          wait();
        });
      }

      if (this.serialReady) {
        await this.finishConnect();
        return true;
      }

      return false;
    } catch (e) {
      serialDebugLogError("bridge", "connect failed", e);
      const msg = e instanceof Error ? e.message : "Failed to connect to bridge";
      this.setStatus("error", msg);
      this.closeSocket();
      this.reconnectAttempt += 1;
      this.scheduleReconnect();
      return false;
    }
  }

  async disconnect(): Promise<void> {
    serialDebugLog("bridge", "disconnect (staff/manual)");
    this.autoReconnect = false;
    this.cancelReconnect();
    this.reconnectAttempt = 0;
    this.serialReady = false;
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

  async setLedMode(mode: PttLedMode): Promise<void> {
    serialDebugLog("bridge", `setLedMode → ${mode}`);
    const command = mode === "on" ? LED_ON : mode === "pulse" ? LED_PULSE : LED_OFF;
    await this.sendCommand(command);
  }
}
