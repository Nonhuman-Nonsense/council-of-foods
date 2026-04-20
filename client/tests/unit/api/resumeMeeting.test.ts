import { describe, it, expect, vi, afterEach } from "vitest";
import { resumeMeeting, ResumeMeetingError } from "@/api/resumeMeeting";

/**
 * Covers `PUT /api/meetings/:id`:
 *   - request shape (method + content-type, no auth header — meetingId is the secret for this route)
 *   - 200 body is returned as `ResumeMeetingResponse` (meeting + new liveKey)
 *   - non-OK responses throw `ResumeMeetingError` with the `status` preserved and the
 *     server-provided `{ message }` string surfaced. Callers key on `status` to choose
 *     409 / 400 / 404 / generic copy, so this preservation is load-bearing.
 */
describe("resumeMeeting", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("issues a PUT with JSON content type and returns the parsed body", async () => {
        const body = {
            meeting: { _id: 42, topic: { id: "t", title: "T", description: "", prompt: "" }, characters: [], conversation: [], audio: [] },
            liveKey: "new-key",
        };
        const fetchMock = vi.fn().mockResolvedValue(
            new Response(JSON.stringify(body), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            })
        );
        vi.stubGlobal("fetch", fetchMock);

        const res = await resumeMeeting({ meetingId: 42 });

        expect(fetchMock).toHaveBeenCalledWith(
            "/api/meetings/42",
            expect.objectContaining({
                method: "PUT",
                headers: { "Content-Type": "application/json" },
            }),
        );
        expect(res.liveKey).toBe("new-key");
        expect(res.meeting._id).toBe(42);
    });

    it.each([
        [409, "This meeting is happening somewhere else"],
        [400, "MeetingAlreadyComplete"],
        [404, "Meeting not found"],
    ])("throws ResumeMeetingError preserving status %i and body message", async (status, message) => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
            new Response(JSON.stringify({ message }), {
                status,
                headers: { "Content-Type": "application/json" },
            })
        ));

        const err = await resumeMeeting({ meetingId: 7 }).catch((e) => e);

        expect(err).toBeInstanceOf(ResumeMeetingError);
        expect(err.status).toBe(status);
        expect(err.message).toBe(message);
    });

    it("falls back to a status-based message when the error body is not JSON", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
            new Response("oops", { status: 500 })
        ));

        const err = await resumeMeeting({ meetingId: 1 }).catch((e) => e);

        expect(err).toBeInstanceOf(ResumeMeetingError);
        expect(err.status).toBe(500);
        expect(err.message).toBe("Resume meeting failed (500)");
    });
});
