import { describe, expect, it, vi } from "vitest";
import {
    buildAutoplayBaseMatch,
    buildAutoplaySamplePipeline,
} from "@api/autoplayMeetingQuery.js";

vi.mock("@logic/GlobalOptions.js", () => ({
    getGlobalOptions: () => ({
        autoplayEarliestMeetingDate: "2025-01-01T00:00:00.000Z",
    }),
}));

describe("buildAutoplayBaseMatch", () => {
    it("includes date, summary, and audio guards", () => {
        expect(buildAutoplayBaseMatch()).toMatchObject({
            summary: { $exists: true, $ne: null },
            date: { $gte: "2025-01-01T00:00:00.000Z" },
            audio: { $exists: true, $not: { $size: 0 } },
        });
    });

    it("adds language when provided", () => {
        expect(buildAutoplayBaseMatch("en")).toMatchObject({ language: "en" });
    });
});

describe("buildAutoplaySamplePipeline", () => {
    it("matches base filter, cap-summary eligibility, then samples once", () => {
        const pipeline = buildAutoplaySamplePipeline("en");

        expect(pipeline[0]).toEqual({
            $match: expect.objectContaining({ language: "en" }),
        });
        expect(pipeline.some((stage) => "$addFields" in stage && "_capIndex" in (stage as { $addFields: object }).$addFields)).toBe(true);
        expect(pipeline.some((stage) => "$match" in stage && "_cappedLast.type" in (stage as { $match: object }).$match)).toBe(true);
        expect(pipeline.at(-1)).toEqual({ $sample: { size: 1 } });
    });
});
