import { describe, it, expect, vi } from "vitest";
import {
  createMetaAgentTools,
  createMetaAgentToolHandlers,
  type MetaAgentToolContext,
} from "@/museum/metaAgent/metaAgentTools";

function makeCtx(overrides: Partial<MetaAgentToolContext> = {}): MetaAgentToolContext {
  return {
    setMeetingPlaybackPaused: vi.fn(),
    setMetaAgentActive: vi.fn(),
    onRestartMeeting: vi.fn(),
    silenceAgentOutput: vi.fn(),
    ...overrides,
  };
}

describe("createMetaAgentTools", () => {
  it("returns only continue_meeting and restart_meeting", () => {
    const tools = createMetaAgentTools();
    expect(tools.map((t) => t.name)).toEqual(["continue_meeting", "restart_meeting"]);
  });
});

describe("createMetaAgentToolHandlers", () => {
  describe("continue_meeting", () => {
    it("unfreezes meeting audio, deactivates meta agent, silences output, and suppresses continuation", () => {
      const ctx = makeCtx();
      const handlers = createMetaAgentToolHandlers(ctx);
      const result = handlers.continue_meeting({});
      expect(result).toEqual({ ok: true, suppressContinuation: true });
      expect(ctx.silenceAgentOutput).toHaveBeenCalled();
      expect(ctx.setMeetingPlaybackPaused).toHaveBeenCalledWith(false);
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
});
