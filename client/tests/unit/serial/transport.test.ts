import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LED_OFF, LED_ON, LED_PULSE, PING, PONG, PTT_DOWN, PTT_UP } from "@/serial/protocol";
import {
  SerialPushToTalkTransport,
  type SerialTransportStatus,
} from "@/serial/transport";

type FakeSerialPort = {
  port: SerialPort;
  pushBytes: (text: string) => void;
  closeReadable: () => void;
  failReadable: () => void;
  getWrittenText: () => string;
};

function createFakeSerialPort(): FakeSerialPort {
  let readableController: ReadableStreamDefaultController<Uint8Array> | null = null;
  const writtenChunks: Uint8Array[] = [];

  const readable = new ReadableStream<Uint8Array>({
    start(controller) {
      readableController = controller;
    },
  });

  const writable = new WritableStream<Uint8Array>({
    write(chunk) {
      writtenChunks.push(chunk);
    },
  });

  const port = Object.assign(new EventTarget(), {
    readable,
    writable,
    connected: true,
    open: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
  }) as SerialPort;

  return {
    port,
    pushBytes(text: string) {
      try {
        readableController?.enqueue(new TextEncoder().encode(text));
      } catch {
        // Stream may already be closed after disconnect.
      }
    },
    closeReadable() {
      readableController?.close();
    },
    failReadable() {
      readableController?.error(new Error("read failed"));
    },
    getWrittenText() {
      return writtenChunks.map((chunk) => new TextDecoder().decode(chunk)).join("");
    },
  };
}

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

function stubNavigatorSerial(fake: FakeSerialPort): void {
  const serial = Object.assign(new EventTarget(), {
    getPorts: vi.fn().mockResolvedValue([fake.port]),
    requestPort: vi.fn().mockResolvedValue(fake.port),
  }) as Serial;
  vi.stubGlobal("navigator", {
    ...globalThis.navigator,
    serial,
  });
}

describe("SerialPushToTalkTransport", () => {
  let fake: FakeSerialPort;

  beforeEach(() => {
    fake = createFakeSerialPort();
    stubNavigatorSerial(fake);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("connects via granted ports, sends PING, and parses incoming lines", async () => {
    const statuses: SerialTransportStatus[] = [];
    const lines: Array<{ type: string }> = [];

    const transport = new SerialPushToTalkTransport({
      onStatus: (status) => statuses.push(status),
      onLine: (event) => lines.push(event),
    });

    const connected = await transport.connectGrantedPorts();
    await flushMicrotasks();

    expect(connected).toBe(true);
    expect(statuses).toContain("connecting");
    expect(statuses).toContain("connected");
    expect(transport.getStatus()).toBe("connected");
    expect(fake.getWrittenText()).toBe(`${PING}\n${LED_OFF}\n`);

    fake.pushBytes(`${PTT_DOWN}\n`);
    await flushMicrotasks();

    expect(lines).toContainEqual({ type: "ptt_down" });
  });

  it("parses chunked reads across multiple byte writes", async () => {
    const lines: Array<{ type: string }> = [];
    const transport = new SerialPushToTalkTransport({
      onLine: (event) => lines.push(event),
    });

    await transport.connectGrantedPorts();
    await flushMicrotasks();

    fake.pushBytes("PTT_");
    await flushMicrotasks();
    fake.pushBytes("DOWN\n");
    await flushMicrotasks();

    expect(lines).toContainEqual({ type: "ptt_down" });
  });

  it("writes LED mode commands when connected", async () => {
    const transport = new SerialPushToTalkTransport();

    await transport.connectGrantedPorts();
    await flushMicrotasks();

    await transport.setLedMode("pulse");
    await transport.setLedMode("on");
    await transport.setLedMode("off");

    expect(fake.getWrittenText()).toBe(
      `${PING}\n${LED_OFF}\n${LED_PULSE}\n${LED_ON}\n${LED_OFF}\n`,
    );
  });

  it("forwards unknown lines to onRawLine and onLine", async () => {
    const rawLines: string[] = [];
    const lines: Array<{ type: string; line?: string }> = [];

    const transport = new SerialPushToTalkTransport({
      onRawLine: (line) => rawLines.push(line),
      onLine: (event) => lines.push(event),
    });

    await transport.connectGrantedPorts();
    await flushMicrotasks();

    fake.pushBytes("DEBUG: hello\n");
    await flushMicrotasks();

    expect(rawLines).toEqual(["DEBUG: hello"]);
    expect(lines).toContainEqual({ type: "unknown", line: "DEBUG: hello" });
  });

  it("disconnects cleanly and stops processing further reads", async () => {
    const statuses: SerialTransportStatus[] = [];
    const lines: Array<{ type: string }> = [];

    const transport = new SerialPushToTalkTransport({
      onStatus: (status) => statuses.push(status),
      onLine: (event) => lines.push(event),
    });

    await transport.connectGrantedPorts();
    await flushMicrotasks();

    await transport.disconnect();
    await flushMicrotasks();

    expect(transport.getStatus()).toBe("disconnected");
    expect(statuses.at(-1)).toBe("disconnected");

    fake.pushBytes(`${PTT_UP}\n`);
    await flushMicrotasks();

    expect(lines).toHaveLength(0);
  });

  it("reports read failures and schedules reconnect", async () => {
    const statuses: Array<{ status: SerialTransportStatus; error: string | null }> = [];

    const transport = new SerialPushToTalkTransport({
      onStatus: (status, error = null) => statuses.push({ status, error }),
    });

    await transport.connectGrantedPorts();
    await flushMicrotasks();

    fake.failReadable();
    await flushMicrotasks();

    expect(statuses).toContainEqual({ status: "disconnected", error: "Serial read failed" });
  });

  it("auto-reconnects when the serial connect event fires", async () => {
    const statuses: SerialTransportStatus[] = [];
    const transport = new SerialPushToTalkTransport({
      onStatus: (status) => statuses.push(status),
    });

    await transport.connectGrantedPorts();
    await flushMicrotasks();
    fake.failReadable();
    await flushMicrotasks();

    expect(statuses).toContain("disconnected");

    fake.port.dispatchEvent(new Event("connect", { bubbles: true }));
    await flushMicrotasks();

    expect(statuses).toContain("connected");
  });

  it("marks disconnected when the readable stream ends", async () => {
    const statuses: SerialTransportStatus[] = [];
    const transport = new SerialPushToTalkTransport({
      onStatus: (status) => statuses.push(status),
    });

    await transport.connectGrantedPorts();
    await flushMicrotasks();

    fake.closeReadable();
    await flushMicrotasks();

    expect(statuses).toContain("disconnected");
    expect(transport.getStatus()).toBe("disconnected");
  });

  it("throws when Web Serial is unavailable", async () => {
    vi.stubGlobal("navigator", { ...globalThis.navigator, serial: undefined });

    const transport = new SerialPushToTalkTransport();
    await expect(transport.requestPort()).rejects.toThrow("Web Serial is not supported");
  });

  it("parses PONG responses", async () => {
    const lines: Array<{ type: string }> = [];
    const transport = new SerialPushToTalkTransport({
      onLine: (event) => lines.push(event),
    });

    await transport.requestPort();
    await flushMicrotasks();

    fake.pushBytes(`${PONG}\n`);
    await flushMicrotasks();

    expect(lines).toContainEqual({ type: "pong" });
  });
});
