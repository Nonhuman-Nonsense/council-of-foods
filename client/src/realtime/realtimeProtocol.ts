/**
 * Inworld Realtime / OpenAI Realtime-compatible event types and session config.
 *
 * Kept separate from `src/voice` so human input and other features can share the
 * realtime session shape without pulling voice-guide UI into the tree.
 */

import type { RealtimeTool } from "@voice/guideTools";

export type SemanticVadEagerness = "low" | "medium" | "high";

export type RealtimeSemanticTurnDetection = {
  type: "semantic_vad";
  eagerness?: SemanticVadEagerness;
  create_response?: boolean;
  interrupt_response?: boolean;
};

export type RealtimeServerVadTurnDetection = {
  type: "server_vad";
  threshold?: number;
  prefix_padding_ms?: number;
  silence_duration_ms?: number;
  create_response?: boolean;
  interrupt_response?: boolean;
};

export type RealtimeTurnDetection =
  | RealtimeSemanticTurnDetection
  | RealtimeServerVadTurnDetection;

export type RealtimeSessionConfig = {
  type: "realtime";
  model: string;
  instructions: string;
  output_modalities: Array<"audio" | "text">;
  tools: RealtimeTool[];
  audio: {
    input?: {
      format?: {
        type: string;
        rate?: number;
      };
      noise_reduction?: { type: string } | null;
      transcription?: {
        model: string;
        language?: string;
        prompt?: string;
      };
      turn_detection?: RealtimeTurnDetection;
    };
    output?: {
      format?: {
        type: string;
      };
      voice: string | { id: string };
      model?: string;
      speed?: number;
    };
  };
  providerData?: Record<string, unknown>;
};

/** Subset built on the server from realtime bootstrap defaults. */
export type RealtimeSessionServerDefaults = Pick<RealtimeSessionConfig, "type" | "model" | "output_modalities" | "audio">;

export function mergeRealtimeSessionWithClientConfig(
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

/** Shape of the provider session payload sent to the shared realtime call endpoint. */
export type RealtimeCallRequest = {
  sdp: string;
  session: RealtimeSessionConfig;
};

/** Session field returned by a shared realtime bootstrap response. */
export type RealtimeSessionResponse = {
  session: RealtimeSessionServerDefaults;
};
