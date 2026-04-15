import { describe, it, expect } from "vitest";
import {
    buildReplayMeetingManifest,
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
            summary: { id: "s", type: "summary", text: "x" },
        });
        const m = buildReplayMeetingManifest(meeting);
        expect(m.conversation.map((c) => c.id)).toEqual(["m0", "m1"]);
    });

    it("defaults missing maximumPlayedIndex to full conversation", () => {
        const meeting = MockFactory.createMeeting({
            conversation: [
                { id: "m0", type: "message", speaker: "water", text: "0" },
                { id: "m1", type: "message", speaker: "water", text: "1" },
            ],
            summary: { id: "s", type: "summary", text: "x" },
        });
        const m = buildReplayMeetingManifest(meeting);
        expect(m.conversation).toHaveLength(2);
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
            audio: [],
        });
        const m = buildReplayMeetingManifest(meeting);
        expect(m.conversation.map((c) => c.type)).toEqual(["message", "meeting_incomplete"]);
        expect(m.summary).toBeUndefined();
    });

    it("orders audio ids by conversation order, not stored audio array order", () => {
        const meeting = MockFactory.createMeeting({
            conversation: [
                { id: "first", type: "message", speaker: "water", text: "a" },
                { id: "second", type: "message", speaker: "water", text: "b" },
            ],
            audio: ["second", "first"],
            summary: { id: "s", type: "summary", text: "x" },
        });
        const m = buildReplayMeetingManifest(meeting);
        expect(m.audio).toEqual(["first", "second"]);
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
