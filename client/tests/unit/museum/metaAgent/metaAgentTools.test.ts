import { describe, it, expect, vi } from "vitest";
import {
  createMetaAgentTools,
  createMetaAgentToolHandlers,
  type MetaAgentToolContext,
} from "@/museum/metaAgent/metaAgentTools";

function makeCtx(overrides: Partial<MetaAgentToolContext> = {}): MetaAgentToolContext {
  return {
    setPaused: vi.fn(),
    setMetaAgentActive: vi.fn(),
    onRestartMeeting: vi.fn(),
    silenceAgentOutput: vi.fn(),
    ...overrides,
  };
}

describe("createMetaAgentTools", () => {
  it("returns all expected tool names", () => {
    const tools = createMetaAgentTools();
    const names = tools.map((t) => t.name);
    expect(names).toContain("resume_meeting");
    expect(names).toContain("restart_meeting");
    expect(names).toContain("continue_meeting");
    expect(names).toContain("wrap_up_meeting");
  });
});

describe("createMetaAgentToolHandlers", () => {
  describe("resume_meeting", () => {
    it("unpauses the meeting, deactivates meta agent, silences output, and suppresses continuation", () => {
      const ctx = makeCtx();
      const handlers = createMetaAgentToolHandlers(ctx);
      const result = handlers.resume_meeting({});
      expect(result).toEqual({ ok: true, suppressContinuation: true });
      expect(ctx.silenceAgentOutput).toHaveBeenCalled();
      expect(ctx.setPaused).toHaveBeenCalledWith(false);
      expect(ctx.setMetaAgentActive).toHaveBeenCalledWith(false);
    });
  });

  describe("restart_meeting", () => {
    it("calls onRestartMeeting, silences output, and suppresses continuation", () => {
      const ctx = makeCtx();
      const handlers = createMetaAgentToolHandlers(ctx);
      const result = handlers.restart_meeting({});
      expect(result).toEqual({ ok: true, suppressContinuation: true });
      expect(ctx.silenceAgentOutput).toHaveBeenCalled();
      expect(ctx.onRestartMeeting).toHaveBeenCalled();
    });
  });

  describe("placeholder tools", () => {
    it("continue_meeting returns not-available error", () => {
      const ctx = makeCtx();
      const handlers = createMetaAgentToolHandlers(ctx);
      const result = handlers.continue_meeting({});
      expect(result).toMatchObject({ ok: false });
    });

    it("wrap_up_meeting returns not-available error", () => {
      const ctx = makeCtx();
      const handlers = createMetaAgentToolHandlers(ctx);
      const result = handlers.wrap_up_meeting({});
      expect(result).toMatchObject({ ok: false });
    });
  });
});
