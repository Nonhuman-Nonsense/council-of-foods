/**
 * Race-condition coverage: WS vs USB ordering, USB flap while WS stays up, resync timing.
 */
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

describe.sequential("button reconnect race conditions", () => {
  let bridge: TestBridge;

  afterEach(async () => {
    _resetButtonStoreForTests();
    vi.unstubAllGlobals();
    await bridge?.stop();
  });

  it("connects over websocket before usb is available and resyncs led when usb appears", async () => {
    bridge = await startTestBridge({ serialConnected: false });
    installBridgeUrlOverride(bridge.wsUrl);

    _resetButtonStoreForTests();
    useButtonStore.getState().init();
    await useButtonStore.getState().connect();
    await useButtonStore.getState().registerButtonIntent("human-input", "pulse");

    expect(useButtonStore.getState().bridgeStatus).toBe("connected");
    expect(useButtonStore.getState().serialDeviceConnected).toBe(false);
    expect(useButtonStore.getState().ledMode).toBe("pulse");
    expect(bridge.getWrittenLines()).not.toContain("LED_PULSE");

    bridge.simulateUsbReconnect(false);
    await waitForWrittenLine(bridge, "LED_PULSE");

    expect(useButtonStore.getState().serialDeviceConnected).toBe(true);
    expect(useButtonStore.getState().rawPressed).toBe(false);
  }, 20_000);

  it("does not send led commands while usb is unplugged but resyncs after replug", async () => {
    bridge = await startTestBridge();
    installBridgeUrlOverride(bridge.wsUrl);

    const transport = new ButtonTransport();
    await transport.connect();
    await transport.setLedMode("pulse");
    await waitForWrittenLine(bridge, "LED_PULSE");
    bridge.clearWrittenLines();

    bridge.simulateUsbDisconnect();
    await waitForTicks();
    expect(transport.isSerialDeviceConnected()).toBe(false);

    await transport.setLedMode("on");
    await waitForTicks();
    expect(bridge.getWrittenLines()).not.toContain("LED_ON");

    bridge.simulateUsbReconnect(false);
    await waitForCondition(() => transport.isSerialDeviceConnected());
    await transport.setLedMode("on");
    await waitForWrittenLine(bridge, "LED_ON");
  }, 20_000);

  it("usb flap while websocket stays up recovers button input", async () => {
    bridge = await startTestBridge();
    installBridgeUrlOverride(bridge.wsUrl);

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

    bridge.simulateButtonDown();
    bridge.simulateButtonUp();
    await waitForTicks();
    expect(events).toEqual(["button_down", "button_up"]);

    bridge.simulateUsbDisconnect();
    await waitForCondition(() => !transport.isSerialDeviceConnected());
    events.length = 0;

    bridge.simulateUsbReconnect(false);
    await waitForCondition(() => transport.isSerialDeviceConnected());
    expect(events).toContain("button_up");

    bridge.simulateButtonDown();
    bridge.simulateButtonUp();
    await waitForTicks();
    expect(events).toEqual(["button_up", "button_down", "button_up"]);
  }, 20_000);

  it("reports button held on usb reconnect via button_down sync", async () => {
    bridge = await startTestBridge();
    installBridgeUrlOverride(bridge.wsUrl);

    _resetButtonStoreForTests();
    useButtonStore.getState().init();
    await useButtonStore.getState().connect();
    await useButtonStore.getState().registerButtonIntent("human-input", "pulse");

    bridge.simulateUsbDisconnect();
    await waitForCondition(() => !useButtonStore.getState().serialDeviceConnected);
    expect(useButtonStore.getState().rawPressed).toBe(false);

    bridge.simulateUsbReconnect(true);
    await waitForCondition(() => useButtonStore.getState().serialDeviceConnected);
    await waitForTicks();

    expect(useButtonStore.getState().rawPressed).toBe(true);
    expect(useButtonStore.getState().pressed).toBe(true);
  }, 20_000);

  it("double usb flap still leaves transport connected and accepts input", async () => {
    bridge = await startTestBridge();
    installBridgeUrlOverride(bridge.wsUrl);

    const events: string[] = [];
    const transport = new ButtonTransport({
      onLine: (event) => {
        if (event.type === "button_down") events.push("down");
      },
    });
    transport.enableAutoReconnect();
    await transport.connect();
    expect(transport.getStatus()).toBe("connected");

    bridge.simulateUsbDisconnect();
    bridge.simulateUsbReconnect(false);
    bridge.simulateUsbDisconnect();
    bridge.simulateUsbReconnect(false);

    await waitForCondition(() => transport.isSerialDeviceConnected());
    expect(transport.getStatus()).toBe("connected");

    bridge.simulateButtonDown();
    await waitForTicks();
    expect(events).toContain("down");
  }, 20_000);
});
