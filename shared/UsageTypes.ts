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
    feature: UsageFeature;
    /** Who we called, e.g. "inworld". */
    provider: string;
    /** The model as requested or reported, e.g. "mistral/mistral-large-3". */
    model: string;
    measures: UsageMeasures;
    /** Data-centre region, when the provider tells us (e.g. ElevenLabs' `x-region` header). */
    region?: string;
    meetingId?: number;
    /**
     * The conversation position the usage produced or served, so the meter can count it once
     * that message has been played. Absent for live usage (realtime agents, visitor questions).
     */
    messageIndex?: number;
    venueId?: string;
    /**
     * The setup-agent conversation the usage was for. It starts before any meeting exists, so its
     * usage is tagged with this and given the meeting's id once the meeting is created.
     */
    setupId?: string;
}

export interface UsageEvent extends UsageRecord {
    ts: Date;
}
