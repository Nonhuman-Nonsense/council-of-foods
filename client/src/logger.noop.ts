import type { LogCategory } from "./logger";

export type { LogCategory } from "./logger";
export { DEV_LOG_CATEGORIES } from "./logger";

export function logEvent(_category: LogCategory, _message: string, _data?: unknown): void {
  // production / test no-op
}

export const log = {
  event: logEvent,
};
