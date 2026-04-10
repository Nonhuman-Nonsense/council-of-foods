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

import { verifyGoogleCredentials } from '@utils/StartupChecks.js';
import { createMeetingRecord } from '@api/createMeetingRecord.js';
import { ZodError } from 'zod';

const environment: string = config.NODE_ENV;

const app = express();
app.use(express.json());
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


app.post('/api/meetings', async (req: Request, res: Response) => {
  try {
    const meetingId = await createMeetingRecord(req.body, environment);
    await Logger.info('api', 'POST /api/meetings successful', { meetingId });
    res.status(201).json({ meetingId });
  } catch (e: unknown) {
    if (e instanceof ZodError) {
      await Logger.warn('api', 'POST /api/meetings failed', e);
      res.status(400).json({ message: 'Invalid payload' });
      return;
    }
    await Logger.error('api', 'POST /api/meetings failed', e);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

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