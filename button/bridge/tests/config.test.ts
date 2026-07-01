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
});
