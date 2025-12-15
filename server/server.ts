import dotenv from 'dotenv';
dotenv.config();

import express, { Request, Response } from "express";
import http from "http";
import { Server, Socket } from "socket.io";
import path from 'path';
import { fileURLToPath } from 'url';

import { Logger } from './src/utils/Logger.js';
import { initReporting, reportError } from './errorbot.js';
import { initDb } from './src/services/DbService.js';
import { initOpenAI } from './src/services/OpenAIService.js';
import { MeetingManager } from './src/logic/MeetingManager.js';

import { EnvSchema } from './src/models/ValidationSchemas.js';

// Validate Env
const envParse = EnvSchema.safeParse(process.env);
if (!envParse.success) {
  const errorMsg = "Invalid environment variables: " + JSON.stringify(envParse.error.format(), null, 2);
  reportError("init", errorMsg, envParse.error).then(() => process.exit(1));
}

const environment: string = envParse.data ? envParse.data.NODE_ENV : "production";
const __filename: string = fileURLToPath(import.meta.url);
const __dirname: string = path.dirname(__filename);

const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  // transports: ["websocket", "polling"], 
});

// Initialize Services
initReporting();
initDb().catch(async (e: any) => {
  await reportError("db", "Failed to initialize Database", e);
  process.exit(1);
});
try {
  initOpenAI();
} catch (e: any) {
  reportError("openai", "Failed to initialize OpenAI", e).then(() => process.exit(1));
}

Logger.info("init", `node_env is ${environment}`);

// Express Logic
app.get('/health', (req: Request, res: Response) => { res.sendStatus(200); });

if (environment === "prototype") {
  app.use(express.static(path.join(__dirname, "../prototype/", "public")));
  //Enable prototype to reset to default settings for each language
  for (const lang of ['en']) {
    for (const promptfile of ['foods', 'topics']) {
      app.get(`/${promptfile}_${lang}.json`, function (req: Request, res: Response) {
        res.sendFile(path.join(__dirname, "../client/src/prompts", `${promptfile}_${lang}.json`));
      });
    }
  }

} else if (environment !== "development") {
  const clientDistPath = path.join(process.cwd(), "../client/dist");
  app.use(express.static(clientDistPath));
  app.get("/{*splat}", function (req: Request, res: Response) {
    res.sendFile(path.join(clientDistPath, "index.html"));
  });
}

// Socket Logic
io.on("connection", (socket: Socket) => {
  Logger.info("socket", `[session ${socket.id}] connected`);
  new MeetingManager(socket, environment);
});

// Server Listen
httpServer.listen(3001, () => {
  Logger.info("init", "Listening on *:3001");
});

process.on('SIGTERM', () => {
  Logger.info("shutdown", "SIGTERM shutdown");
  process.exit(1);
});
process.on('SIGINT', () => {
  Logger.info("shutdown", "SIGINT shutdown");
  process.exit(1);
});