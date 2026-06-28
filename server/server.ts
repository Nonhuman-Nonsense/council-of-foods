import { config } from './src/config.js';

import express, { Request, Response } from "express";
import http from "http";
import { Server, Socket } from "socket.io";
import path from 'path';

import { Logger } from '@utils/Logger.js';
import { initReporting, sendReport } from '@utils/errorbot.js';
import { initDb } from '@services/DbService.js';
import { initOpenAI } from '@services/OpenAIService.js';
import { SocketManager } from '@logic/SocketManager.js';
import { AVAILABLE_LANGUAGES } from '@shared/AvailableLanguages.js';
import { CHARACTERS_FILE } from '@shared/prompts/characterSetupMetadata.js';

import { verifyGoogleCredentials } from '@utils/StartupChecks.js';
import {
  CACHE_CONTROL_DIST_ASSET_IMMUTABLE,
  CACHE_CONTROL_DIST_PUBLIC_ROOT,
  CACHE_CONTROL_HTML_SHELL,
  CACHE_CONTROL_NO_STORE,
  cacheControlPrivateNoStoreApi,
} from '@utils/httpCache.js';
import { getSpaRedirectTarget, isBlockedScannerPath, shouldServeSpaShell } from '@utils/spaFallback.js';
import { registerMeetingRoutes } from '@api/meetingRoutes.js';
import { registerRealtimeRoutes } from '@api/realtimeSession.js';
import { registerAudioRoutes } from '@api/audioRoutes.js';
import { registerDevErrorbotRoutes } from '@api/devErrorbotRoutes.js';
import { z } from 'zod';

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
app.get('/health', (_req: Request, res: Response) => {
  res.setHeader('Cache-Control', CACHE_CONTROL_NO_STORE);
  res.sendStatus(200);
});

// Api routes run before static files (audio GET overwrites Cache-Control on success)
app.use('/api', cacheControlPrivateNoStoreApi);
registerMeetingRoutes(app, environment);
registerRealtimeRoutes(app);
registerAudioRoutes(app);
registerDevErrorbotRoutes(app, environment);

const ClientReportBody = z.object({
  message: z.string().min(1).max(2000),
  source: z.string().min(1).max(200),
  meetingId: z.number().int().positive().optional(),
  url: z.string().max(500).optional(),
  cause: z.unknown().optional(),
});

app.post('/api/client-report', async (req: Request, res: Response) => {
  const parsed = ClientReportBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: 'Invalid client report' });
    return;
  }

  const { message, source, meetingId, url, cause } = parsed.data;
  const context = meetingId != null ? `client meeting ${meetingId}` : `client ${source}`;
  const detail = url ? `${message} (${url})` : message;

  res.status(204).end();

  await sendReport({
    context,
    severity: 'critical',
    message: `[CLIENT TERMINAL] ${detail}`,
    error: cause,
    clientImpact: 'terminal',
    source: 'client',
  });
});

if (environment === "prototype") {
  app.use(express.static(path.join(process.cwd(), "../prototype/", "public"), {
    setHeaders(res) {
      res.setHeader('Cache-Control', CACHE_CONTROL_NO_STORE);
    },
  }));
  //Enable prototype to reset to default settings for each language
  for (const lang of AVAILABLE_LANGUAGES) {
    for (const promptfile of [CHARACTERS_FILE, 'topics']) {
      app.get(`/${promptfile}_${lang}.json`, function (_req: Request, res: Response) {
        res.setHeader('Cache-Control', CACHE_CONTROL_NO_STORE);
        res.sendFile(path.join(process.cwd(), "../shared/prompts", `${promptfile}_${lang}.json`));
      });
    }
  }
} else if (environment !== "development") {
  const clientDistPath = path.join(process.cwd(), "../client/dist");
  const ONE_YEAR_MS = 31536000000;
  app.use(express.static(clientDistPath, {
    maxAge: ONE_YEAR_MS,
    immutable: true,
    setHeaders(res, filePath) {
      const normalized = filePath.replace(/\\/g, '/');
      if (normalized.includes('/assets/')) {
        res.setHeader('Cache-Control', CACHE_CONTROL_DIST_ASSET_IMMUTABLE);
      } else if (normalized.endsWith('/index.html')) {
        res.setHeader('Cache-Control', CACHE_CONTROL_HTML_SHELL);
      } else {
        res.setHeader('Cache-Control', CACHE_CONTROL_DIST_PUBLIC_ROOT);
      }
    },
  }));
  app.get("/{*splat}", function (req: Request, res: Response) {
    if (isBlockedScannerPath(req.path)) {
      res.setHeader('Cache-Control', CACHE_CONTROL_NO_STORE);
      res.sendStatus(404);
      return;
    }

    if (!shouldServeSpaShell(req.path)) {
      res.setHeader('Cache-Control', CACHE_CONTROL_NO_STORE);
      res.redirect(302, getSpaRedirectTarget(req.path));
      return;
    }

    res.setHeader('Cache-Control', CACHE_CONTROL_HTML_SHELL);
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