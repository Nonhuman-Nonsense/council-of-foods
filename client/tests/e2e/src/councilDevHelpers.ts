import type { Page } from "@playwright/test";
import {
  DEV_LOG_DISABLED_CATEGORIES_KEY,
  DEV_LOG_ENABLED_KEY,
  type LogCategory,
} from "@/settings/councilSettings";

type CouncilDevWindow = Window & {
  __councilLogger?: { event: (category: string, message: string, data?: unknown) => void };
  __councilButtonStore?: { getState: () => Record<string, unknown> };
};

/**
 * Enable client dev console logging from Playwright (dev builds only).
 */
export async function enableClientDevLogging(page: Page): Promise<void> {
  await page.evaluate(
    ([enabledKey, disabledKey]) => {
      localStorage.setItem(enabledKey, "true");
      localStorage.setItem(disabledKey, "[]");
    },
    [DEV_LOG_ENABLED_KEY, DEV_LOG_DISABLED_CATEGORIES_KEY] as const,
  );
}

export async function setClientDevLogCategory(
  page: Page,
  category: LogCategory,
  enabled: boolean,
): Promise<void> {
  await page.evaluate(
    ({ disabledKey, cat, on }) => {
      const raw = localStorage.getItem(disabledKey);
      const disabled = raw ? (JSON.parse(raw) as string[]) : [];
      const next = on
        ? disabled.filter((item) => item !== cat)
        : [...new Set([...disabled, cat])];
      localStorage.setItem(disabledKey, JSON.stringify(next));
      window.dispatchEvent(new CustomEvent("council-dev-log-change"));
    },
    { disabledKey: DEV_LOG_DISABLED_CATEGORIES_KEY, cat: category, on: enabled },
  );
}

/** Smoke-test that dev hooks are exposed on `window`. */
export async function readCouncilDevHooks(page: Page): Promise<{
  hasLogger: boolean;
  hasButtonStore: boolean;
}> {
  return page.evaluate(() => {
    const win = window as CouncilDevWindow;
    return {
      hasLogger: typeof win.__councilLogger?.event === "function",
      hasButtonStore: typeof win.__councilButtonStore?.getState === "function",
    };
  });
}
