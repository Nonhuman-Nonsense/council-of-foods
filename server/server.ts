import { config } from './src/config.js';

import express, { Request, Response } from "express";
import http from "http";
import { Server, Socket } from "socket.io";
import path from 'path';
import { fileURLToPath } from 'url';

import { Logger } from '@utils/Logger.js';
import { initReporting } from '@utils/errorbot.js';
import { initDb } from '@services/DbService.js';
import { initOpenAI } from '@services/OpenAIService.js';
import { SocketManager } from '@logic/SocketManager.js';

const environment: string = config.NODE_ENV;
const __filename: string = fileURLToPath(import.meta.url);
const __dirname: string = path.dirname(__filename);

const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer);

// Initialize Services
initReporting();
await initDb().catch(async (e: any) => {
  await Logger.error("db", "Failed to initialize Database", e);
  process.exit(1);
});
try {
  initOpenAI();
} catch (e: any) {
  // We can't await inside a synchronous try/catch block if the function isn't async
  // But top-level code or promise chain can.
  // Actually, this catch block is synchronous.
  // To await here, we need to wrap it or use .then().
  Logger.error("openai", "Failed to initialize OpenAI", e).then(() => {
    process.exit(1);
  });
}

// Express for health checks
app.get('/health', (_req: Request, res: Response) => { res.sendStatus(200); });

if (environment === "prototype") {
  app.use(express.static(path.join(__dirname, "../prototype/", "public")));
  //Enable prototype to reset to default settings for each language
  for (const lang of ['en']) {
    for (const promptfile of ['foods', 'topics']) {
      app.get(`/${promptfile}_${lang}.json`, function (_req: Request, res: Response) {
        res.sendFile(path.join(__dirname, "../client/src/prompts", `${promptfile}_${lang}.json`));
      });
    }
  }

} else if (environment !== "development") {
  const clientDistPath = path.join(process.cwd(), "../client/dist");
  app.use(express.static(clientDistPath));
  app.get("/{*splat}", function (_req: Request, res: Response) {
    res.sendFile(path.join(clientDistPath, "index.html"));
  });
}

// Socket Logic
io.on("connection", (socket: Socket) => {
  Logger.info("socket", `[session ${socket.id}] connected`);
  new SocketManager(socket, environment);
});

// Server Listen
httpServer.listen(config.PORT, () => {
  Logger.info("init", `Listening on *:${config.PORT}`);
});

process.on('SIGTERM', () => {
  Logger.warn("shutdown", "SIGTERM shutdown");
  process.exit(1);
});
process.on('SIGINT', () => {
  Logger.warn("shutdown", "SIGINT shutdown");
  process.exit(1);
});