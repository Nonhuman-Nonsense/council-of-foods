import { beforeEach, describe, expect, it, vi } from "vitest";
import { PONG } from "@shared/pttProtocol";

type MessageHandler = (event: { data: string }) => void;
type CloseHandler = (event: { code: number; reason: string }) => void;

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  static OPEN = 1;
  static CONNECTING = 0;
  static CLOSED = 3;

  readyState = MockWebSocket.CONNECTING;
  onopen: (() => void) | null = null;
  onmessage: MessageHandler | null = null;
  onerror: (() => void) | null = null;
  onclose: CloseHandler | null = null;
  sent: string[] = [];

  constructor(public url: string) {
    MockWebSocket.instances.push(this);
    queueMicrotask(() => {
      this.readyState = MockWebSocket.OPEN;
      this.onopen?.();
      this.emit({ type: "info", version: "test" });
      this.emit({ type: "status", state: "connected", path: "mock" });
    });
  }

  send(data: string): void {
    this.sent.push(data);
    const message = JSON.parse(data) as { type: string; line?: string };
    if (message.type === "write" && message.line === "PING") {
      queueMicrotask(() => {
        this.emit({ type: "line", text: PONG });
      });
    }
  }

  close(): void {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({ code: 1000, reason: "" });
  }

  emit(payload: Record<string, unknown>): void {
    this.onmessage?.({ data: JSON.stringify(payload) });
  }

  static reset(): void {
    MockWebSocket.instances = [];
  }
}

describe("BridgePttTransport", () => {
  beforeEach(() => {
    MockWebSocket.reset();
    vi.stubGlobal("WebSocket", MockWebSocket);
    vi.resetModules();
  });

  it("connects and completes PING handshake", async () => {
    const statuses: string[] = [];
    const { BridgePttTransport } = await import("@/ptt/bridgeTransport");
    const transport = new BridgePttTransport({
      onStatus: (status) => statuses.push(status),
    });

    const connected = await transport.connect();

    expect(connected).toBe(true);
    expect(transport.getStatus()).toBe("connected");
    expect(statuses).toContain("connecting");
    expect(statuses).toContain("connected");
    expect(MockWebSocket.instances[0]?.sent).toContain(JSON.stringify({ type: "write", line: "PING" }));
  });

  it("forwards PTT lines to callbacks", async () => {
    const lines: string[] = [];
    const { BridgePttTransport } = await import("@/ptt/bridgeTransport");
    const transport = new BridgePttTransport({
      onLine: (event) => {
        if (event.type === "ptt_down" || event.type === "ptt_up") {
          lines.push(event.type);
        }
      },
    });

    await transport.connect();
    MockWebSocket.instances[0]?.emit({ type: "line", text: "PTT_DOWN" });
    MockWebSocket.instances[0]?.emit({ type: "line", text: "PTT_UP" });

    expect(lines).toEqual(["ptt_down", "ptt_up"]);
  });
});
