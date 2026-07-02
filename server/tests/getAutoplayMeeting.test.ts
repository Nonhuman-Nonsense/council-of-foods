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

    it("returns a meeting id when the manifest is complete", async () => {
        const stored = { _id: 42 };
        mockAggregateToArray.mockResolvedValue([stored]);
        mockGetMeeting.mockResolvedValue(completeMeeting());

        await expect(getAutoplayMeeting("en")).resolves.toEqual({ meetingId: 42 });
        expect(mockGetMeeting).toHaveBeenCalledWith(42);
    });

    it("resamples when the manifest is incomplete", async () => {
        const incomplete = { _id: 1118 };
        const complete = { _id: 99 };
        mockAggregateToArray
            .mockResolvedValueOnce([incomplete])
            .mockResolvedValueOnce([complete]);
        mockGetMeeting
            .mockResolvedValueOnce(
                completeMeeting({
                    _id: 1118,
                    maximumPlayedIndex: 0,
                    conversation: [
                        { id: "m0", type: "message", speaker: SPEAKER_ID, text: "0" },
                        { id: "s", type: "summary", speaker: SPEAKER_ID, text: "Summary" },
                    ],
                }),
            )
            .mockResolvedValueOnce(completeMeeting({ _id: 99 }));

        await expect(getAutoplayMeeting("en")).resolves.toEqual({ meetingId: 99 });
        expect(mockGetMeeting).toHaveBeenCalledTimes(2);
    });

    it("throws NotFoundError when no complete meeting is found", async () => {
        const incomplete = { _id: 1118 };
        mockAggregateToArray.mockResolvedValue([incomplete]);
        mockGetMeeting.mockResolvedValue(
            completeMeeting({
                _id: 1118,
                maximumPlayedIndex: 0,
                audio: ["m0"],
            }),
        );

        await expect(getAutoplayMeeting("en")).rejects.toBeInstanceOf(NotFoundError);
    });
});
