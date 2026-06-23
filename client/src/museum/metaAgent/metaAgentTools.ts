import type { RealtimeFunctionTool, ToolHandler, ToolResult } from "@voice/guideTools";

export type MetaAgentToolContext = {
  setAudioPaused: (paused: boolean) => void;
  setMetaAgentActive: (active: boolean) => void;
  onRestartMeeting: () => void;
  /** Mute agent audio and clear captions when exiting via a terminal tool. */
  silenceAgentOutput: () => void;
};

function notAvailableYet(): ToolResult {
  return { ok: false, error: "Not available yet" };
}

export function createMetaAgentTools(): RealtimeFunctionTool[] {
  return [
    {
      type: "function",
      name: "resume_meeting",
      description:
        "Resume the council meeting after a visitor interaction. Call when the visitor is done and wants to continue watching. Do not speak after calling this.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
    {
      type: "function",
      name: "restart_meeting",
      description:
        "Restart the entire meeting from the beginning, returning to the setup screen. Use when the visitor wants to start over. Do not speak after calling this.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
    {
      type: "function",
      name: "continue_meeting",
      description: "Continue the meeting past the end-of-meeting prompt.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
    {
      type: "function",
      name: "wrap_up_meeting",
      description: "Wrap up and generate a summary of the meeting.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  ];
}

export function createMetaAgentToolHandlers(ctx: MetaAgentToolContext): Record<string, ToolHandler> {
  return {
    resume_meeting: () => {
      ctx.silenceAgentOutput();
      ctx.setMetaAgentActive(false);
      ctx.setAudioPaused(false);
      return { ok: true, suppressContinuation: true };
    },

    restart_meeting: () => {
      ctx.silenceAgentOutput();
      ctx.onRestartMeeting();
      return { ok: true, suppressContinuation: true };
    },

    continue_meeting: () => notAvailableYet(),

    wrap_up_meeting: () => notAvailableYet(),
  };
}
