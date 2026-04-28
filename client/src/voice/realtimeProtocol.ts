/**
 * Inworld Realtime / OpenAI Realtime-compatible event types and session config.
 *
 * Kept as a separate module so connection logic and event-loop logic share a
 * single source of truth, and so non-React modules don't pull in React types.
 */

import type { RealtimeTool } from "./guideTools";

export type SemanticVadEagerness = "low" | "medium" | "high";

export type RealtimeTurnDetection = {
  type: "semantic_vad";
  eagerness?: SemanticVadEagerness;
  create_response?: boolean;
  interrupt_response?: boolean;
};

export type RealtimeSessionConfig = {
  type: "realtime";
  model: string;
  instructions: string;
  output_modalities: Array<"audio" | "text">;
  tools: RealtimeTool[];
  audio: {
    input?: {
      transcription?: { model: string };
      turn_detection?: RealtimeTurnDetection;
    };
    output?: {
      voice: string;
      model: string;
      speed?: number;
    };
  };
  providerData?: Record<string, unknown>;
};

/** Subset built on the server from GlobalOptions (`POST /api/voice-guide/realtime-session`). */
export type RealtimeSessionServerDefaults = Pick<RealtimeSessionConfig, "type" | "model" | "output_modalities" | "audio">;

export function mergeVoiceGuideRealtimeSession(
  defaults: RealtimeSessionServerDefaults,
  instructions: string,
  tools: RealtimeTool[]
): RealtimeSessionConfig {
  return {
    ...defaults,
    instructions,
    tools,
  };
}

/** Shape of the payload we POST to /api/voice-guide/call. */
export type RealtimeCallRequest = {
  sdp: string;
  session: RealtimeSessionConfig;
};

/** Response from `POST /api/voice-guide/realtime-session`. */
export type VoiceGuideRealtimeSessionResponse = {
  session: RealtimeSessionServerDefaults;
};
