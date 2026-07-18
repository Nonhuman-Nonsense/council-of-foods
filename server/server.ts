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
import {
  getSpaRedirectTarget,
  isBlockedScannerPath,
  preferredLangFromRequest,
  readSpaShellTemplate,
  sendSpaShell,
  shouldServeSpaShell,
} from '@utils/spaShell.js';
import { CHARACTERS_FILE } from '@shared/prompts/characterSetupMetadata.js';

import {
  CACHE_CONTROL_DIST_ASSET_IMMUTABLE,
  CACHE_CONTROL_DIST_PUBLIC_ROOT,
  CACHE_CONTROL_NO_STORE,
  cacheControlPrivateNoStoreApi,
} from '@utils/httpCache.js';
import { registerMeetingRoutes } from '@api/meetingRoutes.js';
import { registerRealtimeRoutes } from '@api/realtimeSession.js';
import { registerAudioRoutes } from '@api/audioRoutes.js';
import { registerDevErrorbotRoutes } from '@api/devErrorbotRoutes.js';
import { registerClientReportRoutes } from '@api/clientReportRoutes.js';

const environment: string = config.NODE_ENV;

const app = express();
app.use(express.json());
const httpServer = http.createServer(app);
const io = new Server(httpServer);

// Initialize Services
try {
  initReporting();
  await initDb();
  initOpenAI();
} catch (e) {
  await Logger.error("init", "Startup failed.", { error: e });
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
registerClientReportRoutes(app);

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

  const spaShellTemplate = readSpaShellTemplate(clientDistPath);

  if (AVAILABLE_LANGUAGES.length > 1) {
    app.get("/", function (req: Request, res: Response) {
      res.setHeader('Cache-Control', CACHE_CONTROL_NO_STORE);
      res.redirect(302, getSpaRedirectTarget("/", AVAILABLE_LANGUAGES, preferredLangFromRequest(req)));
    });
  }

  app.get("/index.html", (req, res) => sendSpaShell(res, spaShellTemplate, preferredLangFromRequest(req)));

  app.use(express.static(clientDistPath, {
    maxAge: ONE_YEAR_MS,
    immutable: true,
    index: false,
    setHeaders(res, filePath) {
      const normalized = filePath.replace(/\\/g, '/');
      if (normalized.includes('/assets/')) {
        res.setHeader('Cache-Control', CACHE_CONTROL_DIST_ASSET_IMMUTABLE);
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
      res.redirect(302, getSpaRedirectTarget(req.path, AVAILABLE_LANGUAGES, preferredLangFromRequest(req)));
      return;
    }

    sendSpaShell(res, spaShellTemplate, preferredLangFromRequest(req));
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