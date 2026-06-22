import { describe, expect, it } from "vitest";
import {
  getBridgeAppStatus,
  getBridgeDaemonStatus,
  getSetupBridgeDetailLines,
  getUsbButtonStatus,
} from "@/museum/button/setupButtonStatus";

const runningHealth = {
  status: "running" as const,
  serial: "disconnected" as const,
  path: null,
  version: "1.0.0",
  serialDetail: "no_device" as const,
  serialMessage: "No USB serial device with vendor 239a found (1 other port(s) visible).",
  expectedVendorId: "239a",
  scannedPorts: [{ path: "/dev/cu.usbmodem1", vendorId: "2341", productId: "0043" }],
};

describe("setupButtonStatus", () => {
  it("maps bridge daemon health", () => {
    expect(getBridgeDaemonStatus({ status: "checking" })).toBe("checking");
    expect(getBridgeDaemonStatus(runningHealth)).toBe("running");
    expect(getBridgeDaemonStatus({ status: "not_running" })).toBe("notRunning");
    expect(getBridgeDaemonStatus({ status: "error", message: "x" })).toBe("error");
  });

  it("maps app websocket status independently of usb", () => {
    expect(getBridgeAppStatus(true, runningHealth, "connecting")).toBe("connecting");
    expect(getBridgeAppStatus(true, runningHealth, "connected")).toBe("connected");
    expect(getBridgeAppStatus(true, { status: "not_running" }, "connecting")).toBe("unavailable");
  });

  it("maps usb status from health serial and detail fields", () => {
    expect(
      getUsbButtonStatus({
        ...runningHealth,
        serial: "connected",
        path: "/dev/cu.usbmodem1",
        serialDetail: "connected",
      }),
    ).toBe("connected");

    expect(
      getUsbButtonStatus({
        ...runningHealth,
        serial: "probing",
        serialDetail: "probing",
      }),
    ).toBe("checking");

    expect(
      getUsbButtonStatus({
        ...runningHealth,
        serialDetail: "probe_failed",
      }),
    ).toBe("wrongDevice");

    expect(getUsbButtonStatus(runningHealth)).toBe("notDetected");
    expect(getUsbButtonStatus({ status: "not_running" })).toBe("unavailable");
  });

  it("builds setup detail lines for staff diagnostics", () => {
    expect(getSetupBridgeDetailLines(runningHealth)).toEqual([
      "Bridge version 1.0.0",
      "Looking for USB vendor 239a (Adafruit boards)",
      "No USB serial device with vendor 239a found (1 other port(s) visible).",
      "Visible USB serial: 2341:0043 at /dev/cu.usbmodem1",
    ]);
  });
});
