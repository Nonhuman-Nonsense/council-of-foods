import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { log, summarizeLogPayload } from "@/logger";

const mockGetDevLogEnabled = vi.fn(() => true);
const mockIsDevLogCategoryEnabled = vi.fn(() => true);

vi.mock("@/settings/councilSettings", () => ({
  getDevLogEnabled: () => mockGetDevLogEnabled(),
  isDevLogCategoryEnabled: (category: string) => mockIsDevLogCategoryEnabled(category),
}));

describe("logger", () => {
  beforeEach(() => {
    mockGetDevLogEnabled.mockReturnValue(false);
    mockIsDevLogCategoryEnabled.mockReturnValue(false);
  });

  it("log.event is a no-op when master logging is off", () => {
    const groupSpy = vi.spyOn(console, "groupCollapsed").mockImplementation(() => undefined);
    log.event("API", "GET /api/meetings");
    expect(groupSpy).not.toHaveBeenCalled();
    groupSpy.mockRestore();
  });
});

describe("summarizeLogPayload", () => {
  it("truncates long strings and blob fields", () => {
    const summary = summarizeLogPayload({
      id: "clip-1",
      audioBase64: "A".repeat(400),
      note: "hello",
    }) as Record<string, unknown>;

    expect(summary.id).toBe("clip-1");
    expect(summary.note).toBe("hello");
    expect(summary.audioBase64).toBe("[audioBase64 400 chars]");
  });
});

describe("logEvent", () => {
  let logEvent: typeof import("../../src/logger").logEvent;

  beforeEach(async () => {
    vi.resetModules();
    mockGetDevLogEnabled.mockReturnValue(true);
    mockIsDevLogCategoryEnabled.mockReturnValue(true);
    const mod = await import("../../src/logger");
    logEvent = mod.logEvent;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("mirrors ERROR to console.error when structured ERROR logging is off", () => {
    mockGetDevLogEnabled.mockReturnValue(false);
    mockIsDevLogCategoryEnabled.mockReturnValue(false);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const groupSpy = vi.spyOn(console, "groupCollapsed").mockImplementation(() => undefined);
    const err = new Error("socket down");

    logEvent("ERROR", "socket connect_error", err);

    expect(errorSpy).toHaveBeenCalledWith("[Council] socket connect_error", err);
    expect(groupSpy).not.toHaveBeenCalled();
  });

  it("uses structured ERROR groups when ERROR category is enabled", () => {
    mockGetDevLogEnabled.mockReturnValue(true);
    mockIsDevLogCategoryEnabled.mockImplementation((category) => category === "ERROR");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const groupSpy = vi.spyOn(console, "groupCollapsed").mockImplementation(() => undefined);

    logEvent("ERROR", "response.failed", { code: "server_error" });

    expect(groupSpy).toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
  });

  it("does not emit non-ERROR categories when master logging is off", () => {
    mockGetDevLogEnabled.mockReturnValue(false);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    logEvent("API", "GET /api/meetings");

    expect(logSpy).not.toHaveBeenCalled();
  });
});

describe("reportTerminalError", () => {
  it("does not POST client reports outside production", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 204 }));
    const { reportTerminalError } = await import("@/logger");
    reportTerminalError("test.source", "boom", new Error("cause"));
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
