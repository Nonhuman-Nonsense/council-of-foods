import {
  getDevLogEnabled,
  isDevLogCategoryEnabled,
} from "@/settings/councilSettings";
import {
  type LogCategory,
  DEV_LOG_CATEGORIES,
  summarizeLogPayload,
} from "./logger.prod";

export { DEV_LOG_CATEGORIES, summarizeLogPayload, type LogCategory };

const CATEGORY_STYLE: Record<LogCategory, string> = {
  API: "color: #d97706; font-weight: bold;",
  SOCKET: "color: #3b82f6; font-weight: bold;",
  AGENT: "color: #8b5cf6; font-weight: bold;",
  REALTIME: "color: #0891b2; font-weight: bold;",
  BUTTON: "color: #10b981; font-weight: bold;",
  META: "color: #ec4899; font-weight: bold;",
  AUTOPLAY: "color: #f59e0b; font-weight: bold;",
  SYSTEM: "color: #6b7280; font-weight: bold;",
  ERROR: "color: #ef4444; font-weight: bold;",
};

const CATEGORY_ICON: Record<LogCategory, string> = {
  API: "🌐",
  SOCKET: "⬇️",
  AGENT: "🔧",
  REALTIME: "🎙️",
  BUTTON: "🔘",
  META: "🪑",
  AUTOPLAY: "🔁",
  SYSTEM: "⚙️",
  ERROR: "❌",
};

function shouldLog(category: LogCategory): boolean {
  if (!import.meta.env.DEV) return false;
  if (!getDevLogEnabled()) return false;
  return isDevLogCategoryEnabled(category);
}

function mirrorErrorToConsole(message: string, data?: unknown): void {
  const prefix = `[Council] ${message}`;
  if (data instanceof Error) {
    console.error(prefix, data);
    return;
  }
  if (data !== undefined) {
    console.error(prefix, data);
    return;
  }
  console.error(prefix);
}

function emitStructuredLog(category: LogCategory, message: string, data?: unknown): void {
  const style = CATEGORY_STYLE[category] ?? "font-weight: bold;";
  const icon = CATEGORY_ICON[category] ?? "🔹";
  const label = `${icon} [${category}] ${message}`;
  const write = category === "ERROR" ? console.error.bind(console) : console.log.bind(console);

  if (data === undefined) {
    write(`%c${label}`, style);
    return;
  }

  console.groupCollapsed(`%c${label}`, style);
  write(data);
  console.groupEnd();
}

/**
 * Dev structured console log. Import via `@/logger`; Vite aliases to this file in dev serve.
 *
 * ERROR is additive: failures always reach native `console.error` when structured
 * ERROR logging is off. Other categories are optional styled groups only.
 */
export function logEvent(category: LogCategory, message: string, data?: unknown): void {
  if (category === "ERROR") {
    if (!import.meta.env.DEV) return;
    if (shouldLog("ERROR")) {
      emitStructuredLog("ERROR", message, data);
    } else {
      mirrorErrorToConsole(message, data);
    }
    return;
  }

  if (!shouldLog(category)) return;
  emitStructuredLog(category, message, data);
}

export const log = {
  event: logEvent,
};

/** Dev console logging for terminal client failures (reporting is centralized in useUnrecoverableError). */
export function reportTerminalError(
  source: string,
  message: string,
  cause?: unknown,
  meta?: { meetingId?: number },
): void {
  logEvent("ERROR", source, { message, cause, ...meta });
}

if (import.meta.env.DEV && typeof window !== "undefined") {
  (window as Window & { __councilLogger?: typeof log }).__councilLogger = log;
}
