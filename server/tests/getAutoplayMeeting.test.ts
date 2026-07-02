import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAutoplayMeeting, parseAutoplayLanguageQuery } from "@api/getAutoplayMeeting.js";
import { BadRequestError, NotFoundError } from "@models/Errors.js";
import { MockFactory } from "./factories/MockFactory.js";

const mockAggregateToArray = vi.fn();
const mockGetMeeting = vi.fn();

vi.mock("@services/DbService.js", () => ({
    meetingsCollection: {
        aggregate: vi.fn(() => ({
            toArray: mockAggregateToArray,
        })),
    },
}));

vi.mock("@api/getMeeting.js", () => ({
    getMeeting: (...args: unknown[]) => mockGetMeeting(...args),
}));

const SPEAKER_ID = "speaker1";

function completeMeeting(overrides: Record<string, unknown> = {}) {
    return MockFactory.createMeeting({
        _id: 42,
        conversation: [
            { id: "m0", type: "message", speaker: SPEAKER_ID, text: "0" },
            { id: "s", type: "summary", speaker: SPEAKER_ID, text: "Summary" },
        ],
        audio: ["m0", "s"],
        summary: { id: "s", type: "summary", speaker: SPEAKER_ID, text: "Summary" },
        maximumPlayedIndex: 1,
        ...overrides,
    });
}

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

    it("returns a meeting id when the pipeline sample and manifest are complete", async () => {
        const stored = { _id: 42 };
        mockAggregateToArray.mockResolvedValue([stored]);
        mockGetMeeting.mockResolvedValue(completeMeeting());

        await expect(getAutoplayMeeting("en")).resolves.toEqual({ meetingId: 42 });
        expect(mockGetMeeting).toHaveBeenCalledWith(42);
        expect(mockAggregateToArray).toHaveBeenCalledTimes(1);
    });

    it("throws NotFoundError when the aggregation pipeline returns no candidates", async () => {
        mockAggregateToArray.mockResolvedValue([]);

        await expect(getAutoplayMeeting("en")).rejects.toBeInstanceOf(NotFoundError);
        expect(mockGetMeeting).not.toHaveBeenCalled();
    });

    it("throws NotFoundError when the sampled meeting fails the manifest gate", async () => {
        mockAggregateToArray.mockResolvedValue([{ _id: 1118 }]);
        mockGetMeeting.mockResolvedValue(
            completeMeeting({
                _id: 1118,
                conversation: [
                    { id: "m0", type: "message", speaker: SPEAKER_ID, text: "0" },
                    { id: "m1", type: "message", speaker: SPEAKER_ID, text: "1" },
                    { id: "s", type: "summary", speaker: SPEAKER_ID, text: "Summary" },
                ],
                audio: ["m0"],
                maximumPlayedIndex: 2,
            }),
        );

        await expect(getAutoplayMeeting("en")).rejects.toBeInstanceOf(NotFoundError);
        expect(mockGetMeeting).toHaveBeenCalledTimes(1);
    });
});
