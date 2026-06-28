import type { RealtimeFunctionTool, ToolHandler, ToolResult } from "@voice/guideTools";
import type { MetaAgentPromptBundle } from "./metaAgentPrompt";
import type { MetaAgentPhase } from "./useMetaAgent";
import { log } from "@/logger";

export type MetaAgentToolContext = {
  setMetaAgentPhase: (phase: MetaAgentPhase) => void;
  onRestartMeeting: () => void;
  /** Mute agent audio and clear captions when exiting via a terminal tool. */
  silenceAgentOutput: () => void;
};

export function createMetaAgentTools(params: {
  promptBundle: MetaAgentPromptBundle;
}): RealtimeFunctionTool[] {
  const copy = params.promptBundle.toolDescriptions;
  return [
    {
      type: "function",
      name: "resume_meeting",
      description: copy.resume_meeting,
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
    {
      type: "function",
      name: "restart_meeting",
      description: copy.restart_meeting,
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  ];
}

export function createMetaAgentToolHandlers(ctx: MetaAgentToolContext): Record<string, ToolHandler> {
  return {
    resume_meeting: (): ToolResult => {
      log.event("META", "resume_meeting handler");
      ctx.silenceAgentOutput();
      ctx.setMetaAgentPhase("inactive");
      return { ok: true, suppressContinuation: true };
    },

    restart_meeting: (): ToolResult => {
      log.event("META", "restart_meeting handler");
      ctx.silenceAgentOutput();
      ctx.onRestartMeeting();
      return { ok: true, suppressContinuation: true };
    },
  };
}
