import type { RealtimeUsageReport } from "@shared/RealtimeSessionTypes";
import { councilFetch } from "@/api/http";

/**
 * Forwards a realtime session's `response.usage` objects to the server for the footprint
 * meter (docs/ai-footprint-meter.md). The browser talks to Inworld directly, so only it
 * sees this usage.
 *
 * Each response is sent as soon as it completes, so the meter moves while the agent speaks.
 * One small POST every few seconds at most — no need for a socket. Fire and forget: a failed
 * report is dropped and nothing here can affect the session; `keepalive` lets a report sent
 * as the page closes still arrive. The server parses the raw usage; this only decides what
 * is worth sending.
 */

export type RealtimeUsageReporter = (usage: unknown) => void;

/** Usage worth reporting: Inworld's per-part breakdown with at least one part in it. */
function hasBillableParts(usage: unknown): boolean {
    if (!usage || typeof usage !== "object") return false;
    const u = usage as Record<string, unknown>;
    return ["llm", "tts", "stt"].some((part) => u[part] != null && typeof u[part] === "object");
}

export function createRealtimeUsageReporter(usageToken: string | undefined): RealtimeUsageReporter {
    return (usage) => {
        // Without a token (an older server) there is nowhere to report to.
        if (!usageToken || !hasBillableParts(usage)) return;

        const body: RealtimeUsageReport = { usageToken, usage };
        councilFetch("/api/usage/realtime", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
            keepalive: true,
        }).catch(() => {
            // Usage is a side channel; a lost report only makes the meter a little low.
        });
    };
}

/** The transcription model a realtime session's config names (`audio.input.transcription.model`), or "". */
export function transcriptionModelOf(session: Record<string, unknown> | null | undefined): string {
    const audio = session?.audio;
    if (!audio || typeof audio !== "object") return "";
    const input = (audio as { input?: unknown }).input;
    if (!input || typeof input !== "object") return "";
    const transcription = (input as { transcription?: unknown }).transcription;
    if (!transcription || typeof transcription !== "object") return "";
    const model = (transcription as { model?: unknown }).model;
    return typeof model === "string" ? model : "";
}

/** How often an open microphone's time so far is reported, so the meter moves while someone talks. */
export const MIC_TIME_FLUSH_MS = 15_000;

export interface MicTimeCounter {
    /** The microphone is sending audio. Opening twice is one opening. */
    open(): void;
    /** It stopped: reports the time since the last report. */
    close(): void;
}

/**
 * Counts speech to text by how long the microphone is open, for transcription-only sessions
 * (visitor input). They never create a response, and Inworld puts usage on nothing else — checked
 * against the live API in October 2026 — so the meter counts the audio the provider is sent. The
 * agents' sessions need none of this: each `response.done` carries the speech Inworld transcribed.
 */
export function createMicTimeCounter(
    report: RealtimeUsageReporter,
    model: string,
    now: () => number = () => Date.now(),
): MicTimeCounter {
    let since: number | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;

    const flush = () => {
        if (since === null) return;
        const at = now();
        const seconds = (at - since) / 1000;
        since = at;
        if (model && seconds > 0) report({ stt: { model, audio_seconds: seconds } });
    };

    return {
        open() {
            if (since !== null) return;
            since = now();
            timer = setInterval(flush, MIC_TIME_FLUSH_MS);
        },
        close() {
            if (timer !== null) clearInterval(timer);
            timer = null;
            flush();
            since = null;
        },
    };
}
