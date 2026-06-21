import { describe, expect, it } from "vitest";
import {
  HELLO_COUNCIL,
  PONG,
  READY_COUNCIL_BUTTON,
} from "../../../shared/buttonProtocol.js";
import { MockSerialManager } from "../src/mockSerialManager.js";

describe("MockSerialManager", () => {
  it("opens mock device and responds to PING with PONG", async () => {
    const serial = new MockSerialManager();
    const lines: string[] = [];

    serial.on("line", ({ text }) => lines.push(text));
    serial.start();

    expect(serial.isOpen()).toBe(true);
    expect(serial.getOpenPath()).toBe("mock");

    await serial.writeLine("PING");
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(lines).toContain(PONG);
    await serial.stop();
    expect(serial.isOpen()).toBe(false);
  });

  it("responds to HELLO_COUNCIL with READY council-button", async () => {
    const serial = new MockSerialManager();
    const lines: string[] = [];
    serial.on("line", ({ text }) => lines.push(text));
    serial.start();

    await serial.writeLine(HELLO_COUNCIL);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(lines).toContain(READY_COUNCIL_BUTTON);
    await serial.stop();
  });

  it("usb disconnect and reconnect emit open/close and button sync line", async () => {
    const serial = new MockSerialManager();
    const events: string[] = [];
    serial.on("open", () => events.push("open"));
    serial.on("close", () => events.push("close"));
    serial.on("line", ({ text }) => events.push(text));

    serial.start();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(events).toContain("open");

    serial.simulateUsbDisconnect("unplugged");
    expect(serial.isOpen()).toBe(false);
    expect(events).toContain("close");

    events.length = 0;
    serial.simulateUsbReconnect(true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(serial.isOpen()).toBe(true);
    expect(events).toEqual(["open", "BUTTON_DOWN"]);

    await serial.stop();
  });
});
