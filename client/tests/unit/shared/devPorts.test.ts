import { describe, expect, it } from "vitest";
import {
  DEFAULT_CLIENT_DEV_PORT,
  DEFAULT_SERVER_PORT,
  readServerPort,
  resolveDevPorts,
} from "@shared/devPorts";

describe("devPorts", () => {
  it("defaults when PORT is unset or empty", () => {
    expect(readServerPort({})).toBe(DEFAULT_SERVER_PORT);
    expect(readServerPort({ PORT: "" })).toBe(DEFAULT_SERVER_PORT);
    expect(readServerPort({ PORT: "   " })).toBe(DEFAULT_SERVER_PORT);
  });

  it("parses a valid PORT", () => {
    expect(readServerPort({ PORT: "3002" })).toBe(3002);
  });

  it("falls back for invalid PORT", () => {
    expect(readServerPort({ PORT: "nope" })).toBe(DEFAULT_SERVER_PORT);
    expect(readServerPort({ PORT: "0" })).toBe(DEFAULT_SERVER_PORT);
  });

  it("keeps foods defaults at offset 0", () => {
    expect(resolveDevPorts(DEFAULT_SERVER_PORT)).toEqual({
      server: DEFAULT_SERVER_PORT,
      clientDev: DEFAULT_CLIENT_DEV_PORT,
    });
  });

  it("offsets forest ports by one", () => {
    expect(resolveDevPorts(3002)).toEqual({
      server: 3002,
      clientDev: 5174,
    });
  });
});
