import net from "node:net";
import type { BridgeConfig } from "../src/config.js";
import { MockSerialManager } from "../src/mockSerialManager.js";
import { WsServer } from "../src/wsServer.js";

export function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((error) => {
        if (error) reject(error);
        else resolve(port);
      });
    });
    server.on("error", reject);
  });
}

export async function waitForHttpOk(url: string, attempts = 40): Promise<Response> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return response;
      }
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export type TestBridge = {
  port: number;
  host: string;
  healthUrl: string;
  wsUrl: string;
  serial: MockSerialManager;
  simulateButtonDown: () => void;
  simulateButtonUp: () => void;
  getWrittenLines: () => string[];
  stop: () => Promise<void>;
};

function createTestConfig(port: number): BridgeConfig {
  return {
    host: "127.0.0.1",
    port,
    baudRate: 115200,
    serialPath: null,
    serialVendorId: "239a",
    reconnectBaseMs: 500,
    reconnectMaxMs: 10_000,
    mockSerial: true,
  };
}

export async function waitForWrittenLine(bridge: TestBridge, line: string, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (bridge.getWrittenLines().includes(line)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Timed out waiting for mock serial to receive ${line}`);
}

export async function waitForTicks(ticks = 2): Promise<void> {
  for (let i = 0; i < ticks; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

export async function startTestBridge(): Promise<TestBridge> {
  const port = await getFreePort();
  const host = "127.0.0.1";
  const serial = new MockSerialManager();
  const server = new WsServer(createTestConfig(port), serial);

  serial.on("line", ({ text }) => {
    server.broadcast({ type: "line", text });
  });

  serial.start();
  server.start();

  const healthUrl = `http://${host}:${port}/health`;
  await waitForHttpOk(healthUrl);

  return {
    port,
    host,
    healthUrl,
    wsUrl: `ws://${host}:${port}/v1/button`,
    serial,
    simulateButtonDown: () => serial.emit("line", { text: "BUTTON_DOWN" }),
    simulateButtonUp: () => serial.emit("line", { text: "BUTTON_UP" }),
    getWrittenLines: () => serial.getWrittenLines(),
    stop: async () => {
      await server.stop();
      await serial.stop();
    },
  };
}
