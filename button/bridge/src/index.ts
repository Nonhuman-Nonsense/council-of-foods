import { LED_ERROR } from "../../../shared/buttonProtocol.js";
import { loadConfig } from "./config.js";
import { MockSerialManager } from "./mockSerialManager.js";
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
  const ws = new WsServer(config, serial, (clientCount) => {
    notifyNoClientIfSerialOpen(serial, clientCount);
  });

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

  serial.start();
  ws.start();

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`[button-bridge] ${signal} — shutting down`);
    await serial.stop();
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
