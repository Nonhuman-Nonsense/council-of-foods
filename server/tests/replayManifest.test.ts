import { describe, it, expect } from "vitest";
import {
    buildReplayMeetingManifest,
    isCompleteReplayManifest,
    buildResumeConversation,
    orderedAudioIdsForConversation,
    stripAwaitingHumanTail,
} from "@api/replayManifest.js";
import { BadRequestError } from "@models/Errors.js";
import { MockFactory } from "./factories/MockFactory.js";
import type { Message } from "@shared/ModelTypes.js";

const SPEAKER_ID = "speaker1";

describe("buildReplayMeetingManifest", () => {
    it("slices by maximumPlayedIndex inclusive", () => {
        const meeting = MockFactory.createMeeting({
            maximumPlayedIndex: 1,
            conversation: [
                { id: "m0", type: "message", speaker: SPEAKER_ID, text: "0" },
                { id: "m1", type: "message", speaker: SPEAKER_ID, text: "1" },
                { id: "m2", type: "message", speaker: SPEAKER_ID, text: "2" },
            ],
            audio: ["m0", "m1", "m2", "s"],
        });
        const m = buildReplayMeetingManifest(meeting);
        expect(m.conversation.map((c) => c.id)).toEqual(["m0", "m1", undefined]);
        expect(m.conversation[2].type).toBe("meeting_incomplete");
    });

    it("defaults missing maximumPlayedIndex to full conversation", () => {
        const meeting = MockFactory.createMeeting({
            conversation: [
                { id: "m0", type: "message", speaker: SPEAKER_ID, text: "0" },
                { id: "m1", type: "message", speaker: SPEAKER_ID, text: "1" },
                { id: "s", type: "summary", speaker: SPEAKER_ID, text: "x" }
            ],
            audio: ["m0", "m1", "s"],
        });
        const m = buildReplayMeetingManifest(meeting);
        expect(m.conversation).toHaveLength(3);
        expect(m.conversation[2].type).toBe("summary");
    });

    it("strips query_extension from replay tail then appends meeting_incomplete when no summary", () => {
        const meeting = MockFactory.createMeeting({
            conversation: [
                { id: "m0", type: "message", speaker: SPEAKER_ID, text: "0" },
                { type: "query_extension" },
            ],
            audio: ["m0"],
        });
        const m = buildReplayMeetingManifest(meeting);
        expect(m.conversation.map((c) => c.type)).toEqual(["message", "meeting_incomplete"]);
    });

    it("strips awaiting_human tail then appends meeting_incomplete when no summary", () => {
        const meeting = MockFactory.createMeeting({
            conversation: [
                { id: "m0", type: "message", speaker: SPEAKER_ID, text: "0" },
                {
                    type: "awaiting_human_question",
                    speaker: "human",
                    text: "",
                } as Message,
            ],
            audio: ["m0"],
        });
        const m = buildReplayMeetingManifest(meeting);
        expect(m.conversation.map((c) => c.type)).toEqual(["message", "meeting_incomplete"]);
    });

    it("orders audio ids by conversation order, not stored audio array order", () => {
        const meeting = MockFactory.createMeeting({
            conversation: [
                { id: "pub-m1", type: "message", speaker: SPEAKER_ID, text: "Hello" },
                { id: "sum1", type: "summary", speaker: SPEAKER_ID, text: "Summary" },
            ],
            audio: ["pub-m1", "sum1"],
            maximumPlayedIndex: 1,
        });
        const m = buildReplayMeetingManifest(meeting);
        expect(m.audio).toEqual(["pub-m1", "sum1"]);
    });

    it("throws BadRequestError when conversation is empty", () => {
        const meeting = MockFactory.createMeeting({
            conversation: [],
        });
        try {
            buildReplayMeetingManifest(meeting);
            expect.fail("expected BadRequestError");
        } catch (e) {
            expect(e).toBeInstanceOf(BadRequestError);
            expect((e as BadRequestError).clientMessage).toBe("No messages available for replay.");
        }
    });

    it("truncates summary if its audio is missing and appends incomplete marker", () => {
        const meeting = MockFactory.createMeeting({
            conversation: [
                { id: "m0", type: "message", speaker: SPEAKER_ID, text: "0" },
                { id: "s", type: "summary", speaker: SPEAKER_ID, text: "x" },
            ],
            audio: ["m0"],
            maximumPlayedIndex: 1,
        });
        const m = buildReplayMeetingManifest(meeting);
        expect(m.conversation.map(c => c.type)).toEqual(["message", "meeting_incomplete"]);
    });

    it("includes summary when its audio is present", () => {
        const meeting = MockFactory.createMeeting({
            conversation: [
                { id: "m0", type: "message", speaker: SPEAKER_ID, text: "0" },
                { id: "s", type: "summary", speaker: SPEAKER_ID, text: "x" },
            ],
            audio: ["m0", "s"],
            maximumPlayedIndex: 1,
        });
        const m = buildReplayMeetingManifest(meeting);
        expect(m.conversation.map(c => c.type)).toEqual(["message", "summary"]);
    });
});

describe("isCompleteReplayManifest", () => {
    it("returns true when manifest ends with summary audio", () => {
        const meeting = MockFactory.createMeeting({
            conversation: [
                { id: "m0", type: "message", speaker: SPEAKER_ID, text: "0" },
                { id: "s", type: "summary", speaker: SPEAKER_ID, text: "x" },
            ],
            audio: ["m0", "s"],
            maximumPlayedIndex: 1,
            meetingComplete: true,
        });
        expect(isCompleteReplayManifest(meeting)).toBe(true);
    });

    it("returns false when maximumPlayedIndex caps before summary", () => {
        const meeting = MockFactory.createMeeting({
            maximumPlayedIndex: 1,
            conversation: [
                { id: "m0", type: "message", speaker: SPEAKER_ID, text: "0" },
                { id: "m1", type: "message", speaker: SPEAKER_ID, text: "1" },
                { id: "m2", type: "message", speaker: SPEAKER_ID, text: "2" },
            ],
            audio: ["m0", "m1", "m2", "s"],
            meetingComplete: false,
        });
        expect(isCompleteReplayManifest(meeting)).toBe(false);
    });

    it("returns false when summary audio is missing", () => {
        const meeting = MockFactory.createMeeting({
            conversation: [
                { id: "m0", type: "message", speaker: SPEAKER_ID, text: "0" },
                { id: "s", type: "summary", speaker: SPEAKER_ID, text: "x" },
            ],
            audio: ["m0"],
            maximumPlayedIndex: 1,
            meetingComplete: false,
        });
        expect(isCompleteReplayManifest(meeting)).toBe(false);
    });

    it("returns false when conversation is empty", () => {
        const meeting = MockFactory.createMeeting({ conversation: [] });
        expect(isCompleteReplayManifest(meeting)).toBe(false);
    });

    it("returns false when meetingComplete is set but manifest is incomplete", () => {
        const meeting = MockFactory.createMeeting({
            meetingComplete: true,
            maximumPlayedIndex: 0,
            conversation: [
                { id: "m0", type: "message", speaker: SPEAKER_ID, text: "0" },
            ],
            audio: ["m0"],
        });
        expect(isCompleteReplayManifest(meeting)).toBe(false);
    });
});

describe("stripAwaitingHumanTail", () => {
    it("removes consecutive awaiting messages from the end only", () => {
        const messages: Message[] = [
            { type: "awaiting_human_question", speaker: "h", text: "" },
            { id: "x", type: "message", speaker: SPEAKER_ID, text: "mid" },
            { type: "awaiting_human_panelist", speaker: "p", text: "" },
        ];
        stripAwaitingHumanTail(messages);
        expect(messages).toHaveLength(2);
        expect(messages[0].type).toBe("awaiting_human_question");
        expect(messages[1].id).toBe("x");
    });

    it("strips a dangling invitation from the tail", () => {
        const messages: Message[] = [
            { id: "x", type: "message", speaker: SPEAKER_ID, text: "mid" },
            { id: "inv-1", type: "invitation", speaker: SPEAKER_ID, text: "please join" },
        ];
        stripAwaitingHumanTail(messages);
        expect(messages).toHaveLength(1);
        expect(messages[0].id).toBe("x");
    });

    it("strips query_extension from the tail", () => {
        const messages: Message[] = [
            { id: "x", type: "message", speaker: SPEAKER_ID, text: "mid" },
            { type: "query_extension" },
        ];
        stripAwaitingHumanTail(messages);
        expect(messages).toHaveLength(1);
        expect(messages[0].id).toBe("x");
    });
});

describe("buildResumeConversation", () => {
    it("slices by maximumPlayedIndex, truncates to audio, strips awaiting-human tail, and never appends meeting_incomplete", () => {
        const meeting = MockFactory.createMeeting({
            maximumPlayedIndex: 3,
            conversation: [
                { id: "m0", type: "message", speaker: SPEAKER_ID, text: "0" },
                { id: "m1", type: "message", speaker: SPEAKER_ID, text: "1" },
                { id: "m2", type: "message", speaker: SPEAKER_ID, text: "2" }, // no audio → truncated
                { type: "awaiting_human_question", speaker: "h", text: "" },
            ],
            audio: ["m0", "m1"],
        });
        const result = buildResumeConversation(meeting);
        expect(result.map((c) => c.id)).toEqual(["m0", "m1"]);
        expect(result.every((c) => c.type !== "meeting_incomplete")).toBe(true);
    });

    it("drops a dangling invitation from the tail when resuming", () => {
        const meeting = MockFactory.createMeeting({
            maximumPlayedIndex: 1,
            conversation: [
                { id: "m0", type: "message", speaker: SPEAKER_ID, text: "0" },
                { id: "inv-1", type: "invitation", speaker: SPEAKER_ID, text: "please join" },
            ],
            audio: ["m0", "inv-1"],
        });
        const result = buildResumeConversation(meeting);
        expect(result.map((c) => c.id)).toEqual(["m0"]);
    });

    it("returns an empty array when nothing is playable yet", () => {
        const meeting = MockFactory.createMeeting({
            maximumPlayedIndex: 0,
            conversation: [
                { type: "awaiting_human_question", speaker: "h", text: "" },
            ],
            audio: [],
        });
        expect(buildResumeConversation(meeting)).toEqual([]);
    });
});

describe("orderedAudioIdsForConversation", () => {
    it("skips messages without id or not in stored audio list", () => {
        const conv: Message[] = [
            { id: "a", type: "message", speaker: SPEAKER_ID, text: "1" },
            { type: "skipped", id: "s", speaker: SPEAKER_ID, text: "" },
            { id: "b", type: "message", speaker: SPEAKER_ID, text: "2" },
        ];
        expect(orderedAudioIdsForConversation(conv, ["b", "a"])).toEqual(["a", "b"]);
    });
});
