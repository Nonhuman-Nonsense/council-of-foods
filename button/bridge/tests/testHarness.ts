import { mkdtemp, rm } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { LED_ERROR } from "../../../shared/buttonProtocol.js";
import type { BridgeConfig } from "../src/config.js";
import { MockSerialManager } from "../src/mockSerialManager.js";
import { AlertMonitor } from "../src/alertMonitor.js";
import { MockPrinter } from "../src/printer.js";
import { ServerClient } from "../src/serverClient.js";
import type { PrintRuntime } from "../src/printRoutes.js";
import { PrintSpool } from "../src/printSpool.js";
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
  simulateButtonUrl: string;
  simulateButtonDown: () => void;
  simulateButtonUp: () => void;
  simulateUsbDisconnect: () => void;
  simulateUsbReconnect: (pressed?: boolean) => void;
  getWrittenLines: () => string[];
  clearWrittenLines: () => void;
  printUrl: string;
  /** Present when started with `print: true`. */
  alerts: () => AlertMonitor | null;
  /** Present when started with `print: true`. */
  printer: MockPrinter | null;
  /** Spool folder; survives restart() so a restart sees what was left on disk. */
  spoolDir: string | null;
  restart: () => Promise<void>;
  stop: () => Promise<void>;
};

export type StartTestBridgeOptions = {
  /** When false, bridge starts with no USB device until simulateUsbReconnect(). */
  serialConnected?: boolean;
  /** Run the print spool against a mock printer in a temp folder. */
  print?: boolean;
  /** Council server for printer alerts (needs `print`). */
  alertServer?: { url: string; key: string };
};

function createTestConfig(port: number): BridgeConfig {
  return {
    host: "127.0.0.1",
    port,
    baudRate: 115200,
    serialPath: null,
    serialVendorId: "2341",
    reconnectBaseMs: 500,
    reconnectMaxMs: 10_000,
    mockSerial: true,
    printEnabled: false,
    printSpoolDir: "",
    printer: null,
    mockPrinter: null,
    printMaxBytes: 1024 * 1024,
    printRetryBaseMs: 20,
    printRetryMaxMs: 100,
    printStatusIntervalMs: 50,
    printNotPrintingAfterMs: 300,
    serverUrl: null,
    serverKey: null,
    alertsFile: "",
    alertGraceMs: 100,
    alertReminderMs: 60 * 60_000,
    alertOpeningReminderGapMs: 60 * 60_000,
    alertTickMs: 25,
    alertVenueRefreshMs: 60 * 60_000,
    alertRetryBaseMs: 50,
    alertRetryMaxMs: 200,
    alertTestIntervalMs: 60_000,
  };
}

function notifyNoClientIfSerialOpen(serial: MockSerialManager, clientCount: number): void {
  if (clientCount > 0 || !serial.isOpen()) return;
  void serial.writeLine(LED_ERROR).catch(() => {});
}

function wireSerialToServer(serial: MockSerialManager, server: WsServer): void {
  serial.on("line", ({ text }) => {
    server.broadcast({ type: "line", text });
  });
  serial.on("open", ({ path }) => {
    server.broadcast({ type: "status", state: "connected", path });
    notifyNoClientIfSerialOpen(serial, server.getClientCount());
  });
  serial.on("close", ({ reason }) => {
    server.broadcast({ type: "status", state: "disconnected", error: reason });
  });
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

export async function waitForCondition(
  predicate: () => boolean,
  timeoutMs = 10_000,
  intervalMs = 25,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error("Timed out waiting for condition");
}

export async function startTestBridge(
  options: StartTestBridgeOptions = {},
): Promise<TestBridge> {
  const serialConnected = options.serialConnected ?? true;
  const port = await getFreePort();
  const host = "127.0.0.1";
  const healthUrl = `http://${host}:${port}/health`;
  const wsUrl = `ws://${host}:${port}/v1/button`;
  const simulateButtonUrl = `http://${host}:${port}/v1/test/simulate-button`;
  const printUrl = `http://${host}:${port}/v1/print`;
  const spoolDir = options.print ? await mkdtemp(path.join(os.tmpdir(), "bridge-print-")) : null;
  const printer = spoolDir ? new MockPrinter(path.join(spoolDir, "mock-printed")) : null;

  const runtime = {
    port,
    host,
    serial: new MockSerialManager(),
    server: null as WsServer | null,
    print: null as PrintRuntime | null,
  };

  async function boot(connectSerial = serialConnected): Promise<void> {
    runtime.serial = new MockSerialManager();
    const config = createTestConfig(runtime.port);
    runtime.print = null;
    if (spoolDir && printer) {
      const spool = new PrintSpool({
        dir: spoolDir,
        printer,
        retryBaseMs: config.printRetryBaseMs,
        retryMaxMs: config.printRetryMaxMs,
        statusIntervalMs: config.printStatusIntervalMs,
        notPrintingAfterMs: config.printNotPrintingAfterMs,
      });
      await spool.start();
      const alerts = new AlertMonitor({
        server: options.alertServer ? new ServerClient(options.alertServer.url, options.alertServer.key) : null,
        spool,
        stateFile: path.join(spoolDir, "alerts-state.json"),
        host: "test-mac",
        timings: {
          graceMs: config.alertGraceMs,
          reminderMs: config.alertReminderMs,
          openingReminderGapMs: config.alertOpeningReminderGapMs,
        },
        tickMs: config.alertTickMs,
        venueRefreshMs: config.alertVenueRefreshMs,
        deliveryRetryBaseMs: config.alertRetryBaseMs,
        deliveryRetryMaxMs: config.alertRetryMaxMs,
        testAlertIntervalMs: config.alertTestIntervalMs,
      });
      await alerts.start();
      runtime.print = { spool, mockPrinter: printer, alerts };
    }
    runtime.server = new WsServer(
      config,
      runtime.serial,
      (clientCount) => {
        notifyNoClientIfSerialOpen(runtime.serial, clientCount);
      },
      runtime.print,
    );
    wireSerialToServer(runtime.serial, runtime.server);
    if (connectSerial) {
      runtime.serial.start();
    }
    runtime.server.start();
    await waitForHttpOk(healthUrl);
  }

  await boot();

  return {
    port,
    host,
    healthUrl,
    wsUrl,
    simulateButtonUrl,
    simulateButtonDown: () => runtime.serial.simulateButton(true),
    simulateButtonUp: () => runtime.serial.simulateButton(false),
    simulateUsbDisconnect: () => runtime.serial.simulateUsbDisconnect(),
    simulateUsbReconnect: (pressed = false) => runtime.serial.simulateUsbReconnect(pressed),
    getWrittenLines: () => runtime.serial.getWrittenLines(),
    clearWrittenLines: () => runtime.serial.clearWrittenLines(),
    printUrl,
    alerts: () => runtime.print?.alerts ?? null,
    printer,
    spoolDir,
    restart: async () => {
      if (runtime.server) {
        await runtime.server.stop();
      }
      await runtime.print?.alerts?.stop();
      await runtime.print?.spool.stop();
      await runtime.serial.stop();
      await boot(true);
    },
    stop: async () => {
      if (runtime.server) {
        await runtime.server.stop();
        runtime.server = null;
      }
      await runtime.print?.alerts?.stop();
      await runtime.print?.spool.stop();
      await runtime.serial.stop();
      if (spoolDir) {
        await rm(spoolDir, { recursive: true, force: true });
      }
    },
  };
}
