import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRealtimeOutageReporter } from "@realtime/realtimeOutage";
import { reportRealtimeIssue } from "@realtime/realtimeErrorReporting";

vi.mock("@realtime/realtimeErrorReporting", () => ({ reportRealtimeIssue: vi.fn() }));

const reportMock = vi.mocked(reportRealtimeIssue);

type Step =
    | { fail: string; wasLive?: boolean; unlimited?: boolean }
    | "recovered"
    | "gaveUp"
    | "reset";

function run(steps: Step[]) {
    const outage = createRealtimeOutageReporter("setup-agent", () => 0);
    for (const step of steps) {
        if (step === "recovered") outage.recovered();
        else if (step === "gaveUp") outage.gaveUp({ giveUpSilently: true });
        else if (step === "reset") outage.reset();
        else outage.failed({ cause: step.fail, wasLive: step.wasLive ?? false, retriesUnlimited: step.unlimited ?? false });
    }
    return reportMock.mock.calls.map(([report]) => `${report.kind}:${report.code}`);
}

const startFailed = { fail: "start-failed" };
const unlimited = (n: number) => Array.from({ length: n }, () => ({ fail: "pc_failed", unlimited: true }));

describe("realtimeOutage", () => {
    beforeEach(() => {
        reportMock.mockClear();
    });

    /**
     * ErrorBot hears about outages a visitor could notice, once each — never
     * about every attempt it took to get the agent back.
     */
    it.each([
        { name: "a start that works on its first retry", steps: [startFailed, "recovered"], reports: [] },
        { name: "a start that needs several tries", steps: [startFailed, { fail: "pc_failed" }, "recovered"], reports: ["recovered:start-failed"] },
        { name: "a live session that drops and comes straight back", steps: [{ fail: "dc_close", wasLive: true }, "recovered"], reports: ["recovered:dc_close"] },
        { name: "a bounded outage that runs out of retries", steps: [startFailed, startFailed, startFailed, startFailed, "gaveUp"], reports: ["retry-exhausted:start-failed"] },
        { name: "an unlimited outage that never ends", steps: unlimited(12), reports: ["still-down:pc_failed", "still-down:pc_failed"] },
        { name: "an outage stopped on purpose", steps: [{ fail: "dc_close", wasLive: true }, "reset", "recovered"], reports: [] },
        { name: "two separate outages", steps: [{ fail: "dc_close", wasLive: true }, "recovered", startFailed, "recovered"], reports: ["recovered:dc_close"] },
    ] as { name: string; steps: Step[]; reports: string[] }[])("reports $name as $reports", ({ steps, reports }) => {
        expect(run(steps)).toEqual(reports);
    });
});
