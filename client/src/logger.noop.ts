import type { LogCategory } from "./loggerTypes";

export type { LogCategory } from "./loggerTypes";
export { DEV_LOG_CATEGORIES } from "./loggerTypes";

export function logEvent(_category: LogCategory, _message: string, _data?: unknown): void {
  // production / test no-op
}

export const log = {
  event: logEvent,
};
