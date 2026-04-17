import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resumeMeeting } from "@api/resumeMeeting.js";
import { meetingsCollection } from "@services/DbService.js";
import type { StoredMeeting } from "@models/DBModels.js";
import type { Message } from "@shared/ModelTypes.js";
import {
    clearLiveSessionRegistryForTests,
    tryAcquireLiveSession,
} from "@logic/liveSessionRegistry.js";
import { MockFactory } from "./factories/MockFactory.js";

async function seedMeeting(overrides: Partial<StoredMeeting> = {}): Promise<StoredMeeting> {
    const meeting = MockFactory.createStoredMeeting({
        _id: 777,
        creatorKey: "original-key",
        conversation: [],
        audio: [],
        ...overrides,
    });
    await meetingsCollection.insertOne(meeting);
    return meeting;
}

describe("resumeMeeting (server)", () => {
    beforeEach(async () => {
        clearLiveSessionRegistryForTests();
        await meetingsCollection.deleteMany({});
    });

    afterEach(() => {
        clearLiveSessionRegistryForTests();
    });

    it("rotates creatorKey, sanitizes the conversation, trims audio, and returns the updated public meeting", async () => {
        const conversation: Message[] = [
            { id: "m0", type: "message", speaker: "water", text: "0" },
            { id: "m1", type: "message", speaker: "water", text: "1" },
            { id: "m2", type: "message", speaker: "water", text: "2" }, // no audio → truncated away
            { type: "awaiting_human_question", speaker: "h", text: "" },
        ];
        await seedMeeting({
            conversation,
            audio: ["m0", "m1", "orphan"],
            maximumPlayedIndex: 3,
        });

        const response = await resumeMeeting(777);

        expect(response.creatorKey).not.toBe("original-key");
        expect(response.creatorKey).toMatch(/^[0-9a-f-]{36}$/i);
        expect(response.meeting._id).toBe(777);
        expect(response.meeting).not.toHaveProperty("creatorKey");

        const stored = await meetingsCollection.findOne({ _id: 777 });
        expect(stored?.creatorKey).toBe(response.creatorKey);
        expect(stored?.conversation.map((c) => c.id)).toEqual(["m0", "m1"]);
        expect(stored?.audio).toEqual(["m0", "m1"]);
        // `maximumPlayedIndex` is intentionally *not* reset here — the live session will
        // advance it via `report_maximum_played_index` as the user replays, and keeping
        // the old value preserves the replay-GET cap for any concurrent replay viewer.
        expect(stored?.maximumPlayedIndex).toBe(3);
        expect(stored?.state).toEqual({ alreadyInvited: false });

        expect(response.meeting.conversation.map((c) => c.id)).toEqual(["m0", "m1"]);
        expect(response.meeting.audio).toEqual(["m0", "m1"]);
        expect(response.meeting.maximumPlayedIndex).toBe(3);
    });

    it("strips a dangling invitation at the tail", async () => {
        await seedMeeting({
            conversation: [
                { id: "m0", type: "message", speaker: "water", text: "0" },
                { id: "inv-1", type: "invitation", speaker: "water", text: "please join" },
            ],
            audio: ["m0", "inv-1"],
            maximumPlayedIndex: 1,
        });

        const response = await resumeMeeting(777);
        expect(response.meeting.conversation.map((c) => c.id)).toEqual(["m0"]);
        const stored = await meetingsCollection.findOne({ _id: 777 });
        expect(stored?.audio).toEqual(["m0"]);
    });

    it("rejects with ConflictError when a live session holds the meeting", async () => {
        await seedMeeting({
            conversation: [{ id: "m0", type: "message", speaker: "water", text: "0" }],
            audio: ["m0"],
            maximumPlayedIndex: 0,
        });
        tryAcquireLiveSession(777, "some-socket", "some-key");

        await expect(resumeMeeting(777)).rejects.toThrow(/somewhere else/);
        const stored = await meetingsCollection.findOne({ _id: 777 });
        expect(stored?.creatorKey).toBe("original-key");
    });

    it("rejects with BadRequestError when the meeting already has a summary", async () => {
        await seedMeeting({
            conversation: [{ id: "m0", type: "message", speaker: "water", text: "0" }],
            audio: ["m0"],
            summary: { id: "s", type: "summary", text: "done" },
            maximumPlayedIndex: 0,
        });

        await expect(resumeMeeting(777)).rejects.toThrow(/MeetingAlreadyComplete/);
        const stored = await meetingsCollection.findOne({ _id: 777 });
        expect(stored?.creatorKey).toBe("original-key");
    });

    it("rejects with NotFoundError for an unknown meeting id", async () => {
        await expect(resumeMeeting(9_999_999)).rejects.toThrow();
    });

    it("is idempotent-ish: a second resume rotates to yet another creatorKey", async () => {
        await seedMeeting({
            conversation: [{ id: "m0", type: "message", speaker: "water", text: "0" }],
            audio: ["m0"],
            maximumPlayedIndex: 0,
        });

        const first = await resumeMeeting(777);
        const second = await resumeMeeting(777);
        expect(second.creatorKey).not.toBe(first.creatorKey);
        expect(second.creatorKey).not.toBe("original-key");

        const stored = await meetingsCollection.findOne({ _id: 777 });
        expect(stored?.creatorKey).toBe(second.creatorKey);
    });
});
