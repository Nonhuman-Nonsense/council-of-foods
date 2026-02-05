import { config } from './src/config.js';

import express, { Request, Response } from "express";
import http from "http";
import { Server, Socket } from "socket.io";
import path from 'path';

import { Logger } from '@utils/Logger.js';
import { initReporting } from '@utils/errorbot.js';
import { initDb } from '@services/DbService.js';
import { initOpenAI } from '@services/OpenAIService.js';
import { SocketManager } from '@logic/SocketManager.js';
import { AVAILABLE_LANGUAGES } from '@shared/AvailableLanguages.js';

import { verifyGoogleCredentials } from './src/utils/StartupChecks.js';

const environment: string = config.NODE_ENV;

const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer);

// Initialize Services
try {
  initReporting();
  await initDb();
  await verifyGoogleCredentials(config); // Strict Startup Check
  initOpenAI();
} catch (e) {
  await Logger.error("init", "Startup failed.", e);
  process.exit(1);
}

Logger.info("init", "Startup complete.");

// Express for health checks
app.get('/health', (_req: Request, res: Response) => { res.sendStatus(200); });

if (environment === "prototype") {
  // Explicitly serve favicon to avoid 404s
  app.get('/favicon.png', (_req: Request, res: Response) => {
    res.sendFile(path.join(process.cwd(), "../prototype/public/favicon.png"));
  });
  app.use(express.static(path.join(process.cwd(), "../prototype/", "public")));
  //Enable prototype to reset to default settings for each language
  for (const lang of AVAILABLE_LANGUAGES) {
    for (const promptfile of ['foods', 'topics']) {
      app.get(`/${promptfile}_${lang}.json`, function (_req: Request, res: Response) {
        res.sendFile(path.join(process.cwd(), "../client/src/prompts", `${promptfile}_${lang}.json`));
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