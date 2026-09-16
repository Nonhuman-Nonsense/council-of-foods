import type { RealtimeUsageReport } from "@shared/RealtimeSessionTypes";
import { councilFetch } from "@/api/http";

/**
 * Forwards a realtime session's `response.usage` objects to the server for the footprint
 * meter (docs/ai-footprint-meter.md). The browser talks to Inworld directly, so only it
 * sees this usage.
 *
 * Fire and forget: usage is batched, a failed report is dropped, and nothing here can
 * affect the session. `keepalive` lets the last batch outlive a closing or reloading page.
 * The server parses the raw usage; this only decides what is worth sending.
 */

/** Responses per report. Small, so a crash loses little. */
export const USAGE_REPORT_BATCH_SIZE = 5;

export interface RealtimeUsageReporter {
    report(usage: unknown): void;
    /** Sends what is queued, e.g. when the session ends. */
    flush(): void;
    /** Flushes and stops listening for page hide. */
    dispose(): void;
}

const NOOP_REPORTER: RealtimeUsageReporter = { report() {}, flush() {}, dispose() {} };

/** Usage worth reporting: Inworld's per-part breakdown with at least one part in it. */
function hasBillableParts(usage: unknown): boolean {
    if (!usage || typeof usage !== "object") return false;
    const u = usage as Record<string, unknown>;
    return ["llm", "tts", "stt"].some((part) => u[part] != null && typeof u[part] === "object");
}

export function createRealtimeUsageReporter(usageToken: string | undefined): RealtimeUsageReporter {
    // Older servers do not hand out tokens; there is nowhere to report to.
    if (!usageToken) return NOOP_REPORTER;

    let queue: unknown[] = [];

    const flush = () => {
        if (queue.length === 0) return;
        const body: RealtimeUsageReport = { usageToken, responses: queue };
        queue = [];
        councilFetch("/api/usage/realtime", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
            keepalive: true,
        }).catch(() => {
            // Usage is a side channel; a lost batch only makes the meter a little low.
        });
    };

    window.addEventListener("pagehide", flush);

    return {
        report(usage) {
            if (!hasBillableParts(usage)) return;
            queue.push(usage);
            if (queue.length >= USAGE_REPORT_BATCH_SIZE) flush();
        },
        flush,
        dispose() {
            window.removeEventListener("pagehide", flush);
            flush();
        },
    };
}
