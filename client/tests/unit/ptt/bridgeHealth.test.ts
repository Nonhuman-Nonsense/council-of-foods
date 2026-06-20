import { describe, expect, it, vi } from "vitest";
import { fetchBridgeHealth } from "@/ptt/bridgeHealth";

describe("fetchBridgeHealth", () => {
  it("returns running when health endpoint responds", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          ok: true,
          serial: "connected",
          path: "/dev/cu.usbmodem1",
          version: "1.0.0",
        }),
      }),
    );

    await expect(fetchBridgeHealth("http://127.0.0.1:8765/health")).resolves.toEqual({
      status: "running",
      serial: "connected",
      path: "/dev/cu.usbmodem1",
      version: "1.0.0",
    });

    vi.unstubAllGlobals();
  });

  it("returns not_running when fetch fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Failed to fetch")));

    await expect(fetchBridgeHealth()).resolves.toEqual({ status: "not_running" });

    vi.unstubAllGlobals();
  });
});
