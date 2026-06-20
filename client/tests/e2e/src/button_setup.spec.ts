import { test, expect } from "@playwright/test";
import translations from "../../../src/locales/translation_en.json" with { type: "json" };

test.describe("installation button (browser)", () => {
  test("setup connects to mock bridge when push-to-talk is enabled", async ({ page }) => {
    await page.goto("/#setup");

    await page.getByTestId("voice-guide-push-to-talk").click();

    const status = page.getByTestId("setup-button-status");
    await expect(status).toContainText(translations.setup.button.status, { timeout: 5000 });
    await expect(status).toContainText(translations.setup.button.connected, { timeout: 15_000 });
  });

  test("setup reports bridge not running when health check fails", async ({ page }) => {
    await page.route("http://127.0.0.1:8765/health", (route) => route.abort());

    await page.goto("/#setup");
    await page.getByTestId("voice-guide-push-to-talk").click();

    const status = page.getByTestId("setup-button-status");
    await expect(status).toContainText(translations.setup.button.bridgeNotRunning, { timeout: 10_000 });
  });
});
