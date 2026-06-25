import {
  getDevLogEnabled,
  isDevLogCategoryEnabled,
} from "@/settings/councilSettings";
import type { LogCategory } from "./loggerTypes";

export type { LogCategory } from "./loggerTypes";
export { DEV_LOG_CATEGORIES } from "./loggerTypes";

const CATEGORY_STYLE: Record<LogCategory, string> = {
  API: "color: #d97706; font-weight: bold;",
  SOCKET: "color: #3b82f6; font-weight: bold;",
  AGENT: "color: #8b5cf6; font-weight: bold;",
  REALTIME: "color: #0891b2; font-weight: bold;",
  BUTTON: "color: #10b981; font-weight: bold;",
  META: "color: #ec4899; font-weight: bold;",
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
  SYSTEM: "⚙️",
  ERROR: "❌",
};

function shouldLog(category: LogCategory): boolean {
  if (!import.meta.env.DEV) return false;
  if (!getDevLogEnabled()) return false;
  return isDevLogCategoryEnabled(category);
}

/**
 * Dev-only structured console log. Production builds alias to `logger.noop.ts`.
 */
export function logEvent(category: LogCategory, message: string, data?: unknown): void {
  if (!shouldLog(category)) return;

  const style = CATEGORY_STYLE[category] ?? "font-weight: bold;";
  const icon = CATEGORY_ICON[category] ?? "🔹";
  const label = `${icon} [${category}] ${message}`;

  if (data === undefined) {
    console.log(`%c${label}`, style);
    return;
  }

  console.groupCollapsed(`%c${label}`, style);
  console.log(data);
  console.groupEnd();
}

export const log = {
  event: logEvent,
};

if (import.meta.env.DEV && typeof window !== "undefined") {
  (window as Window & { __councilLogger?: typeof log }).__councilLogger = log;
}
