import { beforeEach, describe, expect, it, vi } from "vitest";

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

describe("ButtonTransport", () => {
  beforeEach(() => {
    MockWebSocket.reset();
    vi.stubGlobal("WebSocket", MockWebSocket);
    vi.resetModules();
  });

  it("connects when bridge reports verified usb serial", async () => {
    const statuses: string[] = [];
    const { ButtonTransport } = await import("@/button/transport");
    const transport = new ButtonTransport({
      onStatus: (status) => statuses.push(status),
    });

    const connected = await transport.connect();

    expect(connected).toBe(true);
    expect(transport.getStatus()).toBe("connected");
    expect(transport.isSerialDeviceConnected()).toBe(true);
    expect(statuses).toContain("connecting");
    expect(statuses).toContain("connected");
    expect(MockWebSocket.instances[0]?.sent).not.toContain(
      JSON.stringify({ type: "write", line: "PING" }),
    );
  });

  it("connects when bridge is up but usb serial is disconnected", async () => {
    class MockWebSocketNoSerial {
      static instances: MockWebSocketNoSerial[] = [];
      static OPEN = 1;
      static CONNECTING = 0;

      readyState = MockWebSocketNoSerial.CONNECTING;
      onopen: (() => void) | null = null;
      onmessage: MessageHandler | null = null;
      onerror: (() => void) | null = null;
      onclose: CloseHandler | null = null;
      sent: string[] = [];

      constructor(public url: string) {
        MockWebSocketNoSerial.instances.push(this);
        queueMicrotask(() => {
          this.readyState = MockWebSocketNoSerial.OPEN;
          this.onopen?.();
          this.onmessage?.({ data: JSON.stringify({ type: "info", version: "test" }) });
          this.onmessage?.({
            data: JSON.stringify({ type: "status", state: "disconnected" }),
          });
        });
      }

      send(data: string): void {
        this.sent.push(data);
      }

      close(): void {
        this.readyState = 3;
      }
    }

    vi.stubGlobal("WebSocket", MockWebSocketNoSerial);

    const statuses: string[] = [];
    const { ButtonTransport } = await import("@/button/transport");
    const transport = new ButtonTransport({
      onStatus: (status) => statuses.push(status),
    });

    const connected = await transport.connect();

    expect(connected).toBe(true);
    expect(transport.getStatus()).toBe("connected");
    expect(transport.isSerialDeviceConnected()).toBe(false);
    expect(statuses).toContain("connected");
    expect(MockWebSocketNoSerial.instances[0]?.sent).not.toContain(
      JSON.stringify({ type: "write", line: "PING" }),
    );
  });

  it("forwards button lines to callbacks", async () => {
    const lines: string[] = [];
    const { ButtonTransport } = await import("@/button/transport");
    const transport = new ButtonTransport({
      onLine: (event) => {
        if (event.type === "button_down" || event.type === "button_up") {
          lines.push(event.type);
        }
      },
    });

    await transport.connect();
    MockWebSocket.instances[0]?.emit({ type: "line", text: "BUTTON_DOWN" });
    MockWebSocket.instances[0]?.emit({ type: "line", text: "BUTTON_UP" });

    expect(lines).toEqual(["button_down", "button_up"]);
  });

  it("sends LED commands when connected", async () => {
    const { ButtonTransport } = await import("@/button/transport");
    const transport = new ButtonTransport();
    await transport.connect();

    await transport.setLedMode("pulse");
    await transport.setLedMode("on");
    await transport.setLedMode("off");

    const sent = MockWebSocket.instances[0]?.sent ?? [];
    expect(sent).toContain(JSON.stringify({ type: "write", line: "LED_PULSE" }));
    expect(sent).toContain(JSON.stringify({ type: "write", line: "LED_ON" }));
    expect(sent).toContain(JSON.stringify({ type: "write", line: "LED_OFF" }));
  });

  it("does not send LED commands when usb serial is disconnected", async () => {
    class MockWebSocketNoSerial {
      static instances: MockWebSocketNoSerial[] = [];
      static OPEN = 1;
      static CONNECTING = 0;

      readyState = MockWebSocketNoSerial.CONNECTING;
      onopen: (() => void) | null = null;
      onmessage: MessageHandler | null = null;
      onerror: (() => void) | null = null;
      onclose: CloseHandler | null = null;
      sent: string[] = [];

      constructor(public url: string) {
        MockWebSocketNoSerial.instances.push(this);
        queueMicrotask(() => {
          this.readyState = MockWebSocketNoSerial.OPEN;
          this.onopen?.();
          this.onmessage?.({ data: JSON.stringify({ type: "info", version: "test" }) });
          this.onmessage?.({
            data: JSON.stringify({ type: "status", state: "disconnected" }),
          });
        });
      }

      send(data: string): void {
        this.sent.push(data);
      }

      close(): void {
        this.readyState = 3;
      }
    }

    vi.stubGlobal("WebSocket", MockWebSocketNoSerial);

    const { ButtonTransport } = await import("@/button/transport");
    const transport = new ButtonTransport();
    await transport.connect();

    await transport.setLedMode("pulse");

    expect(MockWebSocketNoSerial.instances[0]?.sent).not.toContain(
      JSON.stringify({ type: "write", line: "LED_PULSE" }),
    );
  });

  it("notifies when usb serial connects after websocket session is up", async () => {
    const serialChanges: boolean[] = [];
    const { ButtonTransport } = await import("@/button/transport");
    const transport = new ButtonTransport({
      onSerialDeviceChange: (connected) => serialChanges.push(connected),
    });

    await transport.connect();
    expect(serialChanges).toEqual([true]);

    MockWebSocket.instances[0]?.emit({ type: "status", state: "disconnected" });
    MockWebSocket.instances[0]?.emit({ type: "status", state: "connected", path: "mock" });

    expect(serialChanges).toEqual([true, false, true]);
  });

  it("disconnect stops auto-reconnect and clears status", async () => {
    const statuses: string[] = [];
    const { ButtonTransport } = await import("@/button/transport");
    const transport = new ButtonTransport({
      onStatus: (status) => statuses.push(status),
    });

    transport.enableAutoReconnect();
    await transport.connect();
    await transport.disconnect();

    expect(transport.getStatus()).toBe("disconnected");
    expect(statuses).toContain("disconnected");
  });
});
