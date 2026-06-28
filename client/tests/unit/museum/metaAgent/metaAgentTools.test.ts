import { describe, it, expect, vi } from "vitest";
import {
  createExtensionAgentTools,
  createExtensionAgentToolHandlers,
  createMetaAgentTools,
  createMetaAgentToolHandlers,
  type ExtensionAgentToolContext,
  type MetaAgentToolContext,
} from "@/museum/metaAgent/metaAgentTools";
import { getMetaAgentBundle } from "@/museum/metaAgent/metaAgentPrompt";

function makeCtx(overrides: Partial<MetaAgentToolContext> = {}): MetaAgentToolContext {
  return {
    setMetaAgentPhase: vi.fn(),
    onRestartMeeting: vi.fn(),
    silenceAgentOutput: vi.fn(),
    reconfigureSession: vi.fn(),
    ...overrides,
  };
}

function makeExtensionCtx(
  overrides: Partial<ExtensionAgentToolContext> = {},
): ExtensionAgentToolContext {
  return {
    setMetaAgentPhase: vi.fn(),
    onExtendMeeting: vi.fn(),
    onConcludeMeeting: vi.fn(),
    silenceAgentOutput: vi.fn(),
    reconfigureSession: vi.fn(),
    ...overrides,
  };
}

describe("createMetaAgentTools", () => {
  it("returns only resume_meeting and restart_meeting", () => {
    const tools = createMetaAgentTools({ promptBundle: getMetaAgentBundle("en") });
    expect(tools.map((t) => t.name)).toEqual(["resume_meeting", "restart_meeting"]);
  });

  it("uses tool descriptions from the prompt bundle", () => {
    const bundle = getMetaAgentBundle("en");
    const tools = createMetaAgentTools({ promptBundle: bundle });
    expect(tools[0]?.description).toBe(bundle.toolDescriptions.resume_meeting);
    expect(tools[1]?.description).toBe(bundle.toolDescriptions.restart_meeting);
  });
});

describe("createExtensionAgentTools", () => {
  it("returns only extend_meeting and conclude_meeting", () => {
    const tools = createExtensionAgentTools({ promptBundle: getMetaAgentBundle("en") });
    expect(tools.map((t) => t.name)).toEqual(["extend_meeting", "conclude_meeting"]);
  });

  it("uses extension tool descriptions from the prompt bundle", () => {
    const bundle = getMetaAgentBundle("en");
    const tools = createExtensionAgentTools({ promptBundle: bundle });
    expect(tools[0]?.description).toBe(bundle.extensionToolDescriptions.extend_meeting);
    expect(tools[1]?.description).toBe(bundle.extensionToolDescriptions.conclude_meeting);
  });
});

describe("createMetaAgentToolHandlers", () => {
  describe("resume_meeting", () => {
    it("deactivates meta agent, silences output, reconfigures, and suppresses continuation", () => {
      const ctx = makeCtx();
      const handlers = createMetaAgentToolHandlers(ctx);
      const result = handlers.resume_meeting({});
      expect(result).toEqual({ ok: true, suppressContinuation: true });
      expect(ctx.silenceAgentOutput).toHaveBeenCalled();
      expect(ctx.setMetaAgentPhase).toHaveBeenCalledWith("inactive");
      expect(ctx.reconfigureSession).toHaveBeenCalled();
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

describe("createExtensionAgentToolHandlers", () => {
  describe("extend_meeting", () => {
    it("extends meeting, deactivates meta agent, silences output, and reconfigures", () => {
      const ctx = makeExtensionCtx();
      const handlers = createExtensionAgentToolHandlers(ctx);
      const result = handlers.extend_meeting({});
      expect(result).toEqual({ ok: true, suppressContinuation: true });
      expect(ctx.onExtendMeeting).toHaveBeenCalled();
      expect(ctx.silenceAgentOutput).toHaveBeenCalled();
      expect(ctx.setMetaAgentPhase).toHaveBeenCalledWith("inactive");
      expect(ctx.reconfigureSession).toHaveBeenCalled();
    });
  });

  describe("conclude_meeting", () => {
    it("concludes meeting, deactivates meta agent, silences output, and reconfigures", () => {
      const ctx = makeExtensionCtx();
      const handlers = createExtensionAgentToolHandlers(ctx);
      const result = handlers.conclude_meeting({});
      expect(result).toEqual({ ok: true, suppressContinuation: true });
      expect(ctx.onConcludeMeeting).toHaveBeenCalled();
      expect(ctx.silenceAgentOutput).toHaveBeenCalled();
      expect(ctx.setMetaAgentPhase).toHaveBeenCalledWith("inactive");
      expect(ctx.reconfigureSession).toHaveBeenCalled();
    });
  });
});
