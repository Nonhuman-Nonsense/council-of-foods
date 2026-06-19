import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearSerialDebugLog,
  getSerialDebugLogText,
  serialDebugLog,
  serialDebugLogError,
} from "@/serial/debugLog";

describe("serialDebugLog", () => {
  beforeEach(() => {
    clearSerialDebugLog();
    vi.clearAllMocks();
  });

  it("records entries and formats copy text", () => {
    serialDebugLog("test", "hello", { value: 1 });
    serialDebugLogError("test", "boom", new Error("device lost"));

    const text = getSerialDebugLogText();
    expect(text).toContain("test: hello");
    expect(text).toContain("boom");
    expect(text).toContain("device lost");
  });

  it("clears entries", () => {
    serialDebugLog("test", "one");
    clearSerialDebugLog();
    expect(getSerialDebugLogText()).toBe("");
  });
});
