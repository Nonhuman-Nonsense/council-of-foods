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

        const body: RealtimeUsageReport = { usageToken, responses: [usage] };
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
