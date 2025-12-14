import dotenv from 'dotenv';
dotenv.config();

import express from "express";
import http from "http";
import { Server } from "socket.io";
import path from 'path';
import { fileURLToPath } from 'url';

import { initReporting } from './errorbot.js';
import { initDb } from './src/services/DbService.js';
import { initOpenAI } from './src/services/OpenAIService.js';
import { MeetingManager } from './src/logic/MeetingManager.js';

const environment = process.env.NODE_ENV ?? "production";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  // transports: ["websocket", "polling"], 
});

// Initialize Services
initReporting();
initDb().catch(e => {
  console.error("Failed to initialize Database:", e);
  process.exit(1);
});
try {
  initOpenAI();
} catch (e) {
  console.error("Failed to initialize OpenAI:", e);
  process.exit(1);
}

console.log(`[init] node_env is ${environment}`);

// Express Logic
app.get('/health', (req, res) => res.sendStatus(200));

if (environment === "prototype") {
  app.use(express.static(path.join(__dirname, "../prototype/", "public")));
  //Enable prototype to reset to default settings for each language
  for (const lang of ['en', 'sv']) {
    for (const promptfile of ['foods', 'topics']) {
      app.get(`/${promptfile}_${lang}.json`, function (req, res) {
        res.sendFile(path.join(__dirname, "../client/src/prompts", `${promptfile}_${lang}.json`));
      });
    }
  }

  // Also pass globalOptions logic? 
  // In original server.js line 27: import globalOptions from './global-options.json' with { type: 'json' };
  // It was used in start_conversation (line 520).
  // MeetingManager imports it directly, so we don't need to pass it here.

} else if (environment !== "development") {
  app.use(express.static(path.join(__dirname, "../client/dist")));
  app.get("/{*splat}", function (req, res) {
    res.sendFile(path.join(__dirname, "../client/dist", "index.html"));
  });
}

// Socket Logic
io.on("connection", (socket) => {
  console.log(`[session ${socket.id}] connected`);
  new MeetingManager(socket, environment);
});

// Server Listen
httpServer.listen(3001, () => {
  console.log("[init] Listening on *:3001");
});

process.on('SIGTERM', () => {
  console.log('[Shutdown] SIGTERM shutdown');
  process.exit(1);
});
process.on('SIGINT', () => {
  console.log('[Shutdown] SIGINT shutdown');
  process.exit(1);
});