import type { RealtimeFunctionTool, ToolHandler, ToolResult } from "@voice/guideTools";

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
      ctx.silenceAgentOutput();
      ctx.setMetaAgentActive(false);
      ctx.setMeetingPlaybackPaused(false);
      return { ok: true, suppressContinuation: true };
    },

    restart_meeting: (): ToolResult => {
      ctx.silenceAgentOutput();
      ctx.onRestartMeeting();
      return { ok: true, suppressContinuation: true };
    },
  };
}
