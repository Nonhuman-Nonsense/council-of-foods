/**
 * End-to-end: mock button → bridge → client ButtonTransport / useButtonStore
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchButtonBridgeHealth } from "@/museum/button/buttonBridge";
import { ButtonTransport } from "@/museum/button/buttonBridge";
import { _resetButtonStoreForTests, useButtonStore } from "@/museum/button/buttonStore";
import { startTestBridge, waitForTicks, waitForWrittenLine, type TestBridge } from "./testHarness.js";

const BRIDGE_URL_STORAGE_KEY = "councilButtonBridgeUrl";

function installBridgeUrlOverride(wsUrl: string): void {
  const storage = new Map<string, string>();
  storage.set(BRIDGE_URL_STORAGE_KEY, wsUrl);
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
    clear: () => storage.clear(),
  });
}

describe.sequential("button e2e (mock → bridge → client)", () => {
  let bridge: TestBridge;

  beforeEach(async () => {
    bridge = await startTestBridge();
    installBridgeUrlOverride(bridge.wsUrl);
  });

  afterEach(async () => {
    _resetButtonStoreForTests();
    vi.unstubAllGlobals();
    await bridge.stop();
  });

  it("client health check reaches the running bridge", async () => {
    const health = await fetchButtonBridgeHealth(bridge.healthUrl);
    expect(health.status).toBe("running");
    expect(health).toMatchObject({
      serial: "connected",
      path: "mock",
      version: "1.0.0",
      serialDetail: "connected",
    });
  });

  it("ButtonTransport connects and completes handshake", async () => {
    const statuses: string[] = [];
    const transport = new ButtonTransport({
      onStatus: (status) => statuses.push(status),
    });

    const connected = await transport.connect();

    expect(connected).toBe(true);
    expect(transport.getStatus()).toBe("connected");
    expect(statuses).toContain("connecting");
    expect(statuses).toContain("connected");

    await transport.disconnect();
  });

  it("ButtonTransport receives mock button presses and sends LED commands", async () => {
    const events: string[] = [];
    const transport = new ButtonTransport({
      onLine: (event) => {
        if (event.type === "button_down" || event.type === "button_up") {
          events.push(event.type);
        }
      },
    });

    await transport.connect();
    await transport.setLedMode("pulse");
    await waitForWrittenLine(bridge, "LED_PULSE");

    bridge.simulateButtonDown();
    bridge.simulateButtonUp();
    await waitForTicks();

    expect(bridge.getWrittenLines()).toContain("LED_PULSE");
    expect(events).toEqual(["button_down", "button_up"]);

    await transport.disconnect();
  });

  it("useButtonStore connects through the bridge and tracks button state", async () => {
    _resetButtonStoreForTests();
    installBridgeUrlOverride(bridge.wsUrl);
    useButtonStore.getState().init();

    await useButtonStore.getState().connect();
    await useButtonStore.getState().claimButton("human-input");
    await useButtonStore.getState().setButtonLed("human-input", "pulse");
    await waitForWrittenLine(bridge, "LED_PULSE");

    bridge.simulateButtonDown();
    await waitForTicks();
    expect(useButtonStore.getState().hardwareDown).toBe(true);
    expect(useButtonStore.getState().pressed).toBe(true);

    bridge.simulateButtonUp();
    await waitForTicks();
    expect(useButtonStore.getState().hardwareDown).toBe(false);
    expect(useButtonStore.getState().pressed).toBe(false);

    expect(bridge.getWrittenLines()).toContain("LED_PULSE");
  });
});
