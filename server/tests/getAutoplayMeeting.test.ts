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
    const baseMatch = {
        meetingComplete: true,
        date: { $gte: "2025-01-01T00:00:00.000Z" },
        audio: { $exists: true, $not: { $size: 0 } },
        language: "en",
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it.each([
        {
            name: "without a venue, samples every venue's meetings",
            venueId: undefined,
            samples: [[{ _id: 42 }]],
            expectedMatches: [baseMatch],
        },
        {
            name: "with a venue, samples that venue's meetings",
            venueId: "havremagasinet",
            samples: [[{ _id: 42 }]],
            expectedMatches: [{ ...baseMatch, venueId: "havremagasinet" }],
        },
        {
            name: "with a venue that has none, falls back to every venue's meetings",
            venueId: "havremagasinet",
            samples: [[], [{ _id: 42 }]],
            expectedMatches: [{ ...baseMatch, venueId: "havremagasinet" }, baseMatch],
        },
    ])("$name", async ({ venueId, samples, expectedMatches }) => {
        for (const sample of samples) mockAggregateToArray.mockResolvedValueOnce(sample);

        await expect(getAutoplayMeeting("en", venueId)).resolves.toEqual({ meetingId: 42 });

        expect(mockAggregate.mock.calls).toEqual(
            expectedMatches.map((match) => [[{ $match: match }, { $sample: { size: 1 } }]]),
        );
    });

    it("throws NotFoundError when no meeting matches, even at every venue", async () => {
        mockAggregateToArray.mockResolvedValue([]);

        await expect(getAutoplayMeeting("en", "havremagasinet")).rejects.toBeInstanceOf(NotFoundError);
    });
});
