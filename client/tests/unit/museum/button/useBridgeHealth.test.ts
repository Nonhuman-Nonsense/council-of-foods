import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { fetchButtonBridgeHealth } from "@/museum/button/health";

describe("useButtonBridgeHealth integration", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetchButtonBridgeHealth maps a healthy bridge", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          ok: true,
          serial: "connected",
          path: "mock",
          version: "1.0.0",
          serialDetail: "connected",
          serialMessage: "Council button connected at mock",
          expectedVendorId: "2341",
          scannedPorts: [],
        }),
      }),
    );

    await expect(fetchButtonBridgeHealth("http://127.0.0.1:8765/health")).resolves.toEqual({
      status: "running",
      serial: "connected",
      path: "mock",
      version: "1.0.0",
      serialDetail: "connected",
      serialMessage: "Council button connected at mock",
      expectedVendorId: "2341",
      scannedPorts: [],
    });
  });

  it("fetchButtonBridgeHealth maps fetch failures to not_running", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    await expect(fetchButtonBridgeHealth()).resolves.toEqual({ status: "not_running" });
  });
});
