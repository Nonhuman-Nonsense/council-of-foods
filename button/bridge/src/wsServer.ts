import http from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import type { BridgeConfig } from "./config.js";
import { corsHeaders } from "./cors.js";
import type { SerialManagerLike } from "./serialManagerLike.js";
import { BRIDGE_VERSION, parseClientMessage, serializeServerMessage, type ServerMessage } from "./types.js";

export class WsServer {
  private readonly config: BridgeConfig;
  private readonly serial: SerialManagerLike;
  private httpServer: http.Server | null = null;
  private wss: WebSocketServer | null = null;

  constructor(config: BridgeConfig, serial: SerialManagerLike) {
    this.config = config;
    this.serial = serial;
  }

  start(): void {
    const httpServer = http.createServer((req, res) => {
      const origin = typeof req.headers.origin === "string" ? req.headers.origin : undefined;
      const cors = corsHeaders(origin);

      if (req.url === "/health" && req.method === "OPTIONS") {
        res.writeHead(204, cors);
        res.end();
        return;
      }

      if (req.url === "/health" && req.method === "GET") {
        const body = JSON.stringify({
          ok: true,
          version: BRIDGE_VERSION,
          serial: this.serial.isOpen() ? "connected" : "disconnected",
          path: this.serial.getOpenPath(),
        });
        res.writeHead(200, { "Content-Type": "application/json", ...cors });
        res.end(body);
        return;
      }
      res.writeHead(404);
      res.end();
    });

    const wss = new WebSocketServer({ server: httpServer, path: "/v1/button" });

    wss.on("connection", (socket, request) => {
      const remote = request.socket.remoteAddress ?? "unknown";
      if (remote !== "127.0.0.1" && remote !== "::1" && remote !== "::ffff:127.0.0.1") {
        console.warn(`[button-bridge/ws] rejected non-local connection from ${remote}`);
        socket.close(1008, "local only");
        return;
      }

      console.log("[button-bridge/ws] client connected");
      this.send(socket, { type: "info", version: BRIDGE_VERSION });
      this.send(socket, this.currentStatusMessage());

      socket.on("message", (data) => {
        const raw = typeof data === "string" ? data : data.toString("utf8");
        const message = parseClientMessage(raw);
        if (!message) {
          console.warn("[button-bridge/ws] invalid client message", raw);
          return;
        }
        void this.serial.writeLine(message.line).catch((error: unknown) => {
          const msg = error instanceof Error ? error.message : String(error);
          console.warn("[button-bridge/ws] serial write failed", msg);
        });
      });

      socket.on("close", () => {
        console.log("[button-bridge/ws] client disconnected");
      });
    });

    httpServer.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "EADDRINUSE") {
        console.error(
          `[button-bridge] port ${this.config.port} is already in use — another bridge is still running.`,
        );
        console.error("[button-bridge] stop it with: npm run stop");
        process.exit(1);
      }
      throw error;
    });

    httpServer.listen(this.config.port, this.config.host, () => {
      console.log(
        `[button-bridge] listening on http://${this.config.host}:${this.config.port} (ws path /v1/button)`,
      );
    });

    this.httpServer = httpServer;
    this.wss = wss;
  }

  async stop(): Promise<void> {
    const sockets = this.wss?.clients ?? [];
    for (const socket of sockets) {
      socket.close(1001, "bridge shutting down");
    }
    await new Promise<void>((resolve, reject) => {
      this.wss?.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
    await new Promise<void>((resolve, reject) => {
      this.httpServer?.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
    this.wss = null;
    this.httpServer = null;
  }

  broadcast(message: ServerMessage): void {
    const payload = serializeServerMessage(message);
    for (const client of this.wss?.clients ?? []) {
      if (client.readyState === client.OPEN) {
        client.send(payload);
      }
    }
  }

  private send(socket: WebSocket, message: ServerMessage): void {
    if (socket.readyState === socket.OPEN) {
      socket.send(serializeServerMessage(message));
    }
  }

  private currentStatusMessage(): ServerMessage {
    if (this.serial.isOpen()) {
      return {
        type: "status",
        state: "connected",
        path: this.serial.getOpenPath() ?? undefined,
      };
    }
    return { type: "status", state: "disconnected" };
  }
}
