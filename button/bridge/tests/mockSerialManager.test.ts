import { describe, expect, it } from "vitest";
import { PONG } from "../../../shared/buttonProtocol.js";
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
});
