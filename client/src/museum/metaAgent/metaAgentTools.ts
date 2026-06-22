import type { RealtimeFunctionTool, ToolHandler, ToolResult } from "@voice/guideTools";

export type MetaAgentToolContext = {
  setPaused: (paused: boolean) => void;
  setMetaAgentActive: (active: boolean) => void;
  onRestartMeeting: () => void;
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
        "Resume the council meeting after a visitor interaction. Call this when the visitor is done talking to you and wants to continue watching the meeting.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
    {
      type: "function",
      name: "restart_meeting",
      description:
        "Restart the entire meeting from the beginning, returning to the setup screen. Use this when the visitor wants to start over with a new topic or new participants.",
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
      ctx.setMetaAgentActive(false);
      ctx.setPaused(false);
      return { ok: true };
    },

    restart_meeting: () => {
      ctx.onRestartMeeting();
      return { ok: true };
    },

    continue_meeting: () => notAvailableYet(),

    wrap_up_meeting: () => notAvailableYet(),
  };
}
