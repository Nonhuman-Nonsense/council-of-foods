/** Shared between logger, councilSettings, and setup UI — no runtime code. */
export const DEV_LOG_CATEGORIES = [
  "API",
  "SOCKET",
  "AGENT",
  "REALTIME",
  "BUTTON",
  "META",
  "SYSTEM",
  "ERROR",
] as const;

export type LogCategory = (typeof DEV_LOG_CATEGORIES)[number];
