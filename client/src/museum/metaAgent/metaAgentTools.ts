import type { RealtimeFunctionTool, ToolHandler, ToolResult } from "@realtime/realtimeTools";
import type { MetaAgentPromptBundle } from "./metaAgentPrompt";
import type { MetaAgentPhase } from "./useMetaAgent";
import { log } from "@/logger";

export type MetaAgentToolContext = {
  setMetaAgentPhase: (phase: MetaAgentPhase) => void;
  onRestartMeeting: () => void;
  /** Mute agent audio and clear captions when exiting via a terminal tool. */
  silenceAgentOutput: () => void;
  /** Reset session to interruption defaults after a terminal tool. */
  reconfigureSession: () => void;
};

export type ExtensionAgentToolContext = {
  setMetaAgentPhase: (phase: MetaAgentPhase) => void;
  onExtendMeeting: () => void;
  onConcludeMeeting: () => void;
  silenceAgentOutput: () => void;
  reconfigureSession: () => void;
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

export function createExtensionAgentTools(params: {
  promptBundle: MetaAgentPromptBundle;
}): RealtimeFunctionTool[] {
  const copy = params.promptBundle.extensionToolDescriptions;
  return [
    {
      type: "function",
      name: "extend_meeting",
      description: copy.extend_meeting,
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
    {
      type: "function",
      name: "conclude_meeting",
      description: copy.conclude_meeting,
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
      ctx.reconfigureSession();
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

export function createExtensionAgentToolHandlers(
  ctx: ExtensionAgentToolContext,
): Record<string, ToolHandler> {
  return {
    extend_meeting: (): ToolResult => {
      log.event("META", "extend_meeting handler");
      ctx.silenceAgentOutput();
      ctx.onExtendMeeting();
      ctx.setMetaAgentPhase("inactive");
      ctx.reconfigureSession();
      return { ok: true, suppressContinuation: true };
    },

    conclude_meeting: (): ToolResult => {
      log.event("META", "conclude_meeting handler");
      ctx.silenceAgentOutput();
      ctx.onConcludeMeeting();
      ctx.setMetaAgentPhase("inactive");
      ctx.reconfigureSession();
      return { ok: true, suppressContinuation: true };
    },
  };
}
