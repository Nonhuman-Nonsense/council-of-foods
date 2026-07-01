#!/usr/bin/env node
/**
 * Stop a dev bridge instance listening on BUTTON_BRIDGE_PORT (default 8765).
 */
import { execSync } from "node:child_process";

const port = process.env.BUTTON_BRIDGE_PORT?.trim() || "8765";

function listListenerPids() {
  try {
    const out = execSync(`lsof -ti tcp:${port}`, { encoding: "utf8" }).trim();
    if (!out) return [];
    return [...new Set(out.split("\n").map((pid) => Number(pid)).filter(Number.isFinite))];
  } catch {
    return [];
  }
}

const pids = listListenerPids();
if (pids.length === 0) {
  console.log(`[button-bridge] no process listening on port ${port}`);
  process.exit(0);
}

for (const pid of pids) {
  try {
    process.kill(pid, "SIGTERM");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[button-bridge] failed to stop pid ${pid}: ${message}`);
  }
}

console.log(`[button-bridge] stopped pid ${pids.join(", ")} on port ${port}`);
