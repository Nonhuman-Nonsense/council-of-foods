import { describe, it, expect, vi, beforeEach } from "vitest";
import { log } from "@/logger";

describe("logger (noop in vitest)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("log.event is a no-op under vitest alias", () => {
    const groupSpy = vi.spyOn(console, "groupCollapsed");
    log.event("API", "GET /api/meetings");
    expect(groupSpy).not.toHaveBeenCalled();
  });
});
