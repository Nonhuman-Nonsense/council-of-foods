import { test, expect } from "@playwright/test";
import translations from "../../../src/locales/translation_en.json" with { type: "json" };

const BRIDGE_SIMULATE_URL = "http://127.0.0.1:8765/v1/test/simulate-button";
/** Client BUTTON_CONNECT_TIMEOUT_MS (5s) plus health/status slack. */
const BRIDGE_CONNECT_TIMEOUT_MS = 8_000;

type ButtonStoreSnapshot = {
  bridgeStatus: string;
  ledMode: string;
  pressed: boolean;
  hardwareDown: boolean;
};

async function readButtonStore(page: import("@playwright/test").Page): Promise<ButtonStoreSnapshot> {
  return page.evaluate(() => {
    const store = (window as Window & { __councilButtonStore?: { getState: () => ButtonStoreSnapshot } })
      .__councilButtonStore;
    if (!store) {
      throw new Error("__councilButtonStore not available — is the app running in dev mode?");
    }
    const state = store.getState();
    return {
      bridgeStatus: state.bridgeStatus,
      ledMode: state.ledMode,
      pressed: state.pressed,
      hardwareDown: state.hardwareDown,
    };
  });
}

async function seedMuseumPushToTalk(page: import("@playwright/test").Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem("councilAppMode", "museum");
    localStorage.setItem("councilAgentMode", "ptt");
    localStorage.setItem("councilPttHardwareEnabled", "true");
  });
}

async function openSetupWithMuseumPushToTalk(page: import("@playwright/test").Page): Promise<void> {
  await seedMuseumPushToTalk(page);
  await page.goto("/#setup");
}

async function waitForAppBridgeConnected(page: import("@playwright/test").Page): Promise<void> {
  const appStatus = page.getByTestId("setup-bridge-app-status");
  const connectedLabel = `${translations.setup.button.appLabel}: ${translations.setup.button.app.connected}`;
  await expect(appStatus).toContainText(connectedLabel, { timeout: BRIDGE_CONNECT_TIMEOUT_MS });
}

async function waitForButtonStoreReady(page: import("@playwright/test").Page): Promise<void> {
  await expect
    .poll(
      async () => {
        const state = await readButtonStore(page);
        return state.bridgeStatus === "connected" && state.ledMode !== "off";
      },
      { timeout: BRIDGE_CONNECT_TIMEOUT_MS },
    )
    .toBe(true);
}

test.describe("installation button (browser)", () => {
  test("setup reports bridge not running when health check fails", async ({ page }) => {
    await page.route("http://127.0.0.1:8765/health", (route) => route.abort());

    await openSetupWithMuseumPushToTalk(page);

    const status = page.getByTestId("setup-bridge-daemon-status");
    await expect(status).toContainText(translations.setup.button.bridge.notRunning);
  });
});

test.describe("installation button resilience (browser)", () => {
  test("connects, reconnects after reload, and forwards mock button presses", async ({ page }) => {
    await openSetupWithMuseumPushToTalk(page);
    await waitForAppBridgeConnected(page);

    await page.reload();
    await waitForButtonStoreReady(page);

    const down = await page.request.post(BRIDGE_SIMULATE_URL, {
      data: { pressed: true },
    });
    expect(down.ok()).toBe(true);

    await expect.poll(async () => (await readButtonStore(page)).hardwareDown).toBe(true);
    await expect.poll(async () => (await readButtonStore(page)).pressed).toBe(true);

    const up = await page.request.post(BRIDGE_SIMULATE_URL, {
      data: { pressed: false },
    });
    expect(up.ok()).toBe(true);

    await expect.poll(async () => (await readButtonStore(page)).hardwareDown).toBe(false);
    await expect.poll(async () => (await readButtonStore(page)).pressed).toBe(false);
  });
});
