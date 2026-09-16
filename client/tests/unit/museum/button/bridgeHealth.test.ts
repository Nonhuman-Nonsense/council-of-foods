import { describe, expect, it, vi } from "vitest";
import { fetchButtonBridgeHealth } from "@/museum/button/buttonBridge";

const runningHealth = {
  ok: true,
  serial: "connected",
  path: "/dev/mock",
  version: "1.0.0",
  serialDetail: "connected",
  serialMessage: "Council button connected at /dev/mock",
  expectedVendorId: "2341",
  scannedPorts: [{ path: "/dev/mock", vendorId: "2341", productId: "8037" }],
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
      expectedVendorId: "2341",
      scannedPorts: [{ path: "/dev/mock", vendorId: "2341", productId: "8037" }],
      print: null,
    });
  });

  it("passes the print spool block through, and reports none from an older bridge", async () => {
    const print = {
      enabled: true,
      printer: { name: "Museum", state: "stopped", alerts: ["media-empty-error"], message: "Media Empty" },
      pending: 2,
      lastError: null,
      lastPrintedAt: "2026-09-16T13:37:25.610Z",
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ...runningHealth, print }) }),
    );

    await expect(fetchButtonBridgeHealth()).resolves.toMatchObject({ status: "running", print });
  });

  it("returns not_running when fetch fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("connection refused")));

    await expect(fetchButtonBridgeHealth()).resolves.toEqual({ status: "not_running" });
  });
});
