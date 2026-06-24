import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ButtonTransport } from "@/museum/button/transport";
import { _resetButtonStoreForTests, useButtonStore } from "@/museum/button/buttonStore";
import {
  startTestBridge,
  waitForCondition,
  waitForTicks,
  waitForWrittenLine,
  type TestBridge,
} from "./testHarness.js";

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

describe.sequential("button reconnect resilience", () => {
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

  it("ButtonTransport reconnects after bridge restart on the same port", async () => {
    const statuses: string[] = [];
    const transport = new ButtonTransport({
      onStatus: (status) => statuses.push(status),
    });

    transport.enableAutoReconnect();
    await transport.connect();
    expect(transport.getStatus()).toBe("connected");

    await bridge.restart();

    await waitForCondition(() => transport.isSessionHealthy(), 15_000);
    expect(statuses).toContain("disconnected");
    expect(statuses.filter((s) => s === "connected").length).toBeGreaterThanOrEqual(2);
  }, 20_000);

  it("delivers mock button events after reconnect", async () => {
    const events: string[] = [];
    const transport = new ButtonTransport({
      onLine: (event) => {
        if (event.type === "button_down" || event.type === "button_up") {
          events.push(event.type);
        }
      },
    });

    transport.enableAutoReconnect();
    await transport.connect();
    await transport.setLedMode("pulse");

    bridge.simulateButtonDown();
    bridge.simulateButtonUp();
    await waitForTicks();
    expect(events).toEqual(["button_down", "button_up"]);

    await bridge.restart();
    events.length = 0;

    await waitForCondition(() => transport.isSessionHealthy(), 15_000);
    bridge.simulateButtonDown();
    bridge.simulateButtonUp();
    await waitForTicks();
    expect(events).toEqual(["button_down", "button_up"]);
  }, 20_000);

  it("useButtonStore recovers through transport watchdog after bridge restart", async () => {
    localStorage.setItem("councilPushToTalk", "true");
    _resetButtonStoreForTests();
    installBridgeUrlOverride(bridge.wsUrl);
    useButtonStore.getState().init();
    useButtonStore.getState().enableAutoReconnect();
    await useButtonStore.getState().connect();
    await useButtonStore.getState().claimButton("human-input");
    await useButtonStore.getState().setButtonLed("human-input", "pulse");

    bridge.simulateButtonDown();
    await waitForTicks();
    expect(useButtonStore.getState().rawPressed).toBe(true);

    await bridge.restart();

    await waitForCondition(
      () => useButtonStore.getState().bridgeStatus === "connected",
      15_000,
    );
    await waitForWrittenLine(bridge, "LED_PULSE");

    bridge.simulateButtonDown();
    await waitForTicks();
    expect(useButtonStore.getState().pressed).toBe(true);
  }, 20_000);

  it("simulate-button HTTP endpoint forwards presses to websocket clients", async () => {
    const lines: string[] = [];
    const transport = new ButtonTransport({
      onLine: (event) => {
        if (event.type === "button_down" || event.type === "button_up") {
          lines.push(event.type);
        }
      },
    });

    await transport.connect();

    const down = await fetch(bridge.simulateButtonUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pressed: true }),
    });
    expect(down.ok).toBe(true);

    const up = await fetch(bridge.simulateButtonUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pressed: false }),
    });
    expect(up.ok).toBe(true);

    await waitForTicks();
    expect(lines).toEqual(["button_down", "button_up"]);
  });
});
