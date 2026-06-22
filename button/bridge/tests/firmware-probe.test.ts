import { describe, expect, it } from "vitest";
import { HELLO_COUNCIL, READY_COUNCIL_BUTTON } from "../../../shared/buttonProtocol.js";
import { MockSerialManager } from "../src/mockSerialManager.js";

describe("firmware probe protocol", () => {
  it("mock device answers HELLO_COUNCIL with READY council-button", async () => {
    const serial = new MockSerialManager();
    const lines: string[] = [];
    serial.on("line", ({ text }) => lines.push(text));
    serial.start();

    await serial.writeLine(HELLO_COUNCIL);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(lines).toContain(READY_COUNCIL_BUTTON);
    await serial.stop();
  });
});
