import { describe, expect, it, vi } from "vitest";
import { fetchButtonBridgeHealth } from "@/button/health";

const runningHealth = {
  ok: true,
  serial: "connected",
  path: "/dev/mock",
  version: "1.0.0",
  serialDetail: "connected",
  serialMessage: "Council button connected at /dev/mock",
  expectedVendorId: "239a",
  scannedPorts: [{ path: "/dev/mock", vendorId: "239a", productId: "8014" }],
};

describe("fetchButtonBridgeHealth", () => {
  it("returns running when health endpoint responds ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => runningHealth,
      }),
    );

    await expect(fetchButtonBridgeHealth("http://127.0.0.1:8765/health")).resolves.toEqual({
      status: "running",
      serial: "connected",
      path: "/dev/mock",
      version: "1.0.0",
      serialDetail: "connected",
      serialMessage: "Council button connected at /dev/mock",
      expectedVendorId: "239a",
      scannedPorts: [{ path: "/dev/mock", vendorId: "239a", productId: "8014" }],
    });
  });

  it("returns not_running when fetch fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("connection refused")));

    await expect(fetchButtonBridgeHealth()).resolves.toEqual({ status: "not_running" });
  });
});
