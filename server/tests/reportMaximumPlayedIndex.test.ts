import { describe, it, expect, beforeEach, vi } from "vitest";
import { meetingsCollection } from "@services/DbService.js";
import { clearLiveSessionRegistryForTests, tryAcquireLiveSession } from "@logic/liveSessionRegistry.js";
import { createTestManager } from "./commonSetup.js";
import { MockFactory } from "./factories/MockFactory.js";

describe("report_maximum_played_index (MeetingManager)", () => {
    beforeEach(() => {
        clearLiveSessionRegistryForTests();
        vi.restoreAllMocks();
    });

    it("writes $max when live holder sends a valid index", async () => {
        const updateSpy = vi.spyOn(meetingsCollection, "updateOne").mockResolvedValue({ acknowledged: true } as never);

        const { manager, mockSocket } = createTestManager();
        mockSocket.id = "holder-socket";
        const meeting = MockFactory.createStoredMeeting({
            _id: 501,
            conversation: [
                { id: "a", type: "message", speaker: "water", text: "1" },
                { id: "b", type: "message", speaker: "water", text: "2" },
                { id: "c", type: "message", speaker: "water", text: "3" },
            ],
        });
        manager.meeting = meeting;

        expect(tryAcquireLiveSession(501, "holder-socket", meeting.liveKey)).toBe(true);

        await manager.handleEvent("report_maximum_played_index", { index: 2 });

        expect(updateSpy).toHaveBeenCalledWith({ _id: 501 }, { $max: { maximumPlayedIndex: 2 } });
        expect(meeting.maximumPlayedIndex).toBe(2);
    });

    it("does not update when socket is not the live session holder", async () => {
        const updateSpy = vi.spyOn(meetingsCollection, "updateOne").mockResolvedValue({ acknowledged: true } as never);

        const { manager, mockSocket } = createTestManager();
        mockSocket.id = "intruder-socket";
        const meeting = MockFactory.createStoredMeeting({
            _id: 502,
            conversation: [{ id: "a", type: "message", speaker: "water", text: "1" }],
        });
        manager.meeting = meeting;

        tryAcquireLiveSession(502, "real-holder", meeting.liveKey);

        await manager.handleEvent("report_maximum_played_index", { index: 0 });

        expect(updateSpy).not.toHaveBeenCalled();
        expect(meeting.maximumPlayedIndex).toBeUndefined();
    });

    it("does not update when index is out of range", async () => {
        const updateSpy = vi.spyOn(meetingsCollection, "updateOne").mockResolvedValue({ acknowledged: true } as never);

        const { manager, mockSocket } = createTestManager();
        mockSocket.id = "holder-socket";
        const meeting = MockFactory.createStoredMeeting({
            _id: 503,
            conversation: [{ id: "a", type: "message", speaker: "water", text: "1" }],
        });
        manager.meeting = meeting;
        tryAcquireLiveSession(503, "holder-socket", meeting.liveKey);

        await manager.handleEvent("report_maximum_played_index", { index: 99 });

        expect(updateSpy).not.toHaveBeenCalled();
    });

    it("keeps in-memory maximumPlayedIndex at local max when client sends a lower index", async () => {
        vi.spyOn(meetingsCollection, "updateOne").mockResolvedValue({ acknowledged: true } as never);

        const { manager, mockSocket } = createTestManager();
        mockSocket.id = "holder-socket";
        const meeting = MockFactory.createStoredMeeting({
            _id: 504,
            conversation: [
                { id: "a", type: "message", speaker: "water", text: "1" },
                { id: "b", type: "message", speaker: "water", text: "2" },
            ],
            maximumPlayedIndex: 1,
        });
        manager.meeting = meeting;
        tryAcquireLiveSession(504, "holder-socket", meeting.liveKey);

        await manager.handleEvent("report_maximum_played_index", { index: 0 });

        expect(meeting.maximumPlayedIndex).toBe(1);
    });
});
