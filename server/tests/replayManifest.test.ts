import { describe, it, expect } from "vitest";
import {
    buildReplayMeetingManifest,
    buildResumeConversation,
    orderedAudioIdsForConversation,
    stripAwaitingHumanTail,
} from "@api/replayManifest.js";
import { MockFactory } from "./factories/MockFactory.js";
import type { Message } from "@shared/ModelTypes.js";

describe("buildReplayMeetingManifest", () => {
    it("slices by maximumPlayedIndex inclusive", () => {
        const meeting = MockFactory.createMeeting({
            maximumPlayedIndex: 1,
            conversation: [
                { id: "m0", type: "message", speaker: "water", text: "0" },
                { id: "m1", type: "message", speaker: "water", text: "1" },
                { id: "m2", type: "message", speaker: "water", text: "2" },
            ],
            audio: ["m0", "m1", "m2", "s"],
            summary: { id: "s", type: "summary", text: "x" },
        });
        const m = buildReplayMeetingManifest(meeting);
        expect(m.conversation.map((c) => c.id)).toEqual(["m0", "m1", undefined]);
        expect(m.conversation[2].type).toBe("meeting_incomplete");
    });

    it("defaults missing maximumPlayedIndex to full conversation", () => {
        const meeting = MockFactory.createMeeting({
            conversation: [
                { id: "m0", type: "message", speaker: "water", text: "0" },
                { id: "m1", type: "message", speaker: "water", text: "1" },
                { id: "s", type: "summary", text: "x" }
            ],
            audio: ["m0", "m1", "s"],
            summary: { id: "s", type: "summary", text: "x" },
        });
        const m = buildReplayMeetingManifest(meeting);
        expect(m.conversation).toHaveLength(3);
        expect(m.conversation[2].type).toBe("summary");
    });

    it("strips max_reached from replay tail then appends meeting_incomplete when no summary", () => {
        const meeting = MockFactory.createMeeting({
            conversation: [
                { id: "m0", type: "message", speaker: "water", text: "0" },
                { type: "max_reached" },
            ],
            audio: ["m0"],
        });
        const m = buildReplayMeetingManifest(meeting);
        expect(m.conversation.map((c) => c.type)).toEqual(["message", "meeting_incomplete"]);
        expect(m.summary).toBeUndefined();
    });

    it("strips awaiting_human tail then appends meeting_incomplete when no summary", () => {
        const meeting = MockFactory.createMeeting({
            conversation: [
                { id: "m0", type: "message", speaker: "water", text: "0" },
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
        expect(m.summary).toBeUndefined();
    });

    it("orders audio ids by conversation order, not stored audio array order", () => {
        const meeting = MockFactory.createMeeting({
            conversation: [
                { id: "pub-m1", type: "message", speaker: "water", text: "Hello" },
                { id: "sum1", type: "summary", speaker: "water", text: "Summary" },
            ],
            audio: ["pub-m1", "sum1"],
            summary: { id: "sum1", type: "summary", speaker: "water", text: "Summary" },
            maximumPlayedIndex: 1,
        });
        const m = buildReplayMeetingManifest(meeting);
        expect(m.audio).toEqual(["pub-m1", "sum1"]);
    });

    it("throws BadRequestError when conversation is empty", () => {
        const meeting = MockFactory.createMeeting({
            conversation: [],
        });
        expect(() => buildReplayMeetingManifest(meeting)).toThrow("No messages available for replay.");
    });

    it("truncates summary if its audio is missing and appends incomplete marker", () => {
        const meeting = MockFactory.createMeeting({
            conversation: [
                { id: "m0", type: "message", speaker: "water", text: "0" },
                { id: "s", type: "summary", text: "x" },
            ],
            audio: ["m0"],
            summary: { id: "s", type: "summary", text: "x" },
            maximumPlayedIndex: 1, // Summary is reached by the index
        });
        const m = buildReplayMeetingManifest(meeting);
        // Summary 's' is removed because it's not in 'audio', leaving 'm0'.
        // Then meeting_incomplete is added.
        expect(m.conversation.map(c => c.type)).toEqual(["message", "meeting_incomplete"]);
        expect(m.summary).toBeUndefined();
    });

    it("includes summary and hides incomplete marker when its audio is present", () => {
        const meeting = MockFactory.createMeeting({
            conversation: [
                { id: "m0", type: "message", speaker: "water", text: "0" },
                { id: "s", type: "summary", text: "x" },
            ],
            audio: ["m0", "s"],
            summary: { id: "s", type: "summary", text: "x" },
            maximumPlayedIndex: 1,
        });
        const m = buildReplayMeetingManifest(meeting);
        expect(m.conversation.map(c => c.type)).toEqual(["message", "summary"]);
        expect(m.summary).toBeDefined();
        // Since summary is the last message, it's considered complete.
    });
});

describe("stripAwaitingHumanTail", () => {
    it("removes consecutive awaiting messages from the end only", () => {
        const messages: Message[] = [
            { type: "awaiting_human_question", speaker: "h", text: "" },
            { id: "x", type: "message", speaker: "water", text: "mid" },
            { type: "awaiting_human_panelist", speaker: "p", text: "" },
        ];
        stripAwaitingHumanTail(messages);
        expect(messages).toHaveLength(2);
        expect(messages[0].type).toBe("awaiting_human_question");
        expect(messages[1].id).toBe("x");
    });

    it("strips a dangling invitation from the tail", () => {
        const messages: Message[] = [
            { id: "x", type: "message", speaker: "water", text: "mid" },
            { id: "inv-1", type: "invitation", speaker: "water", text: "please join" },
        ];
        stripAwaitingHumanTail(messages);
        expect(messages).toHaveLength(1);
        expect(messages[0].id).toBe("x");
    });

    it("strips max_reached from the tail", () => {
        const messages: Message[] = [
            { id: "x", type: "message", speaker: "water", text: "mid" },
            { type: "max_reached" },
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
                { id: "m0", type: "message", speaker: "water", text: "0" },
                { id: "m1", type: "message", speaker: "water", text: "1" },
                { id: "m2", type: "message", speaker: "water", text: "2" }, // no audio → truncated
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
                { id: "m0", type: "message", speaker: "water", text: "0" },
                { id: "inv-1", type: "invitation", speaker: "water", text: "please join" },
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
            { id: "a", type: "message", text: "1" },
            { type: "skipped", id: "s" },
            { id: "b", type: "message", text: "2" },
        ];
        expect(orderedAudioIdsForConversation(conv, ["b", "a"])).toEqual(["a", "b"]);
    });
});
