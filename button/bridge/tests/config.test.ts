import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";

describe("loadConfig", () => {
  const env = { ...process.env };

  afterEach(() => {
    process.env = { ...env };
  });

  it("reads mock serial and port from env", () => {
    process.env.BUTTON_BRIDGE_PORT = "9999";
    process.env.BUTTON_MOCK_SERIAL = "1";

    expect(loadConfig()).toMatchObject({
      host: "127.0.0.1",
      port: 9999,
      mockSerial: true,
    });
  });

  it("defaults to local bridge port", () => {
    delete process.env.BUTTON_BRIDGE_PORT;
    delete process.env.BUTTON_MOCK_SERIAL;

    expect(loadConfig().port).toBe(8765);
    expect(loadConfig().mockSerial).toBe(false);
  });

  it.each([
    [undefined, null],
    ["1", "ok"],
    ["fail", "fail"],
    ["paper-out", "paper-out"],
    ["stuck", "stuck"],
  ])("BRIDGE_MOCK_PRINTER=%s selects mock printer %s", (value, expected) => {
    if (value === undefined) delete process.env.BRIDGE_MOCK_PRINTER;
    else process.env.BRIDGE_MOCK_PRINTER = value;

    expect(loadConfig().mockPrinter).toBe(expected);
  });

  it("prints to the system default printer from a local spool unless configured", () => {
    delete process.env.BRIDGE_PRINTER;
    delete process.env.BRIDGE_PRINT_SPOOL_DIR;
    delete process.env.BRIDGE_PRINT_ENABLED;

    expect(loadConfig()).toMatchObject({
      printEnabled: true,
      printer: null,
      printSpoolDir: path.resolve(".print-spool"),
    });

    process.env.BRIDGE_PRINTER = "Museum_Printer";
    process.env.BRIDGE_PRINT_SPOOL_DIR = "/Library/Application Support/Council Bridge/print";
    process.env.BRIDGE_PRINT_ENABLED = "0";

    expect(loadConfig()).toMatchObject({
      printEnabled: false,
      printer: "Museum_Printer",
      printSpoolDir: "/Library/Application Support/Council Bridge/print",
    });
  });
});
