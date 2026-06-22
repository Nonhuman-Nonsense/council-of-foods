import { test, expect } from "@playwright/test";
import translations from "../../../src/locales/translation_en.json" with { type: "json" };

const BRIDGE_SIMULATE_URL = "http://127.0.0.1:8765/v1/test/simulate-button";

type ButtonStoreSnapshot = {
  bridgeStatus: string;
  rawPressed: boolean;
  pressed: boolean;
  buttonInputEnabled: boolean;
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
      rawPressed: state.rawPressed,
      pressed: state.pressed,
      buttonInputEnabled: state.buttonInputEnabled,
    };
  });
}

async function openSetupWithMuseumPushToTalk(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/#setup");
  await page.getByTestId("app-mode-museum").click();
  await page.getByTestId("voice-guide-push-to-talk").click();
}

async function waitForAppBridgeConnected(page: import("@playwright/test").Page): Promise<void> {
  const appStatus = page.getByTestId("setup-bridge-app-status");
  const connectedLabel = `${translations.setup.button.appLabel}: ${translations.setup.button.app.connected}`;
  await expect(appStatus).toContainText(connectedLabel, { timeout: 15_000 });
}

async function enablePushToTalkOnSetup(page: import("@playwright/test").Page): Promise<void> {
  await openSetupWithMuseumPushToTalk(page);
  await waitForAppBridgeConnected(page);
}

test.describe("installation button (browser)", () => {
  test("setup connects to mock bridge when push-to-talk is enabled", async ({ page }) => {
    await enablePushToTalkOnSetup(page);
  });

  test("setup reports bridge not running when health check fails", async ({ page }) => {
    await page.route("http://127.0.0.1:8765/health", (route) => route.abort());

    await openSetupWithMuseumPushToTalk(page);

    const status = page.getByTestId("setup-bridge-daemon-status");
    await expect(status).toContainText(translations.setup.button.bridge.notRunning, { timeout: 10_000 });
  });
});

test.describe.serial("installation button resilience (browser)", () => {
  test("reconnects after page reload", async ({ page }) => {
    await enablePushToTalkOnSetup(page);
    await page.reload();

    await waitForAppBridgeConnected(page);
  });

  test("mock button press reaches the client store", async ({ page }) => {
    await enablePushToTalkOnSetup(page);

    await expect.poll(async () => (await readButtonStore(page)).bridgeStatus).toBe("connected");
    await expect.poll(async () => (await readButtonStore(page)).buttonInputEnabled).toBe(true);

    const down = await page.request.post(BRIDGE_SIMULATE_URL, {
      data: { pressed: true },
    });
    expect(down.ok()).toBe(true);

    await expect.poll(async () => (await readButtonStore(page)).rawPressed).toBe(true, {
      timeout: 10_000,
    });
    await expect.poll(async () => (await readButtonStore(page)).pressed).toBe(true);

    const up = await page.request.post(BRIDGE_SIMULATE_URL, {
      data: { pressed: false },
    });
    expect(up.ok()).toBe(true);

    await expect.poll(async () => (await readButtonStore(page)).rawPressed).toBe(false);
    await expect.poll(async () => (await readButtonStore(page)).pressed).toBe(false);
  });
});
