import { describe, it, expect, vi } from "vitest";
import {
  createMetaAgentTools,
  createMetaAgentToolHandlers,
  type MetaAgentToolContext,
} from "@/museum/metaAgent/metaAgentTools";
import { getMetaAgentBundle } from "@/museum/metaAgent/metaAgentPrompt";

function makeCtx(overrides: Partial<MetaAgentToolContext> = {}): MetaAgentToolContext {
  return {
    setMetaAgentActive: vi.fn(),
    onRestartMeeting: vi.fn(),
    silenceAgentOutput: vi.fn(),
    ...overrides,
  };
}

describe("createMetaAgentTools", () => {
  it("returns only continue_meeting and restart_meeting", () => {
    const tools = createMetaAgentTools({ promptBundle: getMetaAgentBundle("en") });
    expect(tools.map((t) => t.name)).toEqual(["continue_meeting", "restart_meeting"]);
  });

  it("uses tool descriptions from the prompt bundle", () => {
    const bundle = getMetaAgentBundle("en");
    const tools = createMetaAgentTools({ promptBundle: bundle });
    expect(tools[0]?.description).toBe(bundle.toolDescriptions.continue_meeting);
    expect(tools[1]?.description).toBe(bundle.toolDescriptions.restart_meeting);
  });
});

describe("createMetaAgentToolHandlers", () => {
  describe("continue_meeting", () => {
    it("deactivates meta agent, silences output, and suppresses continuation", () => {
      const ctx = makeCtx();
      const handlers = createMetaAgentToolHandlers(ctx);
      const result = handlers.continue_meeting({});
      expect(result).toEqual({ ok: true, suppressContinuation: true });
      expect(ctx.silenceAgentOutput).toHaveBeenCalled();
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
