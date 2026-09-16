import path from "node:path";
import { LED_ERROR } from "../../../shared/buttonProtocol.js";
import { loadConfig } from "./config.js";
import { MockSerialManager } from "./mockSerialManager.js";
import { LpPrinter, MockPrinter } from "./printer.js";
import type { PrintRuntime } from "./printRoutes.js";
import { PrintSpool } from "./printSpool.js";
import { SerialManager } from "./serialManager.js";
import type { SerialManagerLike } from "./serialManagerLike.js";
import { WsServer } from "./wsServer.js";

function createSerialManager(config: ReturnType<typeof loadConfig>): SerialManagerLike {
  if (config.mockSerial) {
    console.log("[button-bridge] BUTTON_MOCK_SERIAL enabled — using mock device");
    return new MockSerialManager();
  }
  return new SerialManager(config);
}

function createPrintRuntime(config: ReturnType<typeof loadConfig>): PrintRuntime | null {
  if (!config.printEnabled) {
    console.log("[button-bridge] printing disabled (BRIDGE_PRINT_ENABLED)");
    return null;
  }
  const mockPrinter = config.mockPrinter
    ? new MockPrinter(path.join(config.printSpoolDir, "mock-printed"), config.mockPrinter)
    : null;
  if (mockPrinter) {
    console.log("[button-bridge] BRIDGE_MOCK_PRINTER enabled — using mock printer");
  }
  const spool = new PrintSpool({
    dir: config.printSpoolDir,
    printer: mockPrinter ?? new LpPrinter(config.printer),
    retryBaseMs: config.printRetryBaseMs,
    retryMaxMs: config.printRetryMaxMs,
    statusIntervalMs: config.printStatusIntervalMs,
  });
  return { spool, mockPrinter };
}

function notifyNoClientIfSerialOpen(serial: SerialManagerLike, clientCount: number): void {
  if (clientCount > 0 || !serial.isOpen()) return;
  void serial.writeLine(LED_ERROR).catch((error: unknown) => {
    const msg = error instanceof Error ? error.message : String(error);
    console.warn("[button-bridge] failed to signal no-client error state", msg);
  });
}

async function main(): Promise<void> {
  const config = loadConfig();
  const serial = createSerialManager(config);
  const print = createPrintRuntime(config);
  const ws = new WsServer(
    config,
    serial,
    (clientCount) => {
      notifyNoClientIfSerialOpen(serial, clientCount);
    },
    print,
  );

  serial.on("open", ({ path }) => {
    ws.broadcast({ type: "status", state: "connected", path });
    notifyNoClientIfSerialOpen(serial, ws.getClientCount());
  });

  serial.on("close", ({ reason }) => {
    ws.broadcast({ type: "status", state: "disconnected", error: reason });
  });

  serial.on("line", ({ text }) => {
    ws.broadcast({ type: "line", text });
  });

  serial.on("error", ({ message }) => {
    console.error("[button-bridge/serial] error", message);
  });

  // Before the server starts, so the first job is checked against what is already on disk.
  // A spool that cannot start (unwritable folder) must not take the button down with it.
  await print?.spool.start().catch((error: unknown) => {
    console.error("[button-bridge/print] spool failed to start — printing unavailable", error);
  });
  serial.start();
  ws.start();

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`[button-bridge] ${signal} — shutting down`);
    await serial.stop();
    await print?.spool.stop();
    await ws.stop();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((error) => {
  console.error("[button-bridge] fatal error", error);
  process.exit(1);
});
