import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAutoplayMeeting, parseAutoplayLanguageQuery } from "@api/getAutoplayMeeting.js";
import { BadRequestError, NotFoundError } from "@models/Errors.js";

const { mockAggregateToArray, mockAggregate } = vi.hoisted(() => {
    const mockAggregateToArray = vi.fn();
    const mockAggregate = vi.fn(() => ({
        toArray: mockAggregateToArray,
    }));
    return { mockAggregateToArray, mockAggregate };
});

vi.mock("@services/DbService.js", () => ({
    meetingsCollection: {
        aggregate: mockAggregate,
    },
}));

vi.mock("@logic/GlobalOptions.js", () => ({
    getGlobalOptions: () => ({
        autoplayEarliestMeetingDate: "2025-01-01T00:00:00.000Z",
    }),
}));

describe("parseAutoplayLanguageQuery", () => {
    it("returns undefined when language is omitted", () => {
        expect(parseAutoplayLanguageQuery(undefined)).toBeUndefined();
        expect(parseAutoplayLanguageQuery("")).toBeUndefined();
    });

    it("normalizes a valid language code", () => {
        expect(parseAutoplayLanguageQuery("en")).toBe("en");
        expect(parseAutoplayLanguageQuery("SV")).toBe("sv");
    });

    it("throws on invalid language", () => {
        expect(() => parseAutoplayLanguageQuery("english")).toThrow(BadRequestError);
    });
});

describe("getAutoplayMeeting", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("returns a meeting id when aggregation samples a meetingComplete row", async () => {
        mockAggregateToArray.mockResolvedValue([{ _id: 42 }]);

        await expect(getAutoplayMeeting("en")).resolves.toEqual({ meetingId: 42 });

        expect(mockAggregate).toHaveBeenCalledWith([
            {
                $match: {
                    meetingComplete: true,
                    date: { $gte: "2025-01-01T00:00:00.000Z" },
                    audio: { $exists: true, $not: { $size: 0 } },
                    language: "en",
                },
            },
            { $sample: { size: 1 } },
        ]);
    });

    it("throws NotFoundError when the aggregation pipeline returns no candidates", async () => {
        mockAggregateToArray.mockResolvedValue([]);

        await expect(getAutoplayMeeting("en")).rejects.toBeInstanceOf(NotFoundError);
    });
});
