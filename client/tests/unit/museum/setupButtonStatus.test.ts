import { describe, expect, it } from "vitest";
import {
  getBridgeAppStatus,
  getBridgeDaemonStatus,
  getUsbButtonStatus,
} from "@/museum/button/setupButtonStatus";

describe("setupButtonStatus", () => {
  it("maps bridge daemon health", () => {
    expect(getBridgeDaemonStatus({ status: "checking" })).toBe("checking");
    expect(
      getBridgeDaemonStatus({
        status: "running",
        serial: "disconnected",
        path: null,
        version: "1.0.0",
      }),
    ).toBe("running");
    expect(getBridgeDaemonStatus({ status: "not_running" })).toBe("notRunning");
    expect(getBridgeDaemonStatus({ status: "error", message: "x" })).toBe("error");
  });

  it("maps app websocket status independently of usb", () => {
    const health = {
      status: "running" as const,
      serial: "disconnected",
      path: null,
      version: "1.0.0",
    };

    expect(getBridgeAppStatus(true, health, "connecting")).toBe("connecting");
    expect(getBridgeAppStatus(true, health, "connected")).toBe("connected");
    expect(getBridgeAppStatus(true, { status: "not_running" }, "connecting")).toBe("unavailable");
  });

  it("maps usb status from health serial field", () => {
    expect(
      getUsbButtonStatus({
        status: "running",
        serial: "connected",
        path: "/dev/cu.usbmodem1",
        version: "1.0.0",
      }),
    ).toBe("connected");

    expect(
      getUsbButtonStatus({
        status: "running",
        serial: "disconnected",
        path: null,
        version: "1.0.0",
      }),
    ).toBe("notDetected");

    expect(getUsbButtonStatus({ status: "not_running" })).toBe("unavailable");
  });
});
