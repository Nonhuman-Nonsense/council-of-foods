/**
 * Raw AI usage, as the providers report it.
 *
 * Every event stores the units the provider itself counts in (tokens, characters,
 * audio seconds) — never energy or water. Converting usage into a footprint happens
 * at display time, so the methodology can change without migrating data.
 * See docs/ai-footprint-meter.md.
 */

export const USAGE_MEASURES = [
    "input_tokens",
    "output_tokens",
    "cached_input_tokens",
    "reasoning_tokens",
    "input_audio_tokens",
    "output_audio_tokens",
    /** Characters billed by a text-to-speech provider. */
    "characters",
    /** Seconds of audio produced (TTS) or processed (transcription). */
    "audio_seconds",
    /** Wall-clock time of the request, which footprint models such as EcoLogits use. */
    "request_seconds",
] as const;

export type UsageMeasure = typeof USAGE_MEASURES[number];

export type UsageMeasures = Partial<Record<UsageMeasure, number>>;

export type UsageFeature =
    | "dialogue"
    | "summary"
    | "classifier"
    | "tts"
    | "subtitle-timing"
    | "setup-agent"
    | "meta-agent"
    | "human-input";

export interface UsageRecord {
    /** Server-side calls are recorded by the server; realtime calls are reported by the client. */
    source: "server" | "client";
    feature: UsageFeature;
    /** Who we called, e.g. "inworld". */
    provider: string;
    /** The model as requested or reported, e.g. "mistral/mistral-large-3". */
    model: string;
    measures: UsageMeasures;
    /** Data-centre region, when the provider tells us (e.g. ElevenLabs' `x-region` header). */
    region?: string;
    meetingId?: number;
    installationId?: string;
}

export interface UsageEvent extends UsageRecord {
    ts: Date;
}
