import type { RealtimeFunctionTool, ToolHandler, ToolResult } from "@voice/guideTools";
import { log } from "@/logger";

export type MetaAgentToolContext = {
  setMeetingPlaybackPaused: (paused: boolean) => void;
  setMetaAgentActive: (active: boolean) => void;
  onRestartMeeting: () => void;
  /** Mute agent audio and clear captions when exiting via a terminal tool. */
  silenceAgentOutput: () => void;
};

export function createMetaAgentTools(): RealtimeFunctionTool[] {
  return [
    {
      type: "function",
      name: "continue_meeting",
      description:
        "Return to the council meeting after a visitor interaction. Call when the visitor is done, says goodbye, or wants to keep watching. Do not speak after calling this.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
    {
      type: "function",
      name: "restart_meeting",
      description:
        "Restart the entire meeting from the beginning, returning to the setup screen. Use when the visitor wants to start over. Do not speak after calling this.",
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
      log.event("META", "continue_meeting done", { ok: true, suppressContinuation: true });
      return { ok: true, suppressContinuation: true };
    },

    restart_meeting: (): ToolResult => {
      log.event("META", "restart_meeting handler");
      ctx.silenceAgentOutput();
      ctx.onRestartMeeting();
      log.event("META", "restart_meeting done", { ok: true, suppressContinuation: true });
      return { ok: true, suppressContinuation: true };
    },
  };
}
