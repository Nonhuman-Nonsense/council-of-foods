import type { RealtimeFunctionTool, ToolHandler, ToolResult } from "@voice/guideTools";
import type { MetaAgentPromptBundle } from "./metaAgentPrompt";
import { log } from "@/logger";

export type MetaAgentToolContext = {
  setMeetingPlaybackPaused: (paused: boolean) => void;
  setMetaAgentActive: (active: boolean) => void;
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
      name: "continue_meeting",
      description: copy.continue_meeting,
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
    continue_meeting: (): ToolResult => {
      log.event("META", "continue_meeting handler");
      ctx.silenceAgentOutput();
      ctx.setMetaAgentActive(false);
      ctx.setMeetingPlaybackPaused(false);
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
