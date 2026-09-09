import { describe, it, expect, vi, beforeEach } from "vitest";
import {
    reportRealtimeIssue,
    resetRealtimeIssueCounts,
    shouldReportOccurrence,
} from "@realtime/realtimeErrorReporting";
import { reportTerminalError } from "@/logger";

vi.mock("@/logger", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/logger")>();
    return { ...actual, reportTerminalError: vi.fn() };
});

const reportMock = vi.mocked(reportTerminalError);

describe("realtimeErrorReporting", () => {
    beforeEach(() => {
        reportMock.mockClear();
        resetRealtimeIssueCounts();
    });

    /**
     * A wedged kiosk can raise the same error every few seconds for hours.
     * ErrorBot is read by people, so the schedule has to stay noisy enough to
     * notice a rare fault and quiet enough to survive a persistent one.
     */
    it("thins repeats without ever going fully silent", () => {
        const reported = Array.from({ length: 400 }, (_, i) => i + 1).filter(shouldReportOccurrence);

        expect(reported.slice(0, 5)).toEqual([1, 2, 3, 5, 10]);
        expect(reported).toContain(300);
        expect(reported.length).toBeLessThan(20);
        expect(shouldReportOccurrence(0)).toBe(false);
    });

    it("counts each feature/kind/code separately", () => {
        reportRealtimeIssue({ feature: "setup-agent", kind: "turn-recovered", message: "a", code: "x" });
        reportRealtimeIssue({ feature: "setup-agent", kind: "turn-recovered", message: "a", code: "y" });
        reportRealtimeIssue({ feature: "council", kind: "turn-recovered", message: "a", code: "x" });
        reportRealtimeIssue({ feature: "setup-agent", kind: "provider-error", message: "a", code: "x" });

        // All four are a first occurrence of their own key.
        expect(reportMock).toHaveBeenCalledTimes(4);
        // The 4th repeat of one key is skipped by the schedule.
        reportMock.mockClear();
        for (let i = 0; i < 3; i++) {
            reportRealtimeIssue({ feature: "setup-agent", kind: "turn-recovered", message: "a", code: "x" });
        }
        expect(reportMock).toHaveBeenCalledTimes(2);
    });

    /**
     * Severity/impact decide whether a report pages anyone: a reconnect the
     * visitor never notices must not look like a dead session.
     */
    it.each([
        { kind: "provider-error" as const, severity: "warning", clientImpact: "none" },
        { kind: "connection-lost" as const, severity: "warning", clientImpact: "none" },
        { kind: "turn-recovered" as const, severity: "warning", clientImpact: "none" },
        { kind: "retry-exhausted" as const, severity: "error", clientImpact: "terminal" },
    ])("reports $kind as $severity/$clientImpact", ({ kind, severity, clientImpact }) => {
        reportRealtimeIssue({ feature: "setup-agent", kind, message: "boom" });

        expect(reportMock).toHaveBeenCalledWith(
            `realtime.setup-agent.${kind}`,
            expect.stringContaining("boom"),
            expect.anything(),
            { severity, clientImpact },
        );
    });
});
