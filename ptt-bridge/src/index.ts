import { loadConfig } from "./config.js";
import { MockSerialManager } from "./mockSerialManager.js";
import { SerialManager } from "./serialManager.js";
import type { SerialManagerLike } from "./serialManagerLike.js";
import { WsServer } from "./wsServer.js";

function createSerialManager(config: ReturnType<typeof loadConfig>): SerialManagerLike {
  if (config.mockSerial) {
    console.log("[ptt-bridge] PTT_MOCK_SERIAL enabled — using mock device");
    return new MockSerialManager();
  }
  return new SerialManager(config);
}

async function main(): Promise<void> {
  const config = loadConfig();
  const serial = createSerialManager(config);
  const ws = new WsServer(config, serial);

  serial.on("open", ({ path }) => {
    ws.broadcast({ type: "status", state: "connected", path });
  });

  serial.on("close", ({ reason }) => {
    ws.broadcast({ type: "status", state: "disconnected", error: reason });
  });

  serial.on("line", ({ text }) => {
    ws.broadcast({ type: "line", text });
  });

  serial.on("error", ({ message }) => {
    console.error("[ptt-bridge/serial] error", message);
  });

  serial.start();
  ws.start();

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`[ptt-bridge] ${signal} — shutting down`);
    await serial.stop();
    await ws.stop();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((error) => {
  console.error("[ptt-bridge] fatal error", error);
  process.exit(1);
});
